/**
 * O DESEMPENHO DE UMA CONTA SIMULADA — trades, taxa de acerto, pips, retorno e drawdown.
 *
 * Nasceu para as contas que seguem as estratégias do MTM Auto: o aluno quer olhar para cada conta
 * e saber como a estratégia se está a portar. Serve igualmente para qualquer conta simulada.
 *
 * Como se conta, e porquê:
 *  · UMA TRADE é uma posição com as suas filhas de parciais (mae_id). Uma estratégia que sai em
 *    três partes fez UMA trade, não três — contar as partes inflacionava o número de trades e a
 *    taxa de acerto (as primeiras saídas são quase sempre as ganhadoras).
 *  · Só entram na taxa de acerto as trades TERMINADAS (a posição-mãe fechou). Uma trade com 50%
 *    fechado em lucro e o resto aberto ainda não ganhou nem perdeu.
 *  · Os pips de uma trade são a média PESADA pelo volume de cada parte: 0,5 lote a +40 pips e
 *    0,5 a +10 são +25 pips, não +50.
 *  · O resultado é líquido (lucro + swap − comissão), em % do saldo inicial. Em USD só dentro da
 *    própria conta simulada, que é a moeda dela — nunca em euros, nunca como promessa.
 *  · Drawdown máximo sobre a curva de saldo realizado, com a equity de agora como último ponto.
 *
 * Pura: o site (WebTrader, MTM Auto) chama-a com as linhas da base; o teste chama-a à mão.
 */
import { pipSizeForSymbol, unitFor } from '../../mtmcopy/trade-outcome'

export interface LinhaFechada {
  id: string
  mae_id: string | null
  symbol: string
  direcao: 'buy' | 'sell'
  volume: number
  preco_entrada: number
  preco_fecho: number | null
  pnl: number | null
  comissao: number | null
  swap: number | null
  fechada_em: string
  origem?: string | null
  comentario?: string | null
}

export interface Desempenho {
  tradesTerminadas: number
  ganhas: number
  perdidas: number
  taxaAcertoPct: number | null
  /** Soma dos pips (pontos em índices e cripto) das trades terminadas, pesados por volume. */
  pips: number
  unidade: 'pips' | 'pontos' | 'misto'
  resultadoLiquido: number
  retornoPct: number
  drawdownMaxPct: number
  melhorTradePct: number | null
  piorTradePct: number | null
  primeiraEm: string | null
  ultimaEm: string | null
  /** Por comentário (estratégia ou fonte T2T): quem fez o quê dentro da mesma conta. */
  porComentario: Array<{ comentario: string; trades: number; ganhas: number; taxaAcertoPct: number | null; pips: number; retornoPct: number }>
}

const r2 = (x: number) => Math.round(x * 100) / 100
const r1 = (x: number) => Math.round(x * 10) / 10

export function desempenhoDaConta(e: {
  saldoInicial: number
  equity: number
  fechadas: LinhaFechada[]
  /** ids das posições ainda abertas (as mães de parciais em curso). */
  abertasIds: Set<string>
}): Desempenho {
  const saldoInicial = e.saldoInicial > 0 ? e.saldoInicial : 0
  const partes = [...e.fechadas].sort((a, b) => new Date(a.fechada_em).getTime() - new Date(b.fechada_em).getTime())

  // Agrupar por trade (a raiz é a mãe, ou a própria linha).
  const trades = new Map<string, LinhaFechada[]>()
  for (const p of partes) {
    const raiz = p.mae_id ?? p.id
    trades.set(raiz, [...(trades.get(raiz) ?? []), p])
  }

  // Curva de saldo realizado → drawdown.
  let saldo = saldoInicial
  let pico = saldoInicial
  let ddMax = 0
  for (const p of partes) {
    saldo += Number(p.pnl ?? 0) + Number(p.swap ?? 0) - Number(p.comissao ?? 0)
    pico = Math.max(pico, saldo)
    if (pico > 0) ddMax = Math.max(ddMax, (pico - saldo) / pico)
  }
  if (pico > 0) ddMax = Math.max(ddMax, (Math.max(pico, e.equity) - e.equity) / Math.max(pico, e.equity))

  const unidades = new Set<string>()
  const porComentario = new Map<string, { trades: number; ganhas: number; pips: number; liquido: number }>()
  let terminadas = 0
  let ganhas = 0
  let pipsTotal = 0
  let melhor: number | null = null
  let pior: number | null = null
  let liquidoTotal = 0

  for (const [raiz, ps] of trades) {
    const liquido = ps.reduce((a, p) => a + Number(p.pnl ?? 0) + Number(p.swap ?? 0) - Number(p.comissao ?? 0), 0)
    liquidoTotal += liquido
    // Parcial de uma trade que continua aberta: o dinheiro já conta, a trade ainda não.
    if (e.abertasIds.has(raiz)) continue
    terminadas++
    if (liquido > 0) ganhas++
    const pip = pipSizeForSymbol(ps[0].symbol)
    unidades.add(unitFor(ps[0].symbol))
    let vol = 0
    let soma = 0
    for (const p of ps) {
      if (p.preco_fecho == null) continue
      const d = p.direcao === 'buy' ? Number(p.preco_fecho) - Number(p.preco_entrada) : Number(p.preco_entrada) - Number(p.preco_fecho)
      soma += (d / pip) * Number(p.volume)
      vol += Number(p.volume)
    }
    const pips = vol > 0 ? soma / vol : 0
    pipsTotal += pips
    if (saldoInicial > 0) {
      const pct = (liquido / saldoInicial) * 100
      melhor = melhor == null ? pct : Math.max(melhor, pct)
      pior = pior == null ? pct : Math.min(pior, pct)
    }
    const chave = String(ps[0].comentario ?? '').trim() || (ps[0].origem === 'manual' ? 'Manual' : String(ps[0].origem ?? 'Manual'))
    const g = porComentario.get(chave) ?? { trades: 0, ganhas: 0, pips: 0, liquido: 0 }
    g.trades++
    if (liquido > 0) g.ganhas++
    g.pips += pips
    g.liquido += liquido
    porComentario.set(chave, g)
  }

  return {
    tradesTerminadas: terminadas,
    ganhas,
    perdidas: terminadas - ganhas,
    taxaAcertoPct: terminadas ? r1((ganhas / terminadas) * 100) : null,
    pips: r1(pipsTotal),
    unidade: unidades.size === 1 ? ([...unidades][0] as 'pips' | 'pontos') : unidades.size ? 'misto' : 'pips',
    resultadoLiquido: r2(liquidoTotal),
    retornoPct: saldoInicial > 0 ? r2(((e.equity - saldoInicial) / saldoInicial) * 100) : 0,
    drawdownMaxPct: r2(ddMax * 100),
    melhorTradePct: melhor == null ? null : r2(melhor),
    piorTradePct: pior == null ? null : r2(pior),
    primeiraEm: partes[0]?.fechada_em ?? null,
    ultimaEm: partes[partes.length - 1]?.fechada_em ?? null,
    porComentario: [...porComentario.entries()].map(([comentario, g]) => ({
      comentario, trades: g.trades, ganhas: g.ganhas,
      taxaAcertoPct: g.trades ? r1((g.ganhas / g.trades) * 100) : null,
      pips: r1(g.pips),
      retornoPct: saldoInicial > 0 ? r2((g.liquido / saldoInicial) * 100) : 0,
    })).sort((a, b) => b.trades - a.trades),
  }
}
