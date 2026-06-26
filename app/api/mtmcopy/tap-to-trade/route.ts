import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { parseSignal, type ParsedSignal } from '@/lib/mtmcopy/signal-parser'
import {
  computeLotSize,
  getLotSizingSkipReason,
  signalForRiskSizing,
} from '@/lib/mtmcopy/lot-sizing'
import { fetchLotSizingContext, placeOrder, type OrderRequest } from '@/lib/mtmcopy/metaapi'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const supabase = getSupabaseAdmin()

const SIGNAL_CHANNELS = ['sensei-scanner', 'trade-ideas', 'premium-ideas', 'trade-ideas-setup']

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)
  return error || !user ? null : user
}

/** Constrói um ParsedSignal a partir de uma ideia Sensei estruturada (fallback ao parser). */
function signalFromIdea(idea: {
  symbol: string | null
  direction: string | null
  entry: number | null
  sl: number | null
  tp: unknown
}): ParsedSignal | null {
  if (!idea.symbol || (idea.direction !== 'buy' && idea.direction !== 'sell')) return null
  const tp = Array.isArray(idea.tp)
    ? idea.tp.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : []
  return {
    symbol: idea.symbol,
    direction: idea.direction,
    entry: idea.entry ?? null,
    sl: idea.sl ?? null,
    tp,
    orderType: idea.entry != null ? 'limit' : 'market',
    raw: 'sensei_trade_idea',
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const chatMessageId = String((body as Record<string, unknown>).chat_message_id ?? '').trim()
  if (!chatMessageId) {
    return NextResponse.json({ error: 'chat_message_id obrigatório' }, { status: 400 })
  }

  // 1. Mensagem do chat
  const { data: message, error: msgErr } = await supabase
    .from('chat_messages')
    .select('id, channel_slug, content, telegram_message_id')
    .eq('id', chatMessageId)
    .maybeSingle()
  if (msgErr || !message) {
    return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 })
  }
  if (!SIGNAL_CHANNELS.includes(message.channel_slug)) {
    return NextResponse.json({ error: 'Esta mensagem não é um sinal de trading' }, { status: 400 })
  }

  // 2. Interpretar o sinal — parser do conteúdo, com fallback à ideia Sensei estruturada
  let signal: ParsedSignal | null = message.content ? parseSignal(message.content) : null
  if (!signal || !signal.symbol || !signal.direction) {
    const { data: idea } = await supabase
      .from('sensei_trade_ideas')
      .select('symbol, direction, entry, sl, tp')
      .eq('chat_message_id', chatMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (idea) signal = signalFromIdea(idea)
  }
  if (!signal || !signal.symbol || !signal.direction) {
    return NextResponse.json({ error: 'Não foi possível interpretar o sinal desta mensagem' }, { status: 400 })
  }

  // 3. Conta + risco do utilizador
  const { data: conn } = await supabase
    .from('mtmcopy_connections')
    .select('id, metaapi_account_id, lot_mode, lot_value, max_risk_percent, copy_sl, copy_tp, symbols_whitelist, is_active')
    .eq('user_id', user.id)
    .order('is_active', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conn) {
    return NextResponse.json({ error: 'Sem conta configurada. Define a tua conta em Definições.', code: 'no_connection' }, { status: 400 })
  }
  if (!conn.is_active) {
    return NextResponse.json({ error: 'A tua conta MTMcopier está inativa.', code: 'inactive' }, { status: 400 })
  }
  if (!conn.metaapi_account_id) {
    return NextResponse.json({ error: 'Conta MT5 não configurada (MetaAPI). Define-a em Definições.', code: 'no_account' }, { status: 400 })
  }

  // Whitelist de símbolos (se definida)
  const symU = signal.symbol.toUpperCase()
  if (Array.isArray(conn.symbols_whitelist) && conn.symbols_whitelist.length) {
    const allowed = conn.symbols_whitelist.some((s) => symU.includes(String(s).toUpperCase()))
    if (!allowed) {
      return NextResponse.json({ error: `${signal.symbol} não está na tua whitelist de símbolos.` }, { status: 400 })
    }
  }

  // 4. Saldo + preço de mercado → lote por risco
  const ctx = await fetchLotSizingContext(conn.metaapi_account_id, signal.symbol, signal.direction)
  const riskSignal = signalForRiskSizing(signal, ctx.marketPrice)
  const lot = computeLotSize(conn, riskSignal, ctx.balance)
  const skip = getLotSizingSkipReason(conn, signal, ctx.balance, lot, ctx.marketPrice)
  if (skip) {
    return NextResponse.json({ error: skip }, { status: 400 })
  }

  // 5. Executar na conta do utilizador
  const orderReq: OrderRequest = {
    accountId: conn.metaapi_account_id,
    symbol: signal.symbol,
    direction: signal.direction,
    volume: lot,
    orderType: signal.orderType === 'limit' && signal.entry != null ? 'limit' : 'market',
    openPrice: signal.orderType === 'limit' ? signal.entry : null,
    stopLoss: conn.copy_sl !== false ? signal.sl : null,
    takeProfit: conn.copy_tp !== false ? (signal.tp?.[0] ?? null) : null,
    comment: 'TapToTrade MTM',
  }
  const result = await placeOrder(orderReq)

  // 6. Log
  await supabase
    .from('mtmcopy_signal_log')
    .insert({
      user_id: user.id,
      connection_id: conn.id,
      symbol: signal.symbol,
      direction: signal.direction,
      entry: signal.entry,
      sl: signal.sl,
      tp: signal.tp?.[0] ?? null,
      lot,
      status: result.success ? 'executed' : 'error',
      detail: result.success
        ? `Tap to Trade · ordem ${orderReq.orderType} · ${result.orderId ?? ''}`.trim()
        : `Tap to Trade falhou: ${result.error ?? 'erro'}`,
      channel_key: message.channel_slug,
      telegram_message_id: message.telegram_message_id ?? null,
    })
    .then(undefined, (e) => console.error('[tap-to-trade] log error:', e))

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Falha ao abrir a ordem' }, { status: 502 })
  }

  return NextResponse.json({
    success: true,
    orderId: result.orderId,
    symbol: result.brokerSymbol ?? signal.symbol,
    direction: signal.direction,
    lot,
    sl: orderReq.stopLoss,
    tp: orderReq.takeProfit,
    message: `Trade ${signal.direction.toUpperCase()} ${signal.symbol} aberta · ${lot} lote`,
  })
}
