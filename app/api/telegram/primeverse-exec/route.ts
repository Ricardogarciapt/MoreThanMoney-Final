import { NextRequest, NextResponse } from 'next/server'
import { placeOrder, type OrderRequest } from '@/lib/mtmcopy/metaapi'
import { getPrimeverseExecConfig } from '@/lib/mtmcopy/primeverse-exec'
import { computeRiskLot } from '@/lib/mtmcopy/risk-sizing'
import { getSiteOrigin } from '@/lib/site-url'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import { handlePrimeverseCancelClose } from '@/lib/mtmcopy/primeverse-lifecycle'

/** Classe de ativo → chat existente da app (reutilizados). */
function chatForSymbol(s: string): string | null {
  if (/XAU|GOLD|XAG|SILVER|OIL|WTI|BRENT|NAT.?GAS|NGAS|COPPER/i.test(s)) return 'sinais-scanner-mtm' // ouro/comodities
  if (/BTC|ETH|SOL|XRP|DOGE|BNB|ADA|LTC|USDT|USDC/i.test(s)) return 'cripto-perps'                    // cripto
  if (/NAS100|US30|US500|US100|SPX|SP500|GER40|DAX|UK100|JP225|NDX|DJI|NIKKEI|DOW/i.test(s)) return 'trade-ideas' // índices
  if (/^[A-Z]{6}$/.test(s) || /[A-Z]{3}\/[A-Z]{3}/.test(s)) return 'trade-ideas-setup'                // forex
  return null
}

/**
 * ACOMPANHAMENTO da posição no chat (sem thread, sem duplicar o card). Uma linha concisa por evento
 * do ciclo de vida (ENTRY HIT = ordem ativada, e no futuro TP/BE/fecho). NÃO inclui alvo "TP"/🎯 nem o
 * marcador "PrimeVerse" → `isT2TEntrySignal`/`t2tSourceKey` devolvem false, logo NUNCA vira nova
 * entrada Tap to Trade. Serve só para o seguidor manual gerir a posição que abriu no SETUP.
 */
async function postPrimeverseFollowup(slug: string, content: string) {
  try {
    const { data } = await getSupabaseAdmin()
      .from('chat_messages')
      .insert({ channel_slug: slug, user_id: null, content, message_type: 'telegram_forward', notified: true })
      .select('id').single()
    await sendTelegramChannelPush({ slug, content, chatMessageId: data?.id as string }).catch(() => {})
  } catch (e) {
    console.warn('[primeverse] followup erro:', e instanceof Error ? e.message : String(e))
  }
}

/** Insere o sinal (formato parseável) no chat da classe + dispara push T2T. */
async function feedPrimeverseChat(slug: string, symbol: string, direction: 'buy' | 'sell', sl: number | null, tp: number | null, trader?: string, timeframe?: string | null, entry?: number | null, tps?: number[]) {
  try {
    const tpList = (tps && tps.length ? tps : tp != null ? [tp] : []).filter((n) => n != null && n > 0)
    let content: string
    if (slug === 'cripto-perps') {
      // PERPS: formato padrão MTM ("— Novo Sinal"), fonte PrimeVerse OCULTA (pedido Ricardo).
      // Perps são executados via Bybit (não T2T) → não precisam do marcador no texto.
      const dir = direction === 'buy' ? '🔵 COMPRA' : '🔴 VENDA'
      content = [
        `🪙 Perpétuos Cripto — Novo Sinal`,
        ``,
        `📊 ${symbol}   ${dir}`,
        timeframe ? `⏱ Timeframe: ${timeframe}` : null,
        `🎯 Entrada: ${entry != null && entry > 0 ? entry : 'Mercado'}`,
        sl != null ? `🛑 Stop Loss: ${sl}` : null,
        ...tpList.map((t, i) => `✅ Take Profit ${i + 1}: ${t}`),
        ``,
        `🔎 Validação: 100%`,
        `⚠️ Não é aconselhamento financeiro.`,
      ].filter(Boolean).join('\n')
    } else {
      // OURO/FOREX/ÍNDICES: traz TODOS os dados do sinal (entrada, timeframe, SL, todos os TPs) ao chat
      // + T2T. MANTÉM a 1.ª linha `emoji SÍMBOLO DIREÇÃO` (o parser T2T lê símbolo/direção daqui) e o
      // marcador "📡 PrimeVerse" (o T2T depende dele para reconhecer a fonte). O parser aceita TP1/TP2/TP3
      // e "Entrada:" — logo o enriquecimento não parte a deteção.
      const tag = direction === 'buy' ? '🔵' : '🔴'
      const lines = [`${tag} ${symbol} ${direction.toUpperCase()}`]
      if (timeframe) lines.push(`⏱ Timeframe: ${timeframe}`)
      lines.push(`🎯 Entrada: ${entry != null && entry > 0 ? entry : 'Mercado'}`)
      if (sl != null) lines.push(`🛑 SL: ${sl}`)
      tpList.forEach((t, i) => lines.push(`✅ TP${i + 1}: ${t}`))
      lines.push('', `📡 PrimeVerse${trader ? ` · ${trader}` : ''}`)
      content = lines.join('\n')
    }
    const { data } = await getSupabaseAdmin()
      .from('chat_messages')
      .insert({ channel_slug: slug, user_id: null, content, message_type: 'telegram_forward', notified: true })
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
  timeframe?: string
  /** 'setup' = alerta pendente (só mostra o sinal, NÃO executa) · 'entry_hit' = o preço chegou ao
   *  Entry ("🟢 ENTRY HIT") → executa a MERCADO (preço ≈ entry, logo SL/TP ficam corretos).
   *  'cancel' = o trader cancelou a ordem pendente · 'close' = o trader fechou a posição →
   *  thread no chat + apaga/fecha as ordens T2T dos seguidores desse setup.
   *  Default 'entry_hit' (retrocompat). Os setups do kingfkg são níveis pendentes: entrar a mercado
   *  neles fica com o preço longe do Entry → SL enorme. Por isso só se executa no ENTRY HIT. */
  kind?: 'setup' | 'entry_hit' | 'cancel' | 'close'
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
  const kind: 'setup' | 'entry_hit' | 'cancel' | 'close' =
    b.kind === 'setup' ? 'setup' : b.kind === 'cancel' ? 'cancel' : b.kind === 'close' ? 'close' : 'entry_hit'
  // No ENTRY HIT o preço está NO Entry → entra a MERCADO (nunca limit longe do preço). No setup nunca
  // se executa, por isso o orderType do setup é irrelevante.
  const orderType: 'market' | 'limit' = kind === 'entry_hit' ? 'market' : ((b.orderType || '').toLowerCase() === 'limit' ? 'limit' : 'market')
  const entry = typeof b.entry === 'number' ? b.entry : null
  const sl = typeof b.sl === 'number' ? b.sl : null
  const tps = Array.isArray(b.tps) ? b.tps.filter((n) => typeof n === 'number' && n > 0) : []
  const timeframe = typeof b.timeframe === 'string' && b.timeframe.trim() ? b.timeframe.trim() : null

  const cfg = await getPrimeverseExecConfig()

  // SETUP (alerta pendente): só MOSTRA o sinal no chat da classe de ativo (de TODOS os traders) e
  // NÃO executa nada — o Entry do kingfkg é um nível pendente; entrar a mercado aqui poria o SL
  // enorme (preço longe do Entry). A execução acontece SÓ quando chega o "🟢 ENTRY HIT".
  const chatSlug = chatForSymbol(symbol)
  if (kind === 'setup') {
    if (chatSlug) await feedPrimeverseChat(chatSlug, symbol, direction, sl, tps[0] ?? null, trader, timeframe, entry, tps)
    return NextResponse.json({ ok: true, routed: chatSlug, kind, exec: 'aguarda_entry_hit' })
  }

  // ── kind === 'cancel' | 'close' ── o trader cancelou a ordem pendente ou fechou a posição →
  // thread no chat do setup + AUTO apaga/fecha as ordens T2T dos seguidores desse setup.
  if (kind === 'cancel' || kind === 'close') {
    if (!chatSlug) return NextResponse.json({ ok: true, routed: null, kind, exec: 'sem_chat' })
    const r = await handlePrimeverseCancelClose({ kind, chatSlug, symbol, direction })
    return NextResponse.json({ ok: true, routed: chatSlug, kind, ...r })
  }

  // ── kind === 'entry_hit' ── o preço chegou ao Entry → ativa a ordem (limit/stop) do sistema PrimeVerse.
  // Não re-mostra o card (já foi mostrado no setup) para não duplicar no chat, MAS acompanha a posição:
  // uma linha concisa a confirmar a ATIVAÇÃO, para o seguidor manual (Tap to Trade) gerir a partir daqui.
  // Postado para TODOS os traders do setup (não só os executados), antes do gate de execução.
  if (chatSlug) {
    const dirTxt = direction === 'buy' ? '🔵 COMPRA' : '🔴 VENDA'
    const line = [
      `✅ ENTRY HIT · ${symbol} ${dirTxt}${trader ? ` · ${trader}` : ''}`,
      sl != null ? `🛑 SL: ${sl}` : null,
      `Ordem ativada — gere a posição pelos alvos definidos no sinal.`,
    ].filter(Boolean).join('\n')
    await postPrimeverseFollowup(chatSlug, line)
  }

  // EXECUÇÃO: só o(s) trader(s) escolhido(s) (cfg.traders) — os outros ficam só no chat.
  if (!cfg.traders.includes(trader)) return NextResponse.json({ ok: true, routed: chatSlug, exec: 'skipped_trader', trader })

  // EXECUÇÃO: só XAUUSD/BTCUSD (a conta Sensei só trada esses), gated pelo modo.
  if (!ALLOWED.has(symbol)) return NextResponse.json({ ok: true, routed: chatSlug, exec: 'skipped_symbol' })
  if (cfg.mode === 'off') return NextResponse.json({ ok: true, routed: chatSlug, exec: 'off' })

  const tp = tps[cfg.tpLevel - 1] ?? tps[0] ?? null
  const wantBybit = symbol === 'BTCUSD' && cfg.bybit

  // Sizing: riskPct>0 → % ao SL na conta de execução; riskPct=0 → lote FIXO cfg.senseiLot.
  const sizing = cfg.riskPct > 0
    ? await computeRiskLot(cfg.accountId, symbol, sl, cfg.riskPct, entry, cfg.senseiLot)
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
      accountId: cfg.accountId,
      symbol,
      direction,
      volume: lot,
      orderType,
      openPrice: orderType === 'limit' ? entry : null,
      stopLoss: sl,
      takeProfit: tp, // tpLevel=1 → TP1 → posição fecha 100% no Exit 1
      comment: `PV ${trader}`.slice(0, 31),
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
