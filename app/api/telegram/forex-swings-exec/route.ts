import { NextRequest, NextResponse } from 'next/server'
import { placeOrder, type OrderRequest } from '@/lib/mtmcopy/metaapi'
import { tradeIdeasTrailingDistance } from '@/lib/mtmcopy/pip-points'
import { getForexSwingsExecConfig } from '@/lib/mtmcopy/forex-swings-exec'
import { computeRiskLot } from '@/lib/mtmcopy/risk-sizing'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import { formatarSinal } from '@/lib/sinais/formato-sinal'

const FS_CHAT_SLUG = 'ideias-e-sinais'

/** Insere o sinal (formato parseável) no chat da app + dispara push T2T. Independente da execução. */
async function feedAppChat(symbol: string, direction: 'buy' | 'sell', sl: number | null, tp: number | null) {
  try {
    // Formato único (lib/sinais/formato-sinal). «Forex Swings» na etiqueta é a assinatura da fonte
    // para o T2T (t2tSourceKey → james); entrada a mercado, set & forget.
    const content = formatarSinal({
      estrategia: 'MTM Auto Forex Swings',
      simbolo: symbol,
      direcao: direction,
      entrada: null,
      sl,
      tps: tp != null ? [tp] : [],
      extras: ['🌊 Set & forget — sem trailing'],
    })
    const { data, error } = await getSupabaseAdmin()
      .from('chat_messages')
      .insert({ channel_slug: FS_CHAT_SLUG, user_id: null, content, message_type: 'telegram_forward', notified: true })
      .select('id')
      .single()
    if (error) { console.warn('[forex-swings-exec] chat insert falhou:', error.message); return }
    await sendTelegramChannelPush({ slug: FS_CHAT_SLUG, content, chatMessageId: data?.id as string }).catch(() => {})
  } catch (e) {
    console.warn('[forex-swings-exec] feedAppChat erro:', e instanceof Error ? e.message : String(e))
  }
}

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
  /** 'close'|'cancel' = a fonte (James) fechou/cancelou → espelha nas ordens T2T dos seguidores. */
  kind?: 'entry' | 'close' | 'cancel'
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

  // RECEÇÃO: corta a montante se o canal estiver desligado no admin.
  {
    const { isIntakeEnabled } = await import('@/lib/mtmcopy/intake-switches')
    if (!(await isIntakeEnabled('forex_swings'))) {
      return NextResponse.json({ ok: true, skipped: 'intake_off', channel: 'forex_swings' })
    }
  }

  // FECHO/CANCELAMENTO da fonte → espelha nas ordens T2T dos seguidores (chat ideias-e-sinais).
  // Só precisa do símbolo (a direção é opcional: se James não a der, casa qualquer direção do par).
  if (body.kind === 'close' || body.kind === 'cancel') {
    if (!symbol) return NextResponse.json({ ok: false, error: 'symbol obrigatório' }, { status: 400 })
    const { closeT2TFollowersForSignal } = await import('@/lib/mtmcopy/t2t-lifecycle')
    const r = await closeT2TFollowersForSignal({
      kind: body.kind,
      chatSlug: FS_CHAT_SLUG,
      symbol,
      direction: dir ? direction : null,
      label: 'Forex Swings',
      sourceMatch: /forex\s*swings/i,
    })
    return NextResponse.json({ ok: true, kind: body.kind, ...r })
  }

  if (!symbol || !dir) {
    return NextResponse.json({ ok: false, error: 'symbol e side obrigatórios' }, { status: 400 })
  }

  const cfg = await getForexSwingsExecConfig()
  // Sem conta-mestre (a antiga foi apagada na MetaApi): não executa — cada pedido a uma conta
  // inexistente conta para o estrangulamento do token inteiro.
  if (!cfg.accountId) cfg.mode = 'off'

  // Sempre: alimenta o chat da app + push T2T (membros veem e podem executar na conta deles).
  await feedAppChat(symbol, direction, sl, tp)

  // Sizing por RISCO (0.5% ao SL) — ordem a mercado, sem entry → usa o preço de mercado atual.
  // Com riskPct=0 usa lote FIXO cfg.lot. Conta-mestre configurável (cfg.accountId).
  const sizing = cfg.riskPct > 0
    ? await computeRiskLot(cfg.accountId, symbol, sl, cfg.riskPct, null, cfg.lot)
    : { lot: cfg.lot, basis: 'fixed' as const, equity: null, entry: null }
  const lot = sizing.lot

  const orderReq: OrderRequest = {
    accountId: cfg.accountId, // conta-mestre Forex Swings (configurável em site_settings.forex_swings_execution)
    symbol,
    direction,
    volume: lot,
    orderType: 'market',
    openPrice: null,
    stopLoss: sl,
    takeProfit: tp,
    comment: 'Forex Swings',
    // SEM trailing por decisão do Ricardo (2026-08-13): os Forex Swings são swings de gestão
    // própria (SL/TP fixos), o trailing tirava movimento. Só liga se vier trailing:true explícito.
    trailingStop: body.trailing === true ? tradeIdeasTrailingDistance() : null,
  }

  if (cfg.mode === 'off') {
    return NextResponse.json({ ok: true, skipped: 'off' })
  }

  const summary = { symbol, direction, lot, sizing: sizing.basis, riskPct: cfg.riskPct, sl, tp, comment: 'Forex Swings', trailing: orderReq.trailingStop != null }

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
