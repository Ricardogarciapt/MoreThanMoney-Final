import { type NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { executeAdminTestTrade } from '@/lib/mtmcopy/admin-test-trade'
import type { MtmcopyChannelKey } from '@/lib/mtmcopy/channel-context'
import { normalizeProviderExecutionProfile } from '@/lib/mtmcopy/provider-execution'
import type { ProviderExecutionProfile } from '@/lib/mtmcopy/signal-sources-config'

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const {
    account_id,
    channel,
    symbol,
    direction,
    order_type,
    volume,
    entry,
    sl,
    tp,
    execution,
    comment,
  } = body as {
    account_id?: string
    channel?: MtmcopyChannelKey
    symbol?: string
    direction?: 'buy' | 'sell'
    order_type?: 'market' | 'limit'
    volume?: number
    entry?: number | null
    sl?: number | null
    tp?: number | null
    execution?: Partial<ProviderExecutionProfile>
    comment?: string
  }

  if (!account_id?.trim()) {
    return NextResponse.json({ ok: false, error: 'account_id obrigatório' }, { status: 400 })
  }
  if (!symbol?.trim()) {
    return NextResponse.json({ ok: false, error: 'symbol obrigatório' }, { status: 400 })
  }
  if (direction !== 'buy' && direction !== 'sell') {
    return NextResponse.json({ ok: false, error: 'direction deve ser buy ou sell' }, { status: 400 })
  }

  const orderType = order_type === 'limit' ? 'limit' : 'market'
  if (orderType === 'limit' && (entry == null || !Number.isFinite(Number(entry)))) {
    return NextResponse.json({ ok: false, error: 'entry obrigatório para ordem limit' }, { status: 400 })
  }

  const result = await executeAdminTestTrade({
    accountId: account_id.trim(),
    channel: channel ?? 'premium-signals',
    symbol: symbol.trim().toUpperCase(),
    direction,
    orderType,
    volume: volume != null ? Number(volume) : undefined,
    entry: entry != null ? Number(entry) : null,
    sl: sl != null ? Number(sl) : null,
    tp: tp != null ? Number(tp) : null,
    execution: execution ? normalizeProviderExecutionProfile(execution) : null,
    comment,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 })
  }

  return NextResponse.json({
    success: true,
    ok: true,
    volume: result.volume,
    symbol: result.symbol,
    comment: result.comment,
    orderId: result.result?.orderId,
    brokerSymbol: result.result?.brokerSymbol,
    message: 'Trade de teste enviada à conta provider via MetaAPI',
  })
}
