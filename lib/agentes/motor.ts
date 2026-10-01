/**
 * O MOTOR DE AVALIAÇÃO — pega na regra de vida e aplica-a à equipa que está na base.
 *
 * A decisão não está aqui: está em `vida.ts`, e este ficheiro não tem opinião nenhuma sobre quem
 * deve parar. O que faz é as três coisas chatas que a regra não pode fazer sozinha:
 *
 *  1. **monta os factos.** A base guarda `orcamento` e `gasto`; a regra pede `saldo`. A base guarda
 *     totais; a regra pede também a janela das 48 h. Montar isto mal é a maneira mais fácil de
 *     matar o agente errado sem nunca ver um erro no ecrã — por isso a montagem é pura e provada;
 *  2. **escreve o que a regra mandou**, e só isso;
 *  3. **deixa rasto.** Um agente que aparece «parado» sem motivo escrito é um agente que ninguém
 *     vai conseguir defender nem recuperar.
 *
 * ═══ PORQUE É QUE O `saldo` NÃO ESTÁ NA BASE ═══════════════════════════════════════════════
 *
 * Porque seria um terceiro número a poder discordar dos outros dois. `orcamento - gasto` calculado
 * na leitura está certo por construção; um `saldo` guardado está certo só enquanto ninguém se
 * esquecer de o actualizar — e quando discordar do `gasto`, ninguém sabe qual deles mente.
 *
 * ═══ A JANELA SOMA-SE DOS EVENTOS, E ISSO É DE PROPÓSITO ═══════════════════════════════════
 *
 * `agentes_equipa.receita` é o acumulado de sempre. A regra das 48 h precisa do que aconteceu
 * AGORA, e isso só existe em `agentes_eventos` — que é o livro do que realmente se passou, com
 * data. Somar de lá é a diferença entre «a regra das 48 h existe» e «a regra das 48 h existe no
 * comentário»: era este o defeito que a separação janela/acumulado em `vida.ts` veio corrigir.
 */
import {
  JANELA_HORAS,
  julgar,
  type Agente,
  type EstadoAgente,
  type Juizo,
} from './vida'

/** Uma linha de `agentes_equipa`, como o PostgREST a devolve (numéricos podem vir em texto). */
export interface LinhaAgente {
  id: string
  nome: string
  papel?: string | null
  pilar: string
  pai_id?: string | null
  estado: string
  pausado?: boolean | null
  instrucoes?: string | null
  orcamento?: number | string | null
  gasto?: number | string | null
  receita?: number | string | null
  chave_receita?: string | null
  avaliado_em?: string | null
  parado_em?: string | null
  parado_porque?: string | null
  criado_em?: string | null
}

/** O que se somou de `agentes_eventos` dentro da janela, para um agente. */
export interface SomasJanela {
  receita: number
  gasto: number
}

/** Um evento do livro, reduzido ao que o motor precisa de ler. */
export interface EventoLido {
  agente_id: string
  tipo: string
  valor?: number | string | null
  criado_em: string
}

/**
 * `numero` existe porque o PostgREST devolve `numeric` como STRING.
 *
 * `Number(null)` é 0 e `Number('')` é 0 — ambos convenientes e ambos errados aqui, porque um gasto
 * que não se conseguiu ler passaria por «não gastou nada» e mantinha vivo um agente que devia
 * parar. Tudo o que não for um número legível é 0 explicitamente, mas a montagem SINALIZA quando
 * um campo obrigatório veio ilegível (ver `montarAgente`).
 */
function numero(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? n : 0
}

function legivel(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n)
}

const PILARES = new Set(['trading', 'educacao', 'desenvolvimento', 'ceo'])
const ESTADOS = new Set<EstadoAgente>(['vivo', 'em_risco', 'parado', 'pausado', 'reformado'])

/**
 * SOMAR A JANELA.
 *
 * Só conta `receita` e `gastou`. `nasceu` tem o orçamento no campo `valor` e somá-lo como receita
 * dava a todos os agentes 10 $ de lucro imaginário no dia em que nasceram — ou seja, a regra nunca
 * parava ninguém na primeira avaliação.
 */
export function somarJanela(
  eventos: EventoLido[],
  agora: Date = new Date(),
  janelaHoras: number = JANELA_HORAS,
): Map<string, SomasJanela> {
  const limite = agora.getTime() - janelaHoras * 3_600_000
  const fora = new Map<string, SomasJanela>()
  for (const e of eventos) {
    if (e.tipo !== 'receita' && e.tipo !== 'gastou') continue
    const t = Date.parse(String(e.criado_em))
    // Um evento sem data legível não entra: incluí-lo era deixar o acaso decidir a janela.
    if (!Number.isFinite(t) || t < limite) continue
    // Eventos no futuro também não: um relógio trocado criava receita que ainda não existe.
    if (t > agora.getTime()) continue
    const atual = fora.get(e.agente_id) ?? { receita: 0, gasto: 0 }
    const v = Math.abs(numero(e.valor))
    if (e.tipo === 'receita') atual.receita += v
    else atual.gasto += v
    fora.set(e.agente_id, atual)
  }
  return fora
}

export interface AgenteMontado {
  agente: Agente
  /**
   * Campos que vieram ilegíveis da base. Quando isto não está vazio, o agente NÃO é julgado: ver
   * `planearJuizo`. Um agente cujo orçamento não se consegue ler não se mata por dúvida.
   */
  ilegivel: string[]
}

/**
 * MONTAR UM AGENTE PARA A REGRA.
 *
 * A parte delicada é o `saldo`: é `orcamento - gasto`, e nunca negativo. Um saldo negativo
 * propagava-se para `podeGastar` e para o painel como se o agente tivesse dívida, quando o que
 * aconteceu foi gastar-se mais do que o orçamento — que é informação diferente e vive no `gasto`.
 */
export function montarAgente(linha: LinhaAgente, somas?: SomasJanela): AgenteMontado {
  const ilegivel: string[] = []
  if (!legivel(linha.orcamento)) ilegivel.push('orcamento')
  if (!legivel(linha.gasto)) ilegivel.push('gasto')
  if (!linha.criado_em) ilegivel.push('criado_em')

  const orcamento = numero(linha.orcamento)
  const gasto = numero(linha.gasto)

  const pilar = PILARES.has(linha.pilar) ? (linha.pilar as Agente['pilar']) : 'desenvolvimento'
  if (!PILARES.has(linha.pilar)) ilegivel.push('pilar')

  const estado = ESTADOS.has(linha.estado as EstadoAgente) ? (linha.estado as EstadoAgente) : 'vivo'
  if (!ESTADOS.has(linha.estado as EstadoAgente)) ilegivel.push('estado')

  return {
    ilegivel,
    agente: {
      id: String(linha.id),
      nome: String(linha.nome ?? ''),
      pilar,
      estado,
      criado_em: String(linha.criado_em ?? ''),
      gasto,
      receita: numero(linha.receita),
      // Quando não há somas para este agente, a janela é ZERO e não «desconhecida»: nenhum evento
      // em 48 h significa que nada aconteceu, e é isso que a regra tem de julgar.
      receita_janela: somas?.receita ?? 0,
      gasto_janela: somas?.gasto ?? 0,
      saldo: Math.max(0, Number((orcamento - gasto).toFixed(2))),
    },
  }
}

/** Uma escrita que o motor vai fazer. Sem efeitos: é só a intenção, para poder ser inspeccionada. */
export interface Escrita {
  agente_id: string
  nome: string
  /** O estado novo, ou `null` quando o estado não muda. */
  estado: EstadoAgente | null
  /** O evento a gravar no livro, ou `null` quando não há nada que valha uma linha. */
  evento: { tipo: 'avaliado' | 'avisado' | 'parou'; valor: number; detalhe: string } | null
  parado_em: string | null
  parado_porque: string | null
  juizo: Juizo
  /** Porque é que o motor decidiu escrever (ou não escrever) isto. Vai para o painel e para o log. */
  nota: string
}

/**
 * O PLANO PARA UM AGENTE — puro, e é aqui que vive todo o cuidado.
 *
 * ═══ PORQUE É QUE NÃO SE GRAVA UM EVENTO EM CADA PASSAGEM ══════════════════════════════════
 *
 * O pedido era «registar sempre». Registar literalmente sempre, com um cron a correr de poucos em
 * poucos minutos, enche `agentes_eventos` com milhares de linhas idênticas a dizer «continua» — e
 * um livro onde tudo está registado é um livro onde não se encontra nada. Pior: a janela das 48 h
 * soma-se desse livro, e enchê-lo de ruído torna a leitura lenta exactamente no sítio onde ela
 * precisa de ser certa.
 *
 * O que se grava:
 *  · **sempre** que o estado MUDA — é isso que alguém vai querer explicar depois;
 *  · **uma vez por janela** quando não muda, para ficar prova de que a regra correu e o que viu.
 *    O `avaliado_em` é actualizado em todas as passagens, por isso nunca há dúvida sobre se o
 *    motor está vivo.
 *
 * ═══ AGENTES QUE NÃO SE JULGAM ═════════════════════════════════════════════════════════════
 *
 * Um agente com campos ilegíveis não é julgado. É tentador tratar o ilegível como zero e deixar a
 * regra decidir — e o resultado disso é parar um agente porque uma coluna veio nula.
 */
export function planearJuizo(
  montado: AgenteMontado,
  agora: Date = new Date(),
  avaliadoEm?: string | null,
): Escrita {
  const { agente, ilegivel } = montado

  if (ilegivel.length) {
    return {
      agente_id: agente.id,
      nome: agente.nome,
      estado: null,
      evento: null,
      parado_em: null,
      parado_porque: null,
      juizo: {
        decisao: 'espera',
        estado: agente.estado,
        resultado: 0,
        porque: `Não julgado: campos ilegíveis na base (${ilegivel.join(', ')}). Corrige-se a linha, não o agente.`,
      },
      nota: `ignorado — ${ilegivel.join(', ')} ilegível`,
    }
  }

  const juizo = julgar(agente, agora)
  const mudaEstado = juizo.estado !== agente.estado

  if (juizo.decisao === 'para') {
    return {
      agente_id: agente.id,
      nome: agente.nome,
      estado: 'parado',
      evento: { tipo: 'parou', valor: juizo.resultado, detalhe: juizo.porque },
      // `parado_em` é o instante do juízo, não `now()` do Postgres: assim a hora que o painel
      // mostra é a mesma que a regra usou para decidir.
      parado_em: agora.toISOString(),
      parado_porque: juizo.porque,
      juizo,
      nota: 'parado',
    }
  }

  if (juizo.decisao === 'avisa') {
    // Avisar um agente que JÁ está em risco não volta a gravar evento — era mandar o mesmo aviso
    // a cada passagem do cron até ele morrer, e ninguém lê o segundo.
    return {
      agente_id: agente.id,
      nome: agente.nome,
      estado: mudaEstado ? 'em_risco' : null,
      evento: mudaEstado ? { tipo: 'avisado', valor: juizo.resultado, detalhe: juizo.porque } : null,
      parado_em: null,
      parado_porque: null,
      juizo,
      nota: mudaEstado ? 'passou a em_risco' : 'continua em_risco (aviso já dado)',
    }
  }

  /**
   * `continua` e `espera`. Um agente que RECUPEROU (estava em risco e voltou a dar lucro) volta a
   * `vivo` — sem isto, um agente que se endireitou ficava marcado em risco para sempre e o painel
   * mentia ao dono.
   */
  const horasDesdeAvaliacao = (() => {
    if (!avaliadoEm) return Infinity
    const t = Date.parse(String(avaliadoEm))
    if (!Number.isFinite(t)) return Infinity
    return (agora.getTime() - t) / 3_600_000
  })()
  const devePrestarContas = horasDesdeAvaliacao >= JANELA_HORAS

  return {
    agente_id: agente.id,
    nome: agente.nome,
    estado: mudaEstado ? juizo.estado : null,
    evento:
      mudaEstado || devePrestarContas
        ? { tipo: 'avaliado', valor: juizo.resultado, detalhe: juizo.porque }
        : null,
    parado_em: null,
    parado_porque: null,
    juizo,
    nota: mudaEstado
      ? `voltou a ${juizo.estado}`
      : devePrestarContas
        ? 'sem mudança (registo da janela)'
        : 'sem mudança',
  }
}

/**
 * O PLANO PARA A EQUIPA INTEIRA — puro.
 *
 * Existe separado de `correrMotor` por uma razão prática: é isto que o `?dry=1` da rota mostra. Um
 * motor que só se consegue experimentar a escrever não se experimenta.
 */
export function planearEquipa(
  linhas: LinhaAgente[],
  eventos: EventoLido[],
  agora: Date = new Date(),
): Escrita[] {
  const somas = somarJanela(eventos, agora)
  return linhas.map((l) => planearJuizo(montarAgente(l, somas.get(String(l.id))), agora, l.avaliado_em))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A partir daqui há base de dados. Tudo o que decide ficou acima, puro e provado.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** O mínimo que o motor precisa de um cliente Supabase. Tipado assim para o check não pedir rede. */
type Db = {
  from: (tabela: string) => any
}

export interface ResultadoMotor {
  ok: boolean
  ensaio: boolean
  avaliados: number
  parados: number
  avisados: number
  ignorados: number
  escritas: Array<{ nome: string; nota: string; porque: string; resultado: number }>
  erros: string[]
}

/**
 * CORRER A AVALIAÇÃO.
 *
 * `ensaio: true` lê e planeia sem escrever nada — e é assim que isto se vê funcionar antes de lhe
 * dar a faca. Nada aqui apaga uma linha: parar é mudar `estado`, e o limite é do dono.
 */
export async function correrAvaliacao(
  db: Db,
  opcoes: { ensaio?: boolean; agora?: Date } = {},
): Promise<ResultadoMotor> {
  const ensaio = opcoes.ensaio === true
  const agora = opcoes.agora ?? new Date()
  const erros: string[] = []

  const { data: linhas, error: erroLinhas } = await db
    .from('agentes_equipa')
    .select(
      'id, nome, papel, pilar, pai_id, estado, pausado, orcamento, gasto, receita, chave_receita, avaliado_em, criado_em',
    )
  if (erroLinhas) {
    return {
      ok: false, ensaio, avaliados: 0, parados: 0, avisados: 0, ignorados: 0, escritas: [],
      erros: [`agentes_equipa: ${erroLinhas.message ?? 'erro'}`],
    }
  }
  const equipa = (linhas ?? []) as LinhaAgente[]
  if (!equipa.length) {
    return { ok: true, ensaio, avaliados: 0, parados: 0, avisados: 0, ignorados: 0, escritas: [], erros: [] }
  }

  /**
   * Os eventos da janela, com uma folga de uma hora.
   *
   * A folga existe porque o `criado_em` do evento é a hora do Postgres e o `agora` daqui é a hora
   * do Node. Sem folga, um evento na fronteira podia cair fora da janela por causa de alguns
   * segundos de diferença de relógio — e perder receita na fronteira é perder exactamente o
   * agente que estava a ser decidido. `somarJanela` volta a filtrar pela janela exacta.
   */
  const desde = new Date(agora.getTime() - (JANELA_HORAS + 1) * 3_600_000).toISOString()
  const { data: eventos, error: erroEventos } = await db
    .from('agentes_eventos')
    .select('agente_id, tipo, valor, criado_em')
    .gte('criado_em', desde)
    .in('tipo', ['receita', 'gastou'])
  if (erroEventos) {
    // Sem os eventos a janela seria toda zero, e isso punha a equipa inteira em risco de uma vez.
    // Vale muito mais não julgar ninguém nesta passagem.
    return {
      ok: false, ensaio, avaliados: 0, parados: 0, avisados: 0, ignorados: 0, escritas: [],
      erros: [`agentes_eventos: ${erroEventos.message ?? 'erro'} — ninguém foi julgado nesta passagem`],
    }
  }

  const plano = planearEquipa(equipa, (eventos ?? []) as EventoLido[], agora)

  let parados = 0
  let avisados = 0
  let ignorados = 0

  for (const e of plano) {
    if (e.nota.startsWith('ignorado')) {
      ignorados++
      continue
    }
    if (e.evento?.tipo === 'parou') parados++
    if (e.evento?.tipo === 'avisado') avisados++

    if (ensaio) continue

    const mudanca: Record<string, unknown> = { avaliado_em: agora.toISOString(), atualizado_em: agora.toISOString() }
    if (e.estado) mudanca.estado = e.estado
    if (e.parado_em) mudanca.parado_em = e.parado_em
    if (e.parado_porque) mudanca.parado_porque = e.parado_porque

    const { error: erroUpdate } = await db.from('agentes_equipa').update(mudanca).eq('id', e.agente_id)
    if (erroUpdate) {
      erros.push(`${e.nome}: estado não gravado (${erroUpdate.message ?? 'erro'})`)
      // Sem o estado gravado NÃO se grava o evento: um livro a dizer «parou» ao lado de uma linha
      // a dizer «vivo» é pior do que não ter registo — manda alguém procurar o bug no sítio errado.
      continue
    }

    if (e.evento) {
      const { error: erroEvento } = await db.from('agentes_eventos').insert({
        agente_id: e.agente_id,
        tipo: e.evento.tipo,
        valor: e.evento.valor,
        detalhe: e.evento.detalhe,
      })
      if (erroEvento) erros.push(`${e.nome}: evento ${e.evento.tipo} não gravado (${erroEvento.message ?? 'erro'})`)
    }
  }

  return {
    ok: erros.length === 0,
    ensaio,
    avaliados: plano.length - ignorados,
    parados,
    avisados,
    ignorados,
    escritas: plano.map((e) => ({
      nome: e.nome,
      nota: e.nota,
      porque: e.juizo.porque,
      resultado: e.juizo.resultado,
    })),
    erros,
  }
}

/**
 * PAUSAR / RETOMAR / PARAR À MÃO — o que os botões do painel fazem.
 *
 * `parar` NÃO apaga. É um limite do dono e está escrito em três sítios de propósito: aqui, na
 * migração, e no cabeçalho de `vida.ts`.
 */
export async function acaoManual(
  db: Db,
  agenteId: string,
  acao: 'pausar' | 'retomar' | 'parar',
  porque: string,
): Promise<{ ok: boolean; erro?: string }> {
  const agora = new Date().toISOString()
  const motivo = porque.trim() || 'Sem motivo escrito.'

  const mudanca: Record<string, unknown> =
    acao === 'pausar'
      ? { pausado: true, estado: 'pausado', atualizado_em: agora }
      : acao === 'retomar'
        ? // Retomar devolve a `vivo` e LIMPA o travão da paragem anterior: um agente retomado que
          // ficasse com `parado_em` preenchido aparecia no painel com data de morte e a trabalhar.
          { pausado: false, estado: 'vivo', parado_em: null, parado_porque: null, atualizado_em: agora }
        : { pausado: false, estado: 'parado', parado_em: agora, parado_porque: motivo, atualizado_em: agora }

  const { error } = await db.from('agentes_equipa').update(mudanca).eq('id', agenteId)
  if (error) return { ok: false, erro: error.message ?? 'erro ao gravar' }

  const tipo = acao === 'pausar' ? 'avisado' : acao === 'retomar' ? 'retomado' : 'parou'
  const detalhe =
    acao === 'pausar'
      ? `Pausado pelo dono: ${motivo}`
      : acao === 'retomar'
        ? `Retomado pelo dono: ${motivo}`
        : `Parado pelo dono: ${motivo}`
  await db.from('agentes_eventos').insert({ agente_id: agenteId, tipo, detalhe })

  return { ok: true }
}
