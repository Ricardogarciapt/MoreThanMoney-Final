import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { parseSignal, type ParsedSignal } from '@/lib/mtmcopy/signal-parser'
import {
  computeLotSize,
  getLotSizingSkipReason,
  signalForRiskSizing,
} from '@/lib/mtmcopy/lot-sizing'
import { fetchLotSizingContext, placeOrder, type OrderRequest } from '@/lib/mtmcopy/metaapi'
import { tapToTradeEnabledChannels, T2T_SIGNAL_CHANNELS as SIGNAL_CHANNELS } from '@/lib/mtmcopy/tap-to-trade-channels'

export const dynamic = 'force-dynamic'
// 60s: uma ligação MetaApi fria pode demorar até ~55s (CONNECT_TIMEOUT_MS). Com 30s a
// função expirava antes de abrir a trade sob carga/ligação fria. Com a cache de RPC
// quente, as execuções seguintes na mesma conta são rápidas.
export const maxDuration = 60

const supabase = getSupabaseAdmin()

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
    .select('id, channel_slug, content, telegram_message_id, created_at')
    .eq('id', chatMessageId)
    .maybeSingle()
  if (msgErr || !message) {
    return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 })
  }
  // Sinal expirado: passaram mais de 5 minutos desde a publicação
  const ageMs = message.created_at ? Date.now() - new Date(message.created_at).getTime() : 0
  if (ageMs > 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Sinal expirado — passaram mais de 5 minutos.', code: 'expired' }, { status: 410 })
  }
  // Provider tem de estar ativo no Tap to Trade (toggle em /admin/mtmcopy) — inclui rotas
  // custom sem sender_channel canónico. Fallback aos canais base se a config falhar.
  const enabledChannels = await tapToTradeEnabledChannels()
  const channelIsT2T = enabledChannels
    ? enabledChannels.has(message.channel_slug)
    : SIGNAL_CHANNELS.includes(message.channel_slug)
  if (!channelIsT2T) {
    return NextResponse.json({ error: 'Este provider não está ativo no Tap to Trade.', code: 'provider_off' }, { status: 403 })
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

  // 3. Conta destino — prefere a conta INDEPENDENTE do T2T (purpose=tap_to_trade);
  //    se não existir, usa qualquer conta MT5 ligada do utilizador.
  const { data: conns } = await supabase
    .from('mtmcopy_connections')
    .select('id, metaapi_account_id, lot_mode, lot_value, max_risk_percent, copy_sl, copy_tp, symbols_whitelist, is_active, purpose')
    .eq('user_id', user.id)
    .neq('mt5_status', 'disconnected')
  const withAccount = (conns ?? []).filter((c) => c.metaapi_account_id)
  const conn = withAccount.find((c) => c.purpose === 'tap_to_trade') ?? withAccount[0] ?? null

  if (!conn) {
    return NextResponse.json({ error: 'Sem conta ligada. Liga a tua conta MT5 no T2T.', code: 'no_connection' }, { status: 400 })
  }
  // T2T é manual e independente do MTMcopy: NÃO exige is_active (essa flag é da cópia
  // automática, que requer subscrição). Basta uma conta MT5 ligada.
  if (!conn.metaapi_account_id) {
    return NextResponse.json({ error: 'Conta MT5 não configurada (MetaAPI).', code: 'no_account' }, { status: 400 })
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

  // 5. Decidir tipo de ordem (market / limit / stop) conforme entry vs preço de mercado.
  //    BUY:  entry acima do mercado → STOP (breakout) · abaixo → LIMIT (pullback)
  //    SELL: entry abaixo do mercado → STOP · acima → LIMIT
  let orderType: 'market' | 'limit' | 'stop' = 'market'
  let openPrice: number | null = null
  if (signal.entry != null && signal.entry > 0) {
    const px = ctx.marketPrice
    if (px && px > 0) {
      const diff = Math.abs(signal.entry - px) / px
      if (diff < 0.0003) {
        orderType = 'market' // praticamente a mercado → entra já
      } else if (signal.direction === 'buy') {
        orderType = signal.entry > px ? 'stop' : 'limit'
        openPrice = signal.entry
      } else {
        orderType = signal.entry < px ? 'stop' : 'limit'
        openPrice = signal.entry
      }
    } else {
      orderType = 'limit' // sem preço de mercado → pendente no entry
      openPrice = signal.entry
    }
  }

  // 6. Executar na conta do utilizador (SL + 1.º TP; restantes TPs/gestão são espelhados do mestre)
  const orderReq: OrderRequest = {
    accountId: conn.metaapi_account_id,
    symbol: signal.symbol,
    direction: signal.direction,
    volume: lot,
    orderType,
    openPrice,
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
      // 'open' = posição T2T ativa a ser gerida (espelha o mestre); 'closed' quando fechada
      status: result.success ? 'open' : 'error',
      broker_position_id: result.success ? (result.orderId ?? null) : null,
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
