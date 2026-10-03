import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { lerHistorico } from '@/lib/mtmcopy/metaapi'
import { pipSizeForSymbol } from '@/lib/mtmcopy/trade-outcome'

/**
 * O que a conta PROVIDER do Sensei fez mesmo, por instrumento.
 *
 * A página mostrava o registo dos SINAIS (`tradingview_signals`) — ideias publicadas, medidas
 * como se a posição inteira fosse levada a cada alvo. Isto é outra coisa: são as ordens reais da
 * conta que alimenta o MTM Auto Sensei, lidas do histórico do broker, com cada saída parcial a
 * contar pelo seu peso.
 *
 * ── Porque é que o resultado vem em PIPS e não em R ────────────────────────────────────────────
 * R é a razão entre o que se arriscou e o que se ganhou — precisa da distância ao stop de cada
 * trade. O histórico de negócios do broker não a traz: traz preços de entrada, preços de saída e
 * volumes. Dava para inventar um R a partir de um stop médio, mas seria um número calculado por
 * nós a partir de um pressuposto nosso, apresentado como se fosse medido. Pips é o que a conta
 * fez, sem pressupostos.
 *
 * ── Porque é que uma posição pode ter várias saídas ───────────────────────────────────────────
 * O motor tira parciais. Uma posição de 0,03 que fecha 0,01 no TP1, 0,01 no TP2 e 0,01 no stop
 * vale a média das três ponderada pelo volume — não vale o stop. Foi por medir isto mal que
 * durante semanas se contou como perda inteira uma trade que já tinha pago dois alvos.
 */

/** Menos do que isto não diz nada sobre nada — um instrumento com 2 ganhos apareceria a 100%. */
export const MINIMO_TRADES = 10

/**
 * Dias de operação abaixo dos quais NÃO se publica nada.
 *
 * A conta tinha cinco dias e 91,4% de acerto em XAUUSD. O número era verdadeiro e mesmo assim não
 * se podia publicar: uma percentagem dessas sobre uma semana promete uma consistência que uma
 * semana não pode demonstrar, e é a primeira coisa que nos é atirada à cara quando aparecer a
 * primeira semana má. Espera-se que a amostra exista antes de a mostrar.
 *
 * A guarda vive no SERVIDOR, não no ecrã: a rota é pública, e esconder só no componente deixava
 * os números à distância de abrir o endereço da API.
 */
export const MINIMO_DIAS_DEFAULT = 60

/** Quanto histórico se pede ao broker. Ele devolve o que tiver. */
const DIAS = 400

export interface MetricaInstrumento {
  symbol: string
  trades: number
  ganhos: number
  acertoPct: number
  pips: number
}

export interface MetricasProvider {
  /** Instrumentos com trades suficientes para a linha significar alguma coisa. */
  porInstrumento: MetricaInstrumento[]
  /** Instrumentos que a conta negociou mas ainda não chegaram ao mínimo. */
  abaixoDoMinimo: Array<{ symbol: string; trades: number }>
  totalTrades: number
  acertoPct: number
  pips: number
  desde: string | null
  ate: string | null
  /** Dias cobertos pela amostra. É o número que diz se ela vale alguma coisa. */
  dias: number
  aindaAbertas: number
}

/** O que a rota pública devolve enquanto a amostra ainda não chega para publicar. */
export interface AmostraCurta {
  amostraSuficiente: false
  dias: number
  minimoDias: number
  /** Quantos dias faltam. Serve para saber quando voltar a olhar, sem revelar os resultados. */
  faltamDias: number
}

/** "XAUUSD.s" → "XAUUSD". O sufixo é da corretora, não do instrumento. */
function limpar(s: string | undefined | null): string {
  return (s ?? '').toUpperCase().replace(/\.[A-Z]+$/, '')
}

/**
 * O mínimo de dias em vigor. Fica em `site_settings.sensei_prova` para se poder baixar ou subir
 * sem deploy — no dia em que a conta chegar lá, publicar é mudar um número.
 */
export async function minimoDiasConfigurado(): Promise<number> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_settings')
      .select('value')
      .eq('key', 'sensei_prova')
      .maybeSingle()
    if (data?.value) {
      const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
      const n = Number(v?.minimoDias)
      if (Number.isFinite(n) && n >= 0) return n
    }
  } catch {
    // Falhar a ler a configuração não pode ABRIR a porta: fica o valor mais conservador.
  }
  return MINIMO_DIAS_DEFAULT
}

export async function lerMetricasProviderSensei(): Promise<MetricasProvider | null> {
  const db = getSupabaseAdmin()

  const { data: provider } = await db
    .from('mtmauto_providers')
    .select('metaapi_account_id')
    .eq('slug', 'sensei')
    .maybeSingle()

  const contaId = provider?.metaapi_account_id
  if (!contaId) return null

  const deals = await lerHistorico(contaId, new Date(Date.now() - DIAS * 86_400_000))
  // `lerHistorico` devolve null quando NÃO CONSEGUIU LER, e [] quando a conta não negociou. A
  // diferença é tudo: tratar as duas como "zero trades" já escondeu uma falha durante semanas.
  if (deals == null) return null

  interface Posicao {
    symbol: string
    dir: 1 | -1
    entradas: Array<{ price: number; volume: number }>
    saidas: Array<{ price: number; volume: number; profit: number }>
    fechadaEm: string | null
  }

  const posicoes = new Map<string, Posicao>()
  let maisAntigo: number | null = null
  let maisRecente: number | null = null

  for (const d of deals) {
    if (!d.positionId) continue // depósitos e ajustes de saldo não são trades
    const quando = d.time ? new Date(d.time).getTime() : null
    if (quando && Number.isFinite(quando)) {
      maisAntigo = maisAntigo == null ? quando : Math.min(maisAntigo, quando)
      maisRecente = maisRecente == null ? quando : Math.max(maisRecente, quando)
    }

    const p =
      posicoes.get(d.positionId) ??
      ({ symbol: limpar(d.symbol), dir: 1, entradas: [], saidas: [], fechadaEm: null } as Posicao)
    if (!p.symbol) p.symbol = limpar(d.symbol)

    const volume = Number(d.volume) || 0
    const preco = Number(d.price) || 0

    if (d.entryType === 'DEAL_ENTRY_IN') {
      p.dir = d.type === 'DEAL_TYPE_BUY' ? 1 : -1
      p.entradas.push({ price: preco, volume })
    } else if (d.entryType && d.entryType.startsWith('DEAL_ENTRY_OUT')) {
      p.saidas.push({ price: preco, volume, profit: Number(d.profit) || 0 })
      p.fechadaEm = d.time ? new Date(d.time).toISOString() : p.fechadaEm
    }

    posicoes.set(d.positionId, p)
  }

  const acc = new Map<string, { trades: number; ganhos: number; pips: number }>()
  let abertas = 0

  for (const p of posicoes.values()) {
    // Sem entrada ou sem saída: ainda está aberta, ou o histórico começou a meio dela. Fica de
    // fora — contá-la seria contar meia trade.
    if (!p.entradas.length || !p.saidas.length) {
      abertas++
      continue
    }
    const volEntrada = p.entradas.reduce((s, e) => s + e.volume, 0)
    const volSaida = p.saidas.reduce((s, e) => s + e.volume, 0)
    if (volEntrada <= 0 || volSaida <= 0) continue

    const entrada = p.entradas.reduce((s, e) => s + e.price * e.volume, 0) / volEntrada
    const saida = p.saidas.reduce((s, e) => s + e.price * e.volume, 0) / volSaida
    const lucro = p.saidas.reduce((s, e) => s + e.profit, 0)

    const pip = pipSizeForSymbol(p.symbol) || 0.0001
    const pips = ((saida - entrada) * p.dir) / pip
    if (!Number.isFinite(pips)) continue

    const a = acc.get(p.symbol) ?? { trades: 0, ganhos: 0, pips: 0 }
    a.trades += 1
    a.ganhos += lucro > 0 ? 1 : 0
    a.pips += pips
    acc.set(p.symbol, a)
  }

  const todos = [...acc.entries()].map(([symbol, a]) => ({
    symbol,
    trades: a.trades,
    ganhos: a.ganhos,
    acertoPct: Math.round((1000 * a.ganhos) / a.trades) / 10,
    pips: Math.round(a.pips * 10) / 10,
  }))

  if (!todos.length) return null

  const totalTrades = todos.reduce((s, x) => s + x.trades, 0)
  const totalGanhos = todos.reduce((s, x) => s + x.ganhos, 0)

  return {
    // Ordenado pelo número de trades, nunca pelo resultado: ordenar pelo resultado é a tabela a
    // escolher a dedo sozinha, e os instrumentos que correram mal desapareciam do fundo.
    porInstrumento: todos
      .filter((x) => x.trades >= MINIMO_TRADES)
      .sort((a, b) => b.trades - a.trades),
    abaixoDoMinimo: todos
      .filter((x) => x.trades < MINIMO_TRADES)
      .map(({ symbol, trades }) => ({ symbol, trades }))
      .sort((a, b) => b.trades - a.trades),
    totalTrades,
    acertoPct: totalTrades ? Math.round((1000 * totalGanhos) / totalTrades) / 10 : 0,
    pips: Math.round(todos.reduce((s, x) => s + x.pips, 0) * 10) / 10,
    desde: maisAntigo ? new Date(maisAntigo).toISOString() : null,
    ate: maisRecente ? new Date(maisRecente).toISOString() : null,
    dias: maisAntigo && maisRecente ? Math.max(1, Math.round((maisRecente - maisAntigo) / 86_400_000)) : 0,
    aindaAbertas: abertas,
  }
}
