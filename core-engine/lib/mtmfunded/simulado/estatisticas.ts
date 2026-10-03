/**
 * AS ESTATÍSTICAS DE UMA CONTA SIMULADA — o separador «Estatísticas» do WebTrader PRO.
 *
 * Pura: o site chama-a com as linhas da base; o teste chama-a à mão. Irmã de `desempenho.ts`
 * (que serve o cartão curto das contas que seguem estratégias) e com as MESMAS convenções:
 *  · UMA TRADE = a posição-raiz com as filhas dos parciais (mae_id). Uma saída em três partes é
 *    uma trade — contar as partes inflacionava a taxa de acerto (os parciais são quase sempre ganhos).
 *  · O resultado de uma trade é LÍQUIDO (lucro + swap − comissão) e soma todas as partes: é assim
 *    que a taxa de acerto fica «pesada pelos parciais» — uma trade que fechou 50% a +300 e 50% a
 *    −400 é uma perda de 100, não uma vitória e uma derrota.
 *  · Só as trades TERMINADAS (a raiz fechou) entram nos KPIs; um parcial com o resto aberto já
 *    mexeu no saldo (entra na curva) mas ainda não ganhou nem perdeu.
 *  · R = resultado ÷ risco inicial (|USD até ao SL| guardado à abertura, migração 072). Trades sem
 *    SL não têm R — a expectativa em R conta só as que o têm, e diz quantas foram.
 *  · Moeda: USD da conta simulada. Nunca euros, nunca promessa.
 *  · Horas e dias da semana em UTC (a interface diz isso) — o servidor não sabe o fuso do aluno.
 */

export interface LinhaTrade {
  id: string
  mae_id: string | null
  symbol: string
  direcao: 'buy' | 'sell'
  volume: number
  pnl: number | null
  comissao: number | null
  swap: number | null
  aberta_em: string | null
  fechada_em: string
  origem?: string | null
  comentario?: string | null
  motivo_fecho?: string | null
  risco_inicial?: number | null
}

export interface Snapshot { em: string; saldo: number; equity: number }

export interface Grupo { chave: string; trades: number; ganhas: number; taxaAcertoPct: number | null; resultado: number }

export interface Estatisticas {
  trades: number
  ganhas: number
  perdidas: number
  empatadas: number
  taxaAcertoPct: number | null
  resultadoLiquido: number
  lucroBruto: number
  perdaBruta: number
  fatorLucro: number | null
  mediaGanho: number | null
  mediaPerda: number | null
  expectativaUsd: number | null
  expectativaR: number | null
  tradesComR: number
  melhorTrade: { id: string; symbol: string; resultado: number } | null
  piorTrade: { id: string; symbol: string; resultado: number } | null
  maxGanhasSeguidas: number
  maxPerdidasSeguidas: number
  tradesPorDia: number | null
  duracaoMediaMin: number | null
  drawdownMaxPct: number
  drawdownMaxUsd: number
  retornoPct: number
  curva: Array<{ t: number; saldo: number; equity: number; ddPct: number }>
  porSimbolo: Grupo[]
  porOrigem: Grupo[]
  porEstrategia: Grupo[]
  porHora: Grupo[]
  porDiaSemana: Grupo[]
  porDirecao: Grupo[]
}

const r2 = (x: number) => Math.round(x * 100) / 100
const r1 = (x: number) => Math.round(x * 10) / 10
const liquidoDe = (p: LinhaTrade) => Number(p.pnl ?? 0) + Number(p.swap ?? 0) - Number(p.comissao ?? 0)
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function estatisticasDaConta(e: {
  saldoInicial: number
  equity: number
  fechadas: LinhaTrade[]
  abertasIds: Set<string>
  snapshots?: Snapshot[]
  agora?: Date
}): Estatisticas {
  const saldoInicial = e.saldoInicial > 0 ? e.saldoInicial : 0
  const partes = [...e.fechadas].sort((a, b) => Date.parse(a.fechada_em) - Date.parse(b.fechada_em))

  // ── trades (raiz + parciais) ──
  const porRaiz = new Map<string, LinhaTrade[]>()
  for (const p of partes) {
    const raiz = p.mae_id ?? p.id
    porRaiz.set(raiz, [...(porRaiz.get(raiz) ?? []), p])
  }
  interface Trade { id: string; symbol: string; direcao: string; resultado: number; r: number | null; abertaEm: number | null; fechadaEm: number; origem: string; estrategia: string }
  const trades: Trade[] = []
  for (const [raiz, ps] of porRaiz) {
    if (e.abertasIds.has(raiz)) continue
    const mae = ps.find((p) => p.id === raiz) ?? ps[0]
    const resultado = r2(ps.reduce((a, p) => a + liquidoDe(p), 0))
    const risco = Number(mae.risco_inicial ?? 0)
    trades.push({
      id: raiz, symbol: mae.symbol, direcao: mae.direcao, resultado,
      r: risco > 0 ? resultado / risco : null,
      abertaEm: mae.aberta_em ? Date.parse(mae.aberta_em) : null,
      fechadaEm: Math.max(...ps.map((p) => Date.parse(p.fechada_em))),
      origem: String(mae.origem ?? 'manual'),
      estrategia: String(mae.comentario ?? '').trim() || (mae.origem === 'manual' || !mae.origem ? 'Manual' : String(mae.origem)),
    })
  }
  trades.sort((a, b) => a.fechadaEm - b.fechadaEm)

  const ganhos = trades.filter((t) => t.resultado > 0)
  const perdas = trades.filter((t) => t.resultado < 0)
  const lucroBruto = r2(ganhos.reduce((a, t) => a + t.resultado, 0))
  const perdaBruta = r2(Math.abs(perdas.reduce((a, t) => a + t.resultado, 0)))
  const comR = trades.filter((t) => t.r != null)

  let seguidasG = 0, seguidasP = 0, maxG = 0, maxP = 0
  for (const t of trades) {
    if (t.resultado > 0) { seguidasG++; seguidasP = 0 } else if (t.resultado < 0) { seguidasP++; seguidasG = 0 } else { seguidasG = 0; seguidasP = 0 }
    maxG = Math.max(maxG, seguidasG)
    maxP = Math.max(maxP, seguidasP)
  }

  const dias = new Set(trades.map((t) => new Date(t.fechadaEm + 2 * 3600_000).toISOString().slice(0, 10)))
  const duracoes = trades.filter((t) => t.abertaEm != null).map((t) => (t.fechadaEm - (t.abertaEm as number)) / 60_000)

  const agrupar = (chave: (t: Trade) => string, ordem?: string[]): Grupo[] => {
    const m = new Map<string, { trades: number; ganhas: number; resultado: number }>()
    for (const k of ordem ?? []) m.set(k, { trades: 0, ganhas: 0, resultado: 0 })
    for (const t of trades) {
      const k = chave(t)
      const g = m.get(k) ?? { trades: 0, ganhas: 0, resultado: 0 }
      g.trades++
      if (t.resultado > 0) g.ganhas++
      g.resultado += t.resultado
      m.set(k, g)
    }
    const lista = [...m.entries()].map(([k, g]) => ({ chave: k, trades: g.trades, ganhas: g.ganhas, taxaAcertoPct: g.trades ? r1((g.ganhas / g.trades) * 100) : null, resultado: r2(g.resultado) }))
    return ordem ? lista : lista.sort((a, b) => b.trades - a.trades || b.resultado - a.resultado)
  }

  // ── curva de saldo e equity, e drawdown ──
  const pontos: Array<{ t: number; saldo: number; equity: number }> = []
  let saldo = saldoInicial
  const inicioT = partes.length ? Date.parse(partes[0].aberta_em ?? partes[0].fechada_em) - 1 : (e.agora ?? new Date()).getTime()
  pontos.push({ t: inicioT, saldo, equity: saldo })
  for (const p of partes) {
    saldo += liquidoDe(p)
    pontos.push({ t: Date.parse(p.fechada_em), saldo: r2(saldo), equity: r2(saldo) })
  }
  // As fotografias do motor dão a equity entre fechos (o flutuante que o saldo não vê).
  for (const s of e.snapshots ?? []) {
    const t = Date.parse(s.em)
    if (Number.isFinite(t)) pontos.push({ t, saldo: r2(Number(s.saldo)), equity: r2(Number(s.equity)) })
  }
  pontos.push({ t: (e.agora ?? new Date()).getTime(), saldo: r2(saldo), equity: r2(e.equity) })
  pontos.sort((a, b) => a.t - b.t)

  let pico = saldoInicial
  let ddMaxPct = 0
  let ddMaxUsd = 0
  const curva = pontos.map((p) => {
    const v = Math.min(p.saldo, p.equity)
    pico = Math.max(pico, p.saldo, p.equity)
    const ddUsd = pico - v
    const ddPct = pico > 0 ? (ddUsd / pico) * 100 : 0
    ddMaxPct = Math.max(ddMaxPct, ddPct)
    ddMaxUsd = Math.max(ddMaxUsd, ddUsd)
    return { t: p.t, saldo: p.saldo, equity: p.equity, ddPct: r2(-ddPct) }
  })

  const melhor = trades.reduce<Trade | null>((m, t) => (!m || t.resultado > m.resultado ? t : m), null)
  const pior = trades.reduce<Trade | null>((m, t) => (!m || t.resultado < m.resultado ? t : m), null)

  return {
    trades: trades.length,
    ganhas: ganhos.length,
    perdidas: perdas.length,
    empatadas: trades.length - ganhos.length - perdas.length,
    taxaAcertoPct: trades.length ? r1((ganhos.length / trades.length) * 100) : null,
    resultadoLiquido: r2(trades.reduce((a, t) => a + t.resultado, 0)),
    lucroBruto,
    perdaBruta,
    // Sem perdas o fator é infinito: null, e a interface escreve «∞» se houver lucro.
    fatorLucro: perdaBruta > 0 ? r2(lucroBruto / perdaBruta) : null,
    mediaGanho: ganhos.length ? r2(lucroBruto / ganhos.length) : null,
    mediaPerda: perdas.length ? r2(-perdaBruta / perdas.length) : null,
    expectativaUsd: trades.length ? r2(trades.reduce((a, t) => a + t.resultado, 0) / trades.length) : null,
    expectativaR: comR.length ? r2(comR.reduce((a, t) => a + (t.r as number), 0) / comR.length) : null,
    tradesComR: comR.length,
    melhorTrade: melhor ? { id: melhor.id, symbol: melhor.symbol, resultado: melhor.resultado } : null,
    piorTrade: pior ? { id: pior.id, symbol: pior.symbol, resultado: pior.resultado } : null,
    maxGanhasSeguidas: maxG,
    maxPerdidasSeguidas: maxP,
    tradesPorDia: dias.size ? r2(trades.length / dias.size) : null,
    duracaoMediaMin: duracoes.length ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length) : null,
    drawdownMaxPct: r2(ddMaxPct),
    drawdownMaxUsd: r2(ddMaxUsd),
    retornoPct: saldoInicial > 0 ? r2(((e.equity - saldoInicial) / saldoInicial) * 100) : 0,
    curva,
    porSimbolo: agrupar((t) => t.symbol),
    porOrigem: agrupar((t) => t.origem),
    porEstrategia: agrupar((t) => t.estrategia),
    porHora: agrupar((t) => String(new Date(t.abertaEm ?? t.fechadaEm).getUTCHours()).padStart(2, '0'), Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))),
    porDiaSemana: agrupar((t) => DIAS_SEMANA[new Date(t.abertaEm ?? t.fechadaEm).getUTCDay()], DIAS_SEMANA),
    porDirecao: agrupar((t) => (t.direcao === 'buy' ? 'Compras' : 'Vendas')),
  }
}
