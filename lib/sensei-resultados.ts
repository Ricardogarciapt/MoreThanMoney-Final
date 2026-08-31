import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * O registo dos sinais Sensei, lido em direto.
 *
 * A página de vendas do EA publicava os números de um backtest. Passa a publicar isto: o que os
 * sinais Sensei fizeram desde que começaram a ser emitidos, contado da mesma tabela que alimenta
 * o chat, o Telegram e as apps. Nada é escrito à mão — se o desempenho mudar, a página muda com
 * ele, e ninguém tem de se lembrar de a actualizar.
 *
 * ── Como se conta ─────────────────────────────────────────────────────────────────────────────
 * Cada sinal acaba num `trade_status`: `exit_1`..`exit_4` (chegou a esse alvo), `loss` (bateu no
 * stop) ou `be` (saiu no ponto de entrada). Resolvidos = ganhos + perdidos; os que ainda estão
 * abertos ficam de fora até fecharem, senão a amostra seria escolhida a dedo todos os dias.
 *
 * R é a razão entre o que se arrisca e o que se ganha: perder custa 1R, o primeiro alvo paga 1R,
 * o quarto paga 4R. É a mesma unidade da `mtm_signal_scorecard`, que o admin já usa.
 *
 * ── O que este número NÃO é ───────────────────────────────────────────────────────────────────
 * É o registo dos SINAIS publicados, com a posição inteira levada a cada alvo. Quem tira parciais
 * fica com menos do que o R aqui e com mais do que o stop nas que reviram. E o acerto é baixo de
 * propósito: a estratégia perde muitas vezes pouco para ganhar poucas vezes muito. Publicar o
 * acerto sem o R seria esconder metade da conta — por isso vão sempre juntos.
 */

/** O alerta do TradingView que carrega os sinais Sensei. */
const ALERTA_SENSEI = 'MTM Sensei X'

/** Estados que contam como ganho, e o R que cada um vale. */
const GANHO: Record<string, number> = { exit_1: 1, exit_2: 2, exit_3: 3, exit_4: 4 }

export interface ResultadoSensei {
  /** Todos os sinais emitidos no período, resolvidos ou não. */
  sinais: number
  /** Ganhos + perdidos. Os abertos não contam. */
  resolvidos: number
  ganhos: number
  perdidos: number
  acertoPct: number
  /** Soma de R. Positivo = os ganhos pagaram as perdas. */
  r: number
  desde: string | null
  ate: string | null
  /** Os instrumentos mais negociados, ordenados por número de trades — nunca pelo resultado. */
  porInstrumento: Array<{ ticker: string; resolvidos: number; acertoPct: number; r: number }>
}

interface Linha {
  ticker: string | null
  trade_status: string | null
  received_at: string
}

function agregar(linhas: Linha[]): ResultadoSensei {
  let ganhos = 0
  let perdidos = 0
  let r = 0
  let desde: string | null = null
  let ate: string | null = null

  const porTicker = new Map<string, { resolvidos: number; ganhos: number; r: number }>()

  for (const l of linhas) {
    if (!desde || l.received_at < desde) desde = l.received_at
    if (!ate || l.received_at > ate) ate = l.received_at

    const estado = l.trade_status ?? ''
    const ganho = GANHO[estado]
    const perdeu = estado === 'loss'
    if (ganho === undefined && !perdeu) continue // aberto, breakeven ou seguimento

    ganhos += ganho !== undefined ? 1 : 0
    perdidos += perdeu ? 1 : 0
    r += ganho !== undefined ? ganho : -1

    const t = (l.ticker || '—').toUpperCase()
    const acc = porTicker.get(t) ?? { resolvidos: 0, ganhos: 0, r: 0 }
    acc.resolvidos += 1
    acc.ganhos += ganho !== undefined ? 1 : 0
    acc.r += ganho !== undefined ? ganho : -1
    porTicker.set(t, acc)
  }

  const resolvidos = ganhos + perdidos

  return {
    sinais: linhas.length,
    resolvidos,
    ganhos,
    perdidos,
    acertoPct: resolvidos ? Math.round((1000 * ganhos) / resolvidos) / 10 : 0,
    r,
    desde,
    ate,
    porInstrumento: [...porTicker.entries()]
      // Menos de 10 trades resolvidas não diz nada sobre nada: um instrumento com 2 ganhos
      // apareceria a 100% e daria à tabela um ar que os dados não sustentam.
      .filter(([, v]) => v.resolvidos >= 10)
      .map(([ticker, v]) => ({
        ticker,
        resolvidos: v.resolvidos,
        acertoPct: Math.round((1000 * v.ganhos) / v.resolvidos) / 10,
        r: v.r,
      }))
      // Ordenado pelo NÚMERO DE TRADES, não pelo resultado. Ordenar por R e cortar no sexto
      // mostrava só os instrumentos que correram bem — a tabela escolhia a dedo sozinha, que é
      // exactamente o que esta secção existe para não fazer.
      .sort((a, b) => b.resolvidos - a.resolvidos)
      .slice(0, 8),
  }
}

/**
 * Lê o registo todo. Sem janela de datas de propósito: escolher o período é a forma mais fácil de
 * fazer uma estratégia parecer melhor do que é, e a página não devia poder fazê-lo.
 */
export async function lerResultadosSensei(): Promise<ResultadoSensei | null> {
  const db = getSupabaseAdmin()

  const linhas: Linha[] = []
  const PAGINA = 1000
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await db
      .from('tradingview_signals')
      .select('ticker, trade_status, received_at')
      .eq('alert_name', ALERTA_SENSEI)
      // `neq` sozinho perdia as linhas com `signal_kind` a NULL — em SQL, NULL <> 'followup' dá
      // NULL, não verdadeiro. Eram 289 sinais e sete semanas de registo a desaparecer em silêncio.
      .or('signal_kind.is.null,signal_kind.neq.followup')
      .order('received_at', { ascending: true })
      .range(inicio, inicio + PAGINA - 1)

    if (error) {
      console.error('[SENSEI] Erro a ler o registo de sinais:', error.message)
      return null
    }
    if (!data?.length) break
    linhas.push(...(data as Linha[]))
    if (data.length < PAGINA) break
  }

  if (!linhas.length) return null
  return agregar(linhas)
}
