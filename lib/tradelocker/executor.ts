/**
 * Execução de sinais numa conta TradeLocker — o equivalente, para esta plataforma, ao trio
 * fetchLotSizingContext / placeOrder / applyManagementToAccount do MetaApi.
 *
 * Mesmas entradas e saídas do caminho MT5 (OrderResult, o mesmo objecto de sinal e de gestão),
 * para que os pontos de entrada só precisem de um `if (ehTradeLocker(conn))` e o resto do fluxo
 * (claims idempotentes, logs, re-ancoragem de SL/TP) fique igual.
 */
import type { OrderResult } from '@/lib/mtmcopy/metaapi'
import type { ParsedSignal, ParsedManagement } from '@/lib/mtmcopy/signal-parser'
import { computeLotSize, resolveEntryForRisk, type LotSizingConn } from '@/lib/mtmcopy/lot-sizing'
import { symbolMatchesCanonical } from '@/lib/mtmcopy/symbol-resolver'
import { TradeLockerError, type TLDetalheInstrumento, type TLPosicao, type TradeLockerSessao } from './client'
import { ajustarQty, lotePorRisco, qtyParcial, regraDeLote, resolverInstrumento, type TLInstrumentoResolvido } from './sizing'

export interface ContextoTL {
  balance: number | null
  equity: number | null
  marketPrice: number | null
  instrumento: TLInstrumentoResolvido | null
  detalhe: TLDetalheInstrumento | null
  erro?: string
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Saldo, equity, preço e especificação do instrumento — o que o sizing precisa. Nunca lança. */
export async function contextoTL(
  sessao: TradeLockerSessao,
  simbolo: string,
  direcao: 'buy' | 'sell',
): Promise<ContextoTL> {
  const out: ContextoTL = { balance: null, equity: null, marketPrice: null, instrumento: null, detalhe: null }
  try {
    const [estado, lista] = await Promise.all([sessao.estado(), sessao.instrumentos()])
    out.balance = estado.balance
    out.equity = estado.equity
    out.instrumento = resolverInstrumento(simbolo, lista)
    if (!out.instrumento) {
      out.erro = `${simbolo} não existe (ou não é negociável) nesta conta TradeLocker`
      return out
    }
    const id = out.instrumento.instrumento.tradableInstrumentId
    const [detalhe, cot] = await Promise.all([
      sessao.detalhe(id, out.instrumento.routeInfo).catch(() => null),
      sessao.cotacao(id, out.instrumento.routeInfo).catch(() => ({ bid: null, ask: null })),
    ])
    out.detalhe = detalhe
    out.marketPrice = direcao === 'buy' ? cot.ask ?? cot.bid : cot.bid ?? cot.ask
  } catch (e) {
    out.erro = msg(e)
  }
  return out
}

/**
 * Lote para a conta TradeLocker. Em % de risco usa o custo do tick da própria corretora (exacto em
 * qualquer par) e só cai na heurística do MT5 quando a corretora não o expõe. Sempre ajustado ao
 * passo/mínimo/máximo do instrumento.
 */
export function loteTL(conn: LotSizingConn, sinal: ParsedSignal, ctx: ContextoTL): number {
  const regra = regraDeLote(ctx.detalhe)
  const base = ctx.equity ?? ctx.balance
  let lote: number | null = null
  const modo = conn.lot_mode === 'multiplier' && Number(conn.max_risk_percent) > 0 ? 'risk_percent' : conn.lot_mode
  const riscoPct = conn.lot_mode === 'multiplier' ? Number(conn.max_risk_percent) : Number(conn.lot_value)
  if (modo === 'risk_percent') {
    const entrada = resolveEntryForRisk(sinal, ctx.marketPrice)
    if (base && entrada && sinal.sl) {
      lote = lotePorRisco({ equity: base, riscoPct, entrada, stop: sinal.sl, detalhe: ctx.detalhe })
    }
    // Tecto de lote como no MT5 (max_risk_percent faz de tecto de lotes quando existe).
    if (lote != null) {
      const tecto = conn.max_risk_percent != null && conn.max_risk_percent > 0 ? Math.min(50, conn.max_risk_percent) : 50
      lote = Math.min(lote, tecto)
    }
  }
  if (lote == null) lote = computeLotSize(conn, sinal, base)
  if (!(lote > 0)) return 0
  return ajustarQty(lote, regra)
}

export interface PedidoOrdemTL {
  symbol: string
  direction: 'buy' | 'sell'
  volume: number
  orderType?: 'market' | 'limit' | 'stop'
  openPrice?: number | null
  stopLoss?: number | null
  takeProfit?: number | null
}

export type ResultadoOrdemTL = OrderResult & { positionId?: string | null; qty?: number }

/** Coloca a ordem. Nunca lança — devolve { success:false, error } com a mensagem PT. */
export async function colocarOrdemTL(
  sessao: TradeLockerSessao,
  req: PedidoOrdemTL,
  ctx?: ContextoTL,
): Promise<ResultadoOrdemTL> {
  try {
    const c = ctx?.instrumento ? ctx : await contextoTL(sessao, req.symbol, req.direction)
    if (!c.instrumento) return { success: false, error: c.erro ?? `${req.symbol} indisponível na TradeLocker` }
    const qty = ajustarQty(req.volume, regraDeLote(c.detalhe))
    if (!(qty > 0)) return { success: false, error: 'Lote calculado inválido para este instrumento' }
    const tipo = req.orderType ?? 'market'
    const { orderId } = await sessao.colocarOrdem({
      tradableInstrumentId: c.instrumento.instrumento.tradableInstrumentId,
      routeId: c.instrumento.routeTrade,
      side: req.direction,
      qty,
      type: tipo,
      price: tipo === 'limit' ? req.openPrice ?? undefined : undefined,
      stopPrice: tipo === 'stop' ? req.openPrice ?? undefined : undefined,
      stopLoss: req.stopLoss,
      takeProfit: req.takeProfit,
      strategyId: 'MTM',
    })
    // A mercado a posição nasce já; o positionId serve a gestão (SL/parciais). Se ainda não
    // aparece no histórico, a gestão procura depois por instrumento.
    let positionId: string | null = null
    if (tipo === 'market') positionId = await sessao.posicaoDaOrdem(orderId).catch(() => null)
    // `?? undefined`: o OrderResult declara `positionId?: string`, portanto «nao sei»
    // escreve-se undefined, nao null (o & { positionId?: string | null } do
    // ResultadoOrdemTL nao alarga nada — a interseccao continua a dar string | undefined).
    return { success: true, orderId, positionId: positionId ?? undefined, qty, brokerSymbol: c.instrumento.instrumento.name }
  } catch (e) {
    return { success: false, error: e instanceof TradeLockerError ? e.message : `TradeLocker: ${msg(e)}` }
  }
}

// ── Gestão (break-even, mover SL, parciais, fecho) ──────────────────────────────────────────

export interface ResultadoGestaoTL {
  updated: number
  closed: number
  cancelled: number
  errors: string[]
}

async function posicoesDoSimbolo(sessao: TradeLockerSessao, simbolo: string | null): Promise<{ pos: TLPosicao[]; nomes: Map<number, string> }> {
  const [pos, lista] = await Promise.all([sessao.posicoes(), sessao.instrumentos()])
  const nomes = new Map(lista.map((i) => [i.tradableInstrumentId, i.name]))
  if (!simbolo) return { pos, nomes }
  return { pos: pos.filter((p) => symbolMatchesCanonical(nomes.get(p.tradableInstrumentId) ?? '', simbolo)), nomes }
}

/**
 * Aplica uma mensagem de gestão às posições do símbolo nesta conta.
 *
 * Parciais por TP: fecha a fracção da posição que corresponde ao TP (exit_pct_tp1/2/3 da ligação,
 * sobre o que ainda está aberto) e, no TP1, puxa o stop para a entrada. `premium_trade_active`
 * e trailing ficam de fora: são geridos no MT5 pelo monitor de preço, que não corre na TradeLocker.
 */
export async function aplicarGestaoTL(
  sessao: TradeLockerSessao,
  gestao: ParsedManagement,
  saidasPct: { tp1: number; tp2: number; tp3: number },
  apenasPosicoes?: string[] | null,
): Promise<ResultadoGestaoTL> {
  const r: ResultadoGestaoTL = { updated: 0, closed: 0, cancelled: 0, errors: [] }
  try {
    let { pos } = await posicoesDoSimbolo(sessao, gestao.symbol)
    if (apenasPosicoes?.length) pos = pos.filter((p) => apenasPosicoes.includes(p.id))
    if (!pos.length) return r

    const tp = gestao.type === 'premium_hit_tp1' ? 1 : gestao.tpLevel ?? null
    const parcial = (gestao.type === 'close' || gestao.type === 'premium_hit_tp1') && tp != null
    let fracao = 1
    if (parcial) {
      const p1 = saidasPct.tp1, p2 = saidasPct.tp2
      if (gestao.type === 'premium_hit_tp1' && gestao.closeAllAtProfit && !gestao.holdRemainderAtBE) fracao = 1
      else if (tp === 1) fracao = p1 / 100
      else if (tp === 2) fracao = 100 - p1 > 0 ? p2 / (100 - p1) : 1
      else fracao = 1
    }

    for (const p of pos) {
      try {
        if (gestao.type === 'close' || gestao.type === 'close_all' || gestao.type === 'cancel_orders' || gestao.type === 'premium_hit_tp1') {
          const detalhe = await sessao.detalhe(p.tradableInstrumentId, p.routeId).catch(() => null)
          const q = qtyParcial(p.qty, fracao, regraDeLote(detalhe))
          await sessao.fecharPosicao(p.id, q)
          r.closed++
          if (q > 0 && tp === 1) {
            await sessao.modificarPosicao(p.id, { stopLoss: p.avgPrice })
            r.updated++
          }
          continue
        }
        if (gestao.type === 'breakeven') {
          await sessao.modificarPosicao(p.id, { stopLoss: p.avgPrice })
          r.updated++
          continue
        }
        if (gestao.type === 'move_sl' && gestao.sl != null && gestao.sl > 0) {
          await sessao.modificarPosicao(p.id, { stopLoss: gestao.sl })
          r.updated++
        }
      } catch (e) {
        r.errors.push(msg(e))
      }
    }
  } catch (e) {
    r.errors.push(msg(e))
  }
  return r
}
