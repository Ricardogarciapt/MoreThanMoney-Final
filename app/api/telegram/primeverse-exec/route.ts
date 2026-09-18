import { NextRequest, NextResponse } from 'next/server'
import { placeOrder, type OrderRequest } from '@/lib/mtmcopy/metaapi'
import { getPrimeverseExecConfig } from '@/lib/mtmcopy/primeverse-exec'
import { computeRiskLot } from '@/lib/mtmcopy/risk-sizing'
import { getSiteOrigin } from '@/lib/site-url'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import { handlePrimeverseCancelClose } from '@/lib/mtmcopy/primeverse-lifecycle'
import { estrategiaDoTrader, formatarSeguimento, formatarSinal, lerSinal } from '@/lib/sinais/formato-sinal'
import { lifecycleMessage } from '@/lib/mtmcopy/signal-lifecycle'
import { normalizeSymbol } from '@/lib/mtmcopy/signal-parser'
import { encaminharPrimeverseParaEstrategia, type KindPrimeverse } from '@/lib/mtmfunded/estrategias-sinais/executar'

/**
 * CANAL «MTM Auto Edge/Wolf/King» (slug `sinais-scanner-mtm`, 18/09).
 *
 * Os sinais dos traders fxedge / kingfkg / g_wolf são as estratégias MTM Auto Edge / King / Wolf
 * (migração 092) e publicam-se TODOS aqui, seja qual for o activo — ouro, índices, forex ou cripto
 * (no iOS o cripto sai mensagem a mensagem, pelo texto). Os outros traders da fonte deixam de ir ao
 * chat. O nome da fonte externa não aparece em lado nenhum: nem no texto, nem no remetente.
 *
 * Antes cada activo ia para o chat da sua classe (ouro → sinais-scanner-mtm, índices →
 * trade-ideas, forex → trade-ideas-setup, cripto → cripto-perps) com a assinatura da fonte; o canal
 * «Sinais PrimeVerse» deixou de existir.
 */
const CANAL_EKW = 'sinais-scanner-mtm'

/** Procura a mensagem do SETUP desta estratégia/par/direcção nas últimas 48 h (para a thread). */
async function acharSetup(estrategia: string, symbol: string, direction: 'buy' | 'sell'): Promise<string | null> {
  try {
    const desde = new Date(Date.now() - 48 * 3600_000).toISOString()
    const { data } = await getSupabaseAdmin()
      .from('chat_messages')
      .select('id, content')
      .eq('channel_slug', CANAL_EKW)
      .is('reply_to_id', null)
      .gte('created_at', desde)
      .ilike('content', `%${estrategia} ·%`)
      .order('created_at', { ascending: false })
      .limit(30)
    for (const m of (data ?? []) as { id: string; content: string | null }[]) {
      const lido = lerSinal(m.content)
      if (lido && lido.estrategia === estrategia && lido.direcao === direction && normalizeSymbol(lido.simbolo) === normalizeSymbol(symbol)) {
        return m.id
      }
    }
  } catch { /* sem thread */ }
  return null
}

/** Insere no canal Edge/King/Wolf + push. Devolve o id da mensagem. */
async function publicarNoCanal(content: string, estrategia: string, replyTo: string | null): Promise<string | null> {
  try {
    const insert: Record<string, unknown> = {
      channel_slug: CANAL_EKW,
      user_id: null,
      content,
      message_type: 'telegram_forward',
      // Remetente = a estratégia. Sem remetente o chat mostrava «Telegram» com o ícone do Telegram.
      telegram_sender: estrategia,
      notified: true,
    }
    if (replyTo) insert.reply_to_id = replyTo
    const { data } = await getSupabaseAdmin().from('chat_messages').insert(insert).select('id').single()
    const id = (data?.id as string | undefined) ?? null
    await sendTelegramChannelPush({ slug: CANAL_EKW, content, chatMessageId: id ?? undefined }).catch(() => {})
    return id
  } catch (e) {
    console.warn('[ekw] chat erro:', e instanceof Error ? e.message : String(e))
    return null
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
  kind?: 'setup' | 'entry_hit' | 'cancel' | 'close' | 'tp_hit' | 'sl_be' | 'sl_hit'
  /** id da mensagem do SETUP no canal (relay com PV_FOLLOWUPS) — chave exacta das estratégias MTM Auto Edge/King/Wolf */
  setup_msg_id?: number | string
  /** tp_hit: nível · sl_be: preço do BE */
  level?: number
  price?: number
}

const KINDS = new Set(['setup', 'entry_hit', 'cancel', 'close', 'tp_hit', 'sl_be', 'sl_hit'])

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
  // Sem kind = entry_hit (retrocompat). Um kind DESCONHECIDO nunca vira execução.
  if (b.kind != null && !KINDS.has(String(b.kind))) {
    return NextResponse.json({ ok: true, skipped: 'kind_desconhecido', kind: b.kind })
  }
  const kind = (b.kind ?? 'entry_hit') as KindPrimeverse
  // No ENTRY HIT o preço está NO Entry → entra a MERCADO (nunca limit longe do preço). No setup nunca
  // se executa, por isso o orderType do setup é irrelevante.
  const orderType: 'market' | 'limit' = kind === 'entry_hit' ? 'market' : ((b.orderType || '').toLowerCase() === 'limit' ? 'limit' : 'market')
  const entry = typeof b.entry === 'number' ? b.entry : null
  const sl = typeof b.sl === 'number' ? b.sl : null
  const tps = Array.isArray(b.tps) ? b.tps.filter((n) => typeof n === 'number' && n > 0) : []
  const timeframe = typeof b.timeframe === 'string' && b.timeframe.trim() ? b.timeframe.trim() : null

  // RECEÇÃO: corta a montante se o canal estiver desligado no admin (nada entra/executa/notifica).
  {
    const { isIntakeEnabled } = await import('@/lib/mtmcopy/intake-switches')
    if (!(await isIntakeEnabled('primeverse'))) {
      return NextResponse.json({ ok: true, skipped: 'intake_off', channel: 'primeverse' })
    }
  }

  // MTM Auto Edge / King / Wolf (092): o sinal do trader filtrado abre nas contas MTM Funded da
  // estratégia (mestre da casa + seguidoras). Independente do resto desta rota e nunca a parte.
  const estrategia = trader && symbol
    ? await encaminharPrimeverseParaEstrategia({
        kind, trader, symbol, direction, entry, sl, tps,
        setupMsgId: b.setup_msg_id ?? null,
      }).catch((e) => ({ skipped: `erro: ${e instanceof Error ? e.message : String(e)}` }))
    : null

  // Seguimentos novos (relay com PV_FOLLOWUPS): só interessam às estratégias acima.
  if (kind === 'tp_hit' || kind === 'sl_be' || kind === 'sl_hit') {
    return NextResponse.json({ ok: true, kind, estrategia })
  }

  const cfg = await getPrimeverseExecConfig()
  // Sem conta de execução (a antiga foi apagada na MetaApi): não executa.
  if (!cfg.accountId) cfg.mode = 'off'

  // SETUP (alerta pendente): só MOSTRA o sinal no chat da classe de ativo (de TODOS os traders) e
  // NÃO executa nada — o Entry do kingfkg é um nível pendente; entrar a mercado aqui poria o SL
  // enorme (preço longe do Entry). A execução acontece SÓ quando chega o "🟢 ENTRY HIT".
  // Só as estratégias Edge / King / Wolf vão ao chat.
  const nomeEstrategia = estrategiaDoTrader(trader)
  const chatSlug = nomeEstrategia ? CANAL_EKW : null
  if (kind === 'setup') {
    if (nomeEstrategia) {
      const texto = formatarSinal({
        estrategia: nomeEstrategia,
        simbolo: symbol,
        direcao: direction,
        entrada: entry,
        sl,
        tps,
        timeframe,
        estado: 'Novo sinal',
      })
      await publicarNoCanal(texto, nomeEstrategia, null)
    }
    return NextResponse.json({ ok: true, routed: chatSlug, kind, exec: 'aguarda_entry_hit', estrategia })
  }

  // ── kind === 'cancel' | 'close' ── o trader cancelou a ordem pendente ou fechou a posição →
  // thread no chat do setup + AUTO apaga/fecha as ordens T2T dos seguidores desse setup.
  if (kind === 'cancel' || kind === 'close') {
    if (!chatSlug || !nomeEstrategia) return NextResponse.json({ ok: true, routed: null, kind, exec: 'sem_chat', estrategia })
    const r = await handlePrimeverseCancelClose({ kind, chatSlug, symbol, direction, estrategia: nomeEstrategia })
    return NextResponse.json({ ok: true, routed: chatSlug, kind, ...r, estrategia })
  }

  // ── kind === 'entry_hit' ── o preço chegou ao Entry → ativa a ordem (limit/stop) do sistema PrimeVerse.
  // Não re-mostra o card (já foi mostrado no setup) para não duplicar no chat, MAS acompanha a posição:
  // uma linha concisa a confirmar a ATIVAÇÃO, para o seguidor manual (Tap to Trade) gerir a partir daqui.
  // Postado para TODOS os traders do setup (não só os executados), antes do gate de execução.
  if (chatSlug && nomeEstrategia) {
    // Seguimento em THREAD no sinal (formato único): o mesmo texto canónico do motor de preço.
    // Uma vez por sinal — o tracker também anuncia a entrada quando a mede pelo preço.
    const setupId = await acharSetup(nomeEstrategia, symbol, direction)
    let jaAnunciado = false
    if (setupId) {
      const { data: dup } = await getSupabaseAdmin()
        .from('chat_messages')
        .select('id')
        .eq('reply_to_id', setupId)
        .ilike('content', '✅ ENTRY HIT%')
        .limit(1)
        .maybeSingle()
      jaAnunciado = !!dup
    }
    if (!jaAnunciado) {
      const { text } = lifecycleMessage('entry_hit', { symbol, direction, price: entry })
      await publicarNoCanal(formatarSeguimento(text, nomeEstrategia), nomeEstrategia, setupId)
    }
  }

  // EXECUÇÃO: só o(s) trader(s) escolhido(s) (cfg.traders) — os outros ficam só no chat.
  if (!cfg.traders.includes(trader)) return NextResponse.json({ ok: true, routed: chatSlug, exec: 'skipped_trader', trader, estrategia })

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
  const out: Record<string, unknown> = { mode: 'live', symbol, trader, estrategia }

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
      // Sem o nome da fonte externa: o comentário chega às contas copiadoras.
      comment: (nomeEstrategia ?? 'MTM Auto').slice(0, 31),
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
