/**
 * OS PREÇOS SÃO NOSSOS — o motor deixa de os pedir à MetaApi.
 *
 * ═══ PORQUE ═════════════════════════════════════════════════════════════════════════════════
 *
 * Até aqui o preço de cada tick vinha do `terminalState` de uma ligação de streaming da MetaApi,
 * e isso trazia três problemas de uma só vez:
 *
 *  1. sem conta DEPLOYADA na MetaApi não há preço nenhum. A 26/09/2026 as cinco mestras estavam
 *     UNDEPLOYED e o motor passou 3 horas a receber ticks da nossa fonte e a NÃO avaliar nada,
 *     com 355 falhas de subscrição no log («you have no accounts deployed yet»);
 *  2. o preço ficava preso a um fornecedor que a regra da casa já tinha empurrado para o fim da
 *     linha: a MetaApi entrega ORDENS às contas dos clientes, não é a nossa fonte de cotações;
 *  3. cada símbolo subscrito é crédito gasto num token partilhado com a entrega das trades — a
 *     coisa que não pode falhar.
 *
 * ═══ O QUE ISTO É ═══════════════════════════════════════════════════════════════════════════
 *
 * Um leitor da `funded_precos` — a tabela que a NOSSA cadeia escreve (o espelho dos ticks do
 * terminal MT5 do conector, e as fontes de recurso quando o terminal não tem o símbolo). Lê de
 * `intervaloMs` em `intervaloMs` para memória; o motor pergunta-lhe o preço a cada tick sem
 * tocar na rede.
 *
 * ═══ A REGRA QUE NÃO SE PARTE ═══════════════════════════════════════════════════════════════
 *
 * UM PREÇO VELHO NÃO É UM PREÇO. Acima de `tectoIdadeMs` devolve-se `null`, e `null` significa
 * «não sei» — as regras de gestão não decidem sem preço (ver lib/gestao-real). Isto não é zelo
 * abstracto: hoje é sábado, o forex fechou sexta às 20:59:59 UTC, e a `funded_precos` continua a
 * ser REESCRITA a cada poucos segundos com a cotação do fecho. Sem tecto, o motor leria «fresco»
 * o preço de sexta e podia mexer um stop com ele. A hora que conta é a do MERCADO quando ela
 * existe (`em_mercado`, que só o conector sabe dizer), e a da escrita apenas quando não existe —
 * e por isso um preço sem hora de mercado tem um tecto mais curto, porque não se pode provar que
 * é de agora.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PrecoNosso {
  simbolo: string
  bid: number
  ask: number
  /** Hora do MERCADO em ms, quando a fonte a sabe (só o conector). */
  emMercado: number | null
  /** Hora a que nós o escrevemos, em ms. Sempre presente. */
  em: number
}

/** Tectos por omissão. Deliberadamente curtos: o motor decide sobre stops. */
export const TECTO_COM_HORA_MERCADO_MS = 30_000
export const TECTO_SEM_HORA_MERCADO_MS = 10_000

/**
 * QUANTO TEMPO UM PREÇO PODE ESTAR PARADO ANTES DE DEIXAR DE CONTAR.
 *
 * Isto tapa um buraco que a hora de escrita, sozinha, não tapava — e que foi medido neste mesmo
 * sábado, com a guarda acima já escrita: GBPUSD, USDJPY, NAS100, US30, US500, UK100 e USOIL
 * estavam a ser REESCRITOS a cada poucos segundos, sem hora de mercado, com a cotação do fecho de
 * sexta. Pelo tecto de escrita passavam como frescos. Pareciam vivos e eram o fecho.
 *
 * A regra que os distingue não precisa de calendário nem de lista de feriados, e é por isso que é
 * esta: um mercado ABERTO mexe. Se o bid e o ask são exactamente os mesmos há dois minutos, ou o
 * mercado está fechado ou a fonte congelou — e nos dois casos não se decide sobre aquele preço.
 * Dois minutos são largos de propósito: num momento calmo um par pode não mexer dez segundos, mas
 * não fica dois minutos ao milésimo igual.
 *
 * Quem tem hora de mercado não passa por aqui: essa hora é prova directa, e é melhor do que
 * inferir vida a partir do movimento.
 */
export const TECTO_PARADO_MS = 120_000

export interface Tectos {
  comHoraMercado: number
  semHoraMercado: number
  parado: number
}

export const TECTOS: Tectos = {
  comHoraMercado: TECTO_COM_HORA_MERCADO_MS,
  semHoraMercado: TECTO_SEM_HORA_MERCADO_MS,
  parado: TECTO_PARADO_MS,
}

/** O mesmo valor visto antes, e desde quando não muda. */
export interface Movimento {
  bid: number
  ask: number
  /** Desde que ms é que este par bid/ask é o mesmo. */
  desde: number
}

/** Mexeu? Um valor novo faz nascer um movimento novo; igual, mantém o «desde». */
export function acompanhar(anterior: Movimento | null, p: PrecoNosso, agora: number): Movimento {
  if (anterior && anterior.bid === p.bid && anterior.ask === p.ask) return anterior
  return { bid: p.bid, ask: p.ask, desde: agora }
}

/**
 * Este preço serve para decidir, contando também com o movimento?
 *
 * Sem hora de mercado exige as duas coisas: escrita recente E ter mexido dentro do tecto de
 * paragem. Um `movimento` a `null` significa que é a primeira vez que o vemos — e aí dá-se-lhe o
 * benefício da dúvida, porque a alternativa era o motor ficar dois minutos cego a cada arranque.
 */
export function utilizavelComMovimento(
  p: PrecoNosso,
  agora: number,
  movimento: Movimento | null,
  tectos: Tectos = TECTOS,
): boolean {
  if (!utilizavel(p, agora, tectos)) return false
  if (p.emMercado != null) return true
  if (!movimento) return true
  return agora - movimento.desde <= tectos.parado
}

/**
 * Quantos ms tem este preço, pela medida mais honesta disponível.
 *
 * Com hora de mercado é essa que manda: é a única que diz que a corretora viu isto agora. Sem
 * ela, só sabemos quando o gravámos — e reescrever a mesma cotação não a torna nova, e é por
 * isso que o tecto de quem não tem hora de mercado é mais apertado.
 */
export function idadeMs(p: PrecoNosso, agora: number): number {
  return agora - (p.emMercado ?? p.em)
}

/** Este preço serve para decidir? */
export function utilizavel(p: PrecoNosso, agora: number, tectos: Tectos = TECTOS): boolean {
  if (!(p.bid > 0) || !(p.ask > 0)) return false
  const tecto = p.emMercado != null ? tectos.comHoraMercado : tectos.semHoraMercado
  return idadeMs(p, agora) <= tecto
}

/** (bid+ask)/2 — a MESMA conta que a ligação da MetaApi fazia, para a sombra continuar comparável. */
export function medio(p: PrecoNosso): number {
  return (p.bid + p.ask) / 2
}

/**
 * O nome da corretora → o nosso nome canónico.
 *
 * As posições vêm com o símbolo como a corretora o escreve (`XAUUSD.s`, `EURUSD.pro`, `US30-STD`)
 * e a `funded_precos` guarda o canónico. Sem isto, uma posição em `XAUUSD.s` não encontrava preço
 * nenhum e o motor ficava calado precisamente no símbolo que mais negociamos. Só se corta o que
 * vem depois de um separador — nunca letras do próprio nome, que dava o preço do instrumento
 * errado. É a mesma regra de `services/funded-motor/fonte-conector-mt5.ts`.
 */
export function canonico(bruto: string, mapa?: ReadonlyMap<string, string>): string {
  const s = (bruto ?? '').trim().toUpperCase()
  if (!s) return ''
  const directo = mapa?.get(s)
  if (directo) return directo
  const cortado = s.replace(/[.\-_+][A-Z0-9]{1,6}$/i, '')
  return mapa?.get(cortado) ?? cortado
}

export interface OpcoesFonte {
  db: SupabaseClient
  /** De quanto em quanto tempo se relê a tabela. */
  intervaloMs?: number
  tectos?: Tectos
  /** Mapa opcional de nomes de corretora → canónico (MOTOR_REAL_MAPA_SIMBOLOS). */
  mapa?: ReadonlyMap<string, string>
  log?: (...a: unknown[]) => void
}

/**
 * A fonte viva. `preco(simbolo)` devolve o médio utilizável, ou `null` — e `null` é a resposta
 * certa em três casos que não se distinguem de propósito: não conhecemos o símbolo, o preço está
 * velho, ou nunca conseguimos ler a tabela. Nos três, o motor não deve decidir.
 */
export class PrecosNossos {
  private mapaPrecos = new Map<string, PrecoNosso>()
  /** Desde quando é que cada símbolo não mexe. Ver `TECTO_PARADO_MS`. */
  private movimentos = new Map<string, Movimento>()
  private temporizador: NodeJS.Timeout | null = null
  private parado = false
  leituras = 0
  falhas = 0
  ultimaLeituraEm = 0

  constructor(private readonly o: OpcoesFonte) {}

  private get intervalo() { return this.o.intervaloMs ?? 1_000 }
  private get tectos() { return this.o.tectos ?? TECTOS }

  async iniciar(): Promise<void> {
    await this.ler()
    const bater = () => {
      if (this.parado) return
      this.temporizador = setTimeout(async () => {
        await this.ler()
        bater()
      }, this.intervalo)
      // Um relógio de preços não pode ser o que segura o processo vivo.
      this.temporizador.unref?.()
    }
    bater()
  }

  parar(): void {
    this.parado = true
    if (this.temporizador) clearTimeout(this.temporizador)
    this.temporizador = null
  }

  private async ler(): Promise<void> {
    try {
      const { data, error } = await this.o.db.from('funded_precos').select('symbol, bid, ask, em, em_mercado')
      if (error) throw new Error(error.message)
      const novo = new Map<string, PrecoNosso>()
      for (const r of data ?? []) {
        const l = r as { symbol: string; bid: number | string; ask: number | string; em: string; em_mercado: string | null }
        const bid = Number(l.bid)
        const ask = Number(l.ask)
        if (!(bid > 0) || !(ask > 0)) continue
        const em = Date.parse(l.em)
        const emMercado = l.em_mercado ? Date.parse(l.em_mercado) : null
        novo.set(canonico(l.symbol, this.o.mapa), {
          simbolo: String(l.symbol),
          bid,
          ask,
          em: Number.isFinite(em) ? em : Date.now(),
          emMercado: emMercado != null && Number.isFinite(emMercado) ? emMercado : null,
        })
      }
      // Quem mexeu, e quem está parado. Faz-se ANTES de trocar o mapa, e só para os símbolos que
      // vieram nesta leitura: um símbolo que desapareça da tabela não deve deixar memória atrás.
      const agora = Date.now()
      const movimentos = new Map<string, Movimento>()
      for (const [chave, preco] of novo) {
        movimentos.set(chave, acompanhar(this.movimentos.get(chave) ?? null, preco, agora))
      }
      this.movimentos = movimentos
      // Substitui-se o mapa inteiro de uma vez: assim o motor nunca lê meia leitura.
      this.mapaPrecos = novo
      this.leituras++
      this.ultimaLeituraEm = Date.now()
    } catch (e) {
      this.falhas++
      // NÃO se limpa o que já se tinha: os tectos de idade já o descartam quando envelhecer. Uma
      // falha de rede não deve ser um apagão de preços — deve ser um preço a envelhecer.
      this.o.log?.('[precos-nossos] leitura falhou:', e instanceof Error ? e.message : e)
    }
  }

  bruto(simbolo: string): PrecoNosso | null {
    return this.mapaPrecos.get(canonico(simbolo, this.o.mapa)) ?? null
  }

  /** O médio utilizável, ou null. Ver a regra no topo do ficheiro. */
  preco(simbolo: string, agora = Date.now()): number | null {
    const chave = canonico(simbolo, this.o.mapa)
    const p = this.mapaPrecos.get(chave)
    if (!p) return null
    if (!utilizavelComMovimento(p, agora, this.movimentos.get(chave) ?? null, this.tectos)) return null
    return medio(p)
  }

  resumo(agora = Date.now()): { simbolos: number; utilizaveis: number; comHoraMercado: number; parados: number; leituras: number; falhas: number; idadeLeituraS: number | null } {
    let utilizaveis = 0
    let comHora = 0
    let parados = 0
    for (const [chave, p] of this.mapaPrecos) {
      const mov = this.movimentos.get(chave) ?? null
      if (utilizavelComMovimento(p, agora, mov, this.tectos)) utilizaveis++
      else if (utilizavel(p, agora, this.tectos)) parados++
      if (p.emMercado != null) comHora++
    }
    return {
      simbolos: this.mapaPrecos.size,
      utilizaveis,
      comHoraMercado: comHora,
      parados,
      leituras: this.leituras,
      falhas: this.falhas,
      idadeLeituraS: this.ultimaLeituraEm ? Math.round((agora - this.ultimaLeituraEm) / 1000) : null,
    }
  }
}
