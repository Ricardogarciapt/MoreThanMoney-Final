import { NextRequest, NextResponse } from 'next/server'
import { placeOrder, type OrderRequest } from '@/lib/mtmcopy/metaapi'
import { CANONICAL_SENSEI_ACCOUNT_ID } from '@/lib/mtmcopy/provider-constants'
import { getPrimeverseExecConfig } from '@/lib/mtmcopy/primeverse-exec'
import { computeRiskLot } from '@/lib/mtmcopy/risk-sizing'
import { getSiteOrigin } from '@/lib/site-url'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'

/** Classe de ativo → chat existente da app (reutilizados). */
function chatForSymbol(s: string): string | null {
  if (/XAU|GOLD|XAG|SILVER|OIL|WTI|BRENT|NAT.?GAS|NGAS|COPPER/i.test(s)) return 'sinais-scanner-mtm' // ouro/comodities
  if (/BTC|ETH|SOL|XRP|DOGE|BNB|ADA|LTC|USDT|USDC/i.test(s)) return 'cripto-perps'                    // cripto
  if (/NAS100|US30|US500|US100|SPX|SP500|GER40|DAX|UK100|JP225|NDX|DJI|NIKKEI|DOW/i.test(s)) return 'trade-ideas' // índices
  if (/^[A-Z]{6}$/.test(s) || /[A-Z]{3}\/[A-Z]{3}/.test(s)) return 'trade-ideas-setup'                // forex
  return null
}

/** Insere o sinal (formato parseável) no chat da classe + dispara push T2T. */
async function feedPrimeverseChat(slug: string, symbol: string, direction: 'buy' | 'sell', sl: number | null, tp: number | null) {
  try {
    const tag = direction === 'buy' ? '🔵' : '🔴'
    const lines = [`${tag} ${symbol} ${direction.toUpperCase()}`]
    if (sl != null) lines.push(`SL: ${sl}`)
    if (tp != null) lines.push(`TP: ${tp}`)
    lines.push('', '📡 PrimeVerse')
    const content = lines.join('\n')
    const { data } = await getSupabaseAdmin()
      .from('chat_messages')
      .insert({ channel_slug: slug, user_id: null, content, message_type: 'primeverse_signal', notified: true })
      .select('id').single()
    await sendTelegramChannelPush({ slug, content, chatMessageId: data?.id as string }).catch(() => {})
  } catch (e) {
    console.warn('[primeverse] feedChat erro:', e instanceof Error ? e.message : String(e))
  }
}

/**
 * Execução dos sinais do TOP trader PrimeVerse (relay pv-relay) no sistema Sensei.
 *  - XAUUSD → MTM Auto Sensei (mADd) via MetaApi.
 *  - BTCUSD → MTM Auto Sensei (mADd) + perps Bybit (POST /api/bybit/place, gate próprio).
 * Bearer CRON_SECRET. Flag-gated: off / shadow / live (default off).
 */
export const dynamic = 'force-dynamic'

interface Body {
  trader?: string
  symbol?: string
  direction?: string   // buy|sell
  orderType?: string   // market|limit
  entry?: number
  sl?: number
  tps?: number[]
}

const ALLOWED = new Set(['XAUUSD', 'BTCUSD'])

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || (req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const b = (await req.json().catch(() => ({}))) as Body
  const trader = (b.trader || '').toString().trim().toLowerCase()
  const symbol = (b.symbol || '').toString().trim().toUpperCase()
  const dir = (b.direction || '').toString().trim().toLowerCase()
  const direction: 'buy' | 'sell' = dir === 'sell' ? 'sell' : 'buy'
  const orderType: 'market' | 'limit' = (b.orderType || '').toLowerCase() === 'limit' ? 'limit' : 'market'
  const entry = typeof b.entry === 'number' ? b.entry : null
  const sl = typeof b.sl === 'number' ? b.sl : null
  const tps = Array.isArray(b.tps) ? b.tps.filter((n) => typeof n === 'number' && n > 0) : []

  const cfg = await getPrimeverseExecConfig()

  if (trader !== cfg.trader) return NextResponse.json({ ok: true, skipped: 'trader', trader })

  // ROUTING: encaminha para o chat da CLASSE DE ATIVO + push T2T (todos os ativos, independente
  // do modo de execução — é display/T2T, não execução). Reutiliza os chats existentes.
  const chatSlug = chatForSymbol(symbol)
  if (chatSlug) await feedPrimeverseChat(chatSlug, symbol, direction, sl, tps[0] ?? null)

  // EXECUÇÃO: só XAUUSD/BTCUSD (a conta Sensei só trada esses), gated pelo modo.
  if (!ALLOWED.has(symbol)) return NextResponse.json({ ok: true, routed: chatSlug, exec: 'skipped_symbol' })
  if (cfg.mode === 'off') return NextResponse.json({ ok: true, routed: chatSlug, exec: 'off' })

  const tp = tps[cfg.tpLevel - 1] ?? tps[0] ?? null
  const wantBybit = symbol === 'BTCUSD' && cfg.bybit

  // Sizing por RISCO (0.5% ao SL) na conta Sensei — usa a entry do sinal do kingfkg.
  const sizing = cfg.riskPct > 0
    ? await computeRiskLot(CANONICAL_SENSEI_ACCOUNT_ID, symbol, sl, cfg.riskPct, entry, cfg.senseiLot)
    : { lot: cfg.senseiLot, basis: 'fixed' as const, equity: null, entry }
  const lot = sizing.lot

  const summary = { trader, symbol, direction, orderType, entry, sl, tp, lot, sizing: sizing.basis, riskPct: cfg.riskPct, bybit: wantBybit }

  if (cfg.mode === 'shadow') {
    console.log('[primeverse-exec] SHADOW —', JSON.stringify(summary))
    return NextResponse.json({ ok: true, mode: 'shadow', wouldExecute: summary })
  }

  // ---- live ----
  const out: Record<string, unknown> = { mode: 'live', symbol, trader }

  // 1) Sensei (MT5 / mADd)
  try {
    const orderReq: OrderRequest = {
      accountId: CANONICAL_SENSEI_ACCOUNT_ID,
      symbol,
      direction,
      volume: lot,
      orderType,
      openPrice: orderType === 'limit' ? entry : null,
      stopLoss: sl,
      takeProfit: tp,
      comment: 'PV kingfkg',
    }
    const r = await placeOrder(orderReq)
    out.sensei = { ok: r.success, orderId: r.orderId, error: r.error }
  } catch (e) {
    out.sensei = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  // 2) Bybit perps (só BTC) — gate próprio BYBIT_PERPS_EXEC_ENABLED
  if (wantBybit) {
    try {
      const r = await fetch(`${getSiteOrigin()}/api/bybit/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ symbol: 'BTCUSD', side: direction, entry, sl, tps }),
      })
      out.bybit = await r.json().catch(() => ({ ok: false, error: 'bad json' }))
    } catch (e) {
      out.bybit = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return NextResponse.json({ ok: true, ...out })
}
