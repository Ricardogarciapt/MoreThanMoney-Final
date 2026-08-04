import { NextRequest, NextResponse } from 'next/server'
import { placeOrder, type OrderRequest } from '@/lib/mtmcopy/metaapi'
import { tradeIdeasTrailingDistance } from '@/lib/mtmcopy/pip-points'
import { CANONICAL_TRADE_IDEAS_ACCOUNT_ID } from '@/lib/mtmcopy/provider-constants'
import { getForexSwingsExecConfig } from '@/lib/mtmcopy/forex-swings-exec'

/**
 * Execução dos sinais "Forex Swings" (relay fs-relay do canal James) na conta mestre MTM Auto Forex.
 * O CopyFactory replica o fill do mestre para os subscritores (5IHE) — não é preciso código slave.
 * Autenticado por Bearer CRON_SECRET (server-to-server). Flag-gated: off / shadow / live (default off).
 */
export const dynamic = 'force-dynamic'

interface Body {
  symbol?: string
  side?: string
  sl?: number
  tp?: number
  comment?: string
  trailing?: boolean
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as Body
  const symbol = (body.symbol || '').toString().trim().toUpperCase()
  const dir = (body.side || '').toString().trim().toLowerCase()
  const direction: 'buy' | 'sell' = dir === 'buy' || dir === 'compra' ? 'buy' : 'sell'
  const sl = typeof body.sl === 'number' ? body.sl : null
  const tp = typeof body.tp === 'number' ? body.tp : null
  if (!symbol || !dir) {
    return NextResponse.json({ ok: false, error: 'symbol e side obrigatórios' }, { status: 400 })
  }

  const cfg = await getForexSwingsExecConfig()

  const orderReq: OrderRequest = {
    accountId: CANONICAL_TRADE_IDEAS_ACCOUNT_ID, // fbeeafeb — MTM Auto Forex (5IHE)
    symbol,
    direction,
    volume: cfg.lot,
    orderType: 'market',
    openPrice: null,
    stopLoss: sl,
    takeProfit: tp,
    comment: 'Forex Swings',
    // set & forget: trailing dinâmico padrão da conta Forex (BE + trail server-side)
    trailingStop: body.trailing === false ? null : tradeIdeasTrailingDistance(),
  }

  if (cfg.mode === 'off') {
    return NextResponse.json({ ok: true, skipped: 'off' })
  }

  const summary = { symbol, direction, lot: cfg.lot, sl, tp, comment: 'Forex Swings', trailing: orderReq.trailingStop != null }

  if (cfg.mode === 'shadow') {
    console.log('[forex-swings-exec] SHADOW — abriria:', JSON.stringify(summary))
    return NextResponse.json({ ok: true, mode: 'shadow', wouldOpen: summary })
  }

  // live
  try {
    const result = await placeOrder(orderReq)
    console.log('[forex-swings-exec] LIVE result:', JSON.stringify(result))
    return NextResponse.json({ ok: result.success, mode: 'live', orderId: result.orderId, brokerSymbol: result.brokerSymbol, error: result.error })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[forex-swings-exec] erro:', msg)
    return NextResponse.json({ ok: false, mode: 'live', error: msg }, { status: 500 })
  }
}
