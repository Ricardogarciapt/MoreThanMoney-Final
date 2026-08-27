import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { entradaT2T } from '@/lib/mtmcopy/t2t-entry'
import { parseSignal, type ParsedSignal } from '@/lib/mtmcopy/signal-parser'
import { isAllowedT2TSource, t2tMode, t2tSourceKey } from '@/lib/mtmcopy/t2t-source'
import { slComMinimo } from '@/lib/mtmcopy/source-risk-rules'
import {
  computeLotSize,
  getLotSizingSkipReason,
  signalForRiskSizing,
} from '@/lib/mtmcopy/lot-sizing'
import { fetchLotSizingContext, getAccountSnapshot, placeOrder, type OrderRequest } from '@/lib/mtmcopy/metaapi'
import { evaluatePropFirmGuard, propFirmLabel } from '@/lib/mtmcopy/prop-firm-guard'
import { isMarketOpen } from '@/lib/mtmcopy/market-hours'
import { symbolMatchesCanonical } from '@/lib/mtmcopy/symbol-resolver'
import { tapToTradeEnabledChannels, T2T_SIGNAL_CHANNELS as SIGNAL_CHANNELS } from '@/lib/mtmcopy/tap-to-trade-channels'
import { sinalJaSaiuDaZona, JANELA_MERCADO_MS } from '@/lib/mtmcopy/t2t-janela'

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

/** Um follow-up que ATIVA ou FECHA o setup (deixa de ser "pendente por tocar"). */
const SETUP_RESOLVED_RE =
  /(entry\s*hit|ativad|activad|tp\s*\d?\s*(hit|atingid)|hit\s*tp|exit\s*\d?\s*(hit|atingid|done|✅)?|sa[íi]da\s*\d|parcial|sl\s*hit|stop\s*loss\s*hit|break\s*even|\bbe\b|trade\s+active|running|fechad|posi[çc][aã]o\s+fechada|closed|close\s+all|cancelad|encerrad|descartad|invalidad|(alvo\s+(final|\d)|stop\s+loss|trailing\s+ativo)\s*·)/i

/**
 * O SETUP ainda está PENDENTE (por tocar) e aceitável fora da janela dos 5 min?
 * É pendente se a mensagem tem um nível de ENTRADA (zona/limite) e NÃO houver, no mesmo canal e
 * DEPOIS dela, um follow-up do MESMO par que a ative/feche. Janela máxima de segurança: 24h.
 */
async function isPendingSetupStillOpen(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  message: { id: string; channel_slug: string; content: string | null; created_at: string | null },
): Promise<boolean> {
  try {
    if (!message.created_at || !message.content) return false
    const ageMs = Date.now() - new Date(message.created_at).getTime()
    if (ageMs > 24 * 60 * 60 * 1000) return false // guarda: setups de ontem não abrem

    const parsed = parseSignal(message.content)
    // Só setups com NÍVEL de entrada (zona/limite) — entradas a mercado continuam a expirar aos 5 min.
    if (!parsed?.symbol || !(parsed.entry != null && parsed.entry > 0)) return false

    const symbolCore = parsed.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    const { data: laterMsgs } = await supabase
      .from('chat_messages')
      .select('content')
      .eq('channel_slug', message.channel_slug)
      .gt('created_at', message.created_at)
      .order('created_at', { ascending: true })
      .limit(80)
    for (const m of laterMsgs ?? []) {
      const c = String((m as { content?: string }).content ?? '')
      if (!c) continue
      const cU = c.toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (symbolCore && !cU.includes(symbolCore)) continue // outro par → não resolve este setup
      if (SETUP_RESOLVED_RE.test(c)) return false // já foi ativado/fechado → não aceitar
    }
    return true // continua pendente por tocar
  } catch {
    return false // em dúvida, mantém a regra dos 5 min
  }
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
  // JANELA DE ACEITAÇÃO. Regra base: 5 minutos (entradas a mercado — depois disso o preço já fugiu).
  // RESSALVA (pedido Ricardo 2026-08-18): um SETUP PENDENTE (entrada por ZONA/limite que ainda não
  // foi ativada nem fechada) continua aceitável enquanto estiver vivo — o cliente entra com ordem
  // pendente e o motor trata do resto. Um setup deixa de ser aceitável quando aparece no MESMO canal
  // um follow-up posterior que o ativa/fecha (ENTRY HIT/TP/SL/BE/fechada/cancelada) para o par.
  const ageMs = message.created_at ? Date.now() - new Date(message.created_at).getTime() : 0
  if (ageMs > JANELA_MERCADO_MS) {
    // A trade já saiu da zona (entrada tocada, parcial feito ou sinal fechado)? Então a exceção
    // dos setups pendentes deixa de existir: o que se aceitaria agora era entrar a meio do
    // movimento com o stop do princípio — várias vezes o risco previsto, por uma fatia do alvo.
    const { saiu, fechado } = await sinalJaSaiuDaZona(chatMessageId)
    if (saiu) {
      return NextResponse.json(
        {
          error: fechado
            ? 'Este sinal já fechou.'
            : 'Já não dá para entrar: o preço saiu da zona de entrada deste sinal.',
          code: fechado ? 'closed' : 'out_of_zone',
        },
        { status: 410 },
      )
    }
    const stillPending = await isPendingSetupStillOpen(supabase, message)
    if (!stillPending) {
      return NextResponse.json(
        { error: 'Sinal expirado — passaram mais de 5 minutos.', code: 'expired' },
        { status: 410 },
      )
    }
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
  const bruto = message.content ? parseSignal(message.content) : null
  let signal: ParsedSignal | null = bruto ? entradaT2T(bruto) : null
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
  // Só entradas COMPLETAS são negociáveis: exige TP (alvo) e exclui updates/follow-ups (só-SL,
  // "Ref:", TP hit, BE, fecho). Espelha o filtro do chat/feed (defesa em profundidade contra
  // abrir ouro em sinais incompletos do Premium).
  // Fonte permitida? SÓ Premium/Sensei/James/PrimeVerse são negociáveis (evita poluição do T2T).
  if (!isAllowedT2TSource(message.channel_slug, message.content)) {
    return NextResponse.json(
      { error: 'Este sinal não é negociável por Tap to Trade.', code: 'source_not_allowed' },
      { status: 400 },
    )
  }
  const hasTp = Array.isArray(signal.tp) && signal.tp.some((t) => typeof t === 'number' && t > 0)
  const isFollowupMsg =
    /(tp\s*\d?\s*(hit|atingid)|hit\s*tp|break\s*even|be\s*set|posi[çc][aã]o\s*fechada|fechad[ao]|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad)/i.test(
      message.content || '',
    )
  if (isFollowupMsg || !hasTp) {
    return NextResponse.json(
      { error: 'Sinal incompleto (sem alvo/TP) ou é um update — não é negociável.', code: 'incomplete_signal' },
      { status: 400 },
    )
  }

  // ── MODO SEGUIR (perpétuos) ──────────────────────────────────────────────────────────
  // Nos perpétuos a posição vive na ordem-mestre da Bybit, não na conta MT5 de cada cliente —
  // e a maioria dos pares nem sequer existe lá. Aceitar aqui significa SEGUIR: o sinal fica
  // marcado como ativo para este utilizador e a gestão do motor real (entrada, parciais,
  // break-even, fecho) chega-lhe por notificação, sem abrir nada na conta dele.
  // BTCUSD/BTCUSDT são a exceção: existem em MT5 e continuam a executar pelo caminho normal.
  if (t2tMode(message.channel_slug, message.content) === 'follow') {
    const { error: seguirErr } = await supabase.from('mtmcopy_signal_log').insert({
      user_id: user.id,
      connection_id: null,
      chat_message_id: chatMessageId,
      symbol: signal.symbol,
      direction: signal.direction,
      entry: signal.entry,
      sl: signal.sl,
      tp: signal.tp?.[0] ?? null,
      lot: null,
      status: 'following',
      detail: 'Perpétuo: a seguir a ordem-mestre. Sem ordem na conta do cliente.',
      channel_key: message.channel_slug,
      telegram_message_id: message.telegram_message_id ?? null,
    })
    if (seguirErr && (seguirErr as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Já estás a seguir este sinal.', code: 'already_following' }, { status: 409 })
    }
    if (seguirErr) {
      console.error('[tap-to-trade] seguir perp falhou:', seguirErr)
      return NextResponse.json({ error: 'Não foi possível seguir este sinal.' }, { status: 500 })
    }
    return NextResponse.json({
      success: true,
      mode: 'follow',
      symbol: signal.symbol,
      direction: signal.direction,
      message: `A seguir ${signal.symbol}. A gestão desta posição chega-te por notificação — não foi aberta nenhuma ordem na tua conta.`,
    })
  }

  // 3. Contas destino — FAN-OUT. Aceitar o sinal abre em TODAS as contas do user com T2T ligado
  //    (t2t_enabled, ou a conta dedicada purpose=tap_to_trade). Cada conta é dimensionada pelo SEU
  //    próprio saldo → risco idêntico "por equidade". O sizing T2T (t2t_lot_mode/value) é próprio e
  //    NÃO mexe no sizing da cópia (lot_mode/value). Retrocompat: sem contas marcadas, usa a 1ª ativa.
  const { data: conns } = await supabase
    .from('mtmcopy_connections')
    .select('id, account_label, mt5_login_last4, metaapi_account_id, lot_mode, lot_value, max_risk_percent, copy_sl, copy_tp, symbols_whitelist, is_active, purpose, t2t_enabled, t2t_lot_mode, t2t_lot_value, prop_firm_type, baseline_balance')
    .eq('user_id', user.id)
    .neq('mt5_status', 'disconnected')
  const withAccount = (conns ?? []).filter((c) => c.metaapi_account_id)
  const t2tTargets = withAccount.filter((c) => c.purpose === 'tap_to_trade' || c.t2t_enabled === true)

  // Contas T2T pausadas (is_active=false) ficam ligadas só para estatísticas → não executam.
  let targets = t2tTargets.filter((c) => c.is_active !== false)
  if (t2tTargets.length && !targets.length) {
    return NextResponse.json({ error: 'O Tap to Trade está em pausa nas tuas contas. Retoma-o no T2T para executar sinais.', code: 't2t_paused' }, { status: 400 })
  }
  // Retrocompat (conta única): sem nenhuma conta marcada como T2T → a 1ª conta MT5 ativa.
  if (!targets.length) {
    const fallback = withAccount.find((c) => c.is_active !== false)
    if (fallback) targets = [fallback]
  }
  if (!targets.length) {
    return NextResponse.json({ error: 'Sem conta ligada (ou todas em pausa). Liga/retoma a tua conta MT5 no T2T.', code: 'no_connection' }, { status: 400 })
  }

  const symU = signal.symbol.toUpperCase()
  // Valores já validados (o guard de "sinal incompleto" garante symbol/direction) — capturados
  // aqui porque o narrowing do TS não atravessa a closure executeOnAccount abaixo.
  const sSymbol = signal.symbol as string
  const sDirection = signal.direction as 'buy' | 'sell'

  type AcctResult = { account: string; connectionId: string; ok: boolean; skipped?: boolean; orderId?: string | null; lot?: number; symbol?: string; sl?: number | null; tp?: number | null; error?: string }

  // Executa o sinal NUMA conta (whitelist → claim idempotente por conta → sizing pelo saldo dela →
  // tipo de ordem + SL/TP re-ancorados → placeOrder). Nunca lança (devolve o resultado agregável).
  const executeOnAccount = async (conn: (typeof targets)[number]): Promise<AcctResult> => {
    const label = conn.account_label || (conn.mt5_login_last4 ? `••${conn.mt5_login_last4}` : conn.id.slice(0, 6))
    try {
      // Whitelist de símbolos por conta (match por FAMÍLIA — tolera sufixo da corretora).
      if (Array.isArray(conn.symbols_whitelist) && conn.symbols_whitelist.length) {
        const allowed = conn.symbols_whitelist.some((s) => symbolMatchesCanonical(symU, String(s)))
        if (!allowed) return { account: label, connectionId: conn.id, ok: false, skipped: true, error: `${signal.symbol} fora da whitelist` }
      }
      // Idempotência POR CONTA: (user_id, chat_message_id, connection_id) → cada conta abre 1×.
      const { error: claimErr } = await supabase.from('mtmcopy_signal_log').insert({
        user_id: user.id, connection_id: conn.id, chat_message_id: chatMessageId,
        symbol: signal.symbol, direction: signal.direction, entry: signal.entry, sl: signal.sl,
        tp: signal.tp?.[0] ?? null, lot: null, status: 'pending',
        channel_key: message.channel_slug, telegram_message_id: message.telegram_message_id ?? null,
      })
      if (claimErr) {
        if ((claimErr as { code?: string }).code === '23505') return { account: label, connectionId: conn.id, ok: false, skipped: true, error: 'já aceite' }
        console.error('[tap-to-trade] claim error:', claimErr)
      }
      // Sizing T2T próprio (não usa o sizing da cópia): t2t_lot_mode/value se definidos, senão lot_*.
      const sizingConn = { ...conn, lot_mode: conn.t2t_lot_mode ?? conn.lot_mode, lot_value: conn.t2t_lot_value ?? conn.lot_value }
      const ctx = await fetchLotSizingContext(conn.metaapi_account_id!, sSymbol, sDirection)
      const riskSignal = signalForRiskSizing(signal, ctx.marketPrice)
      const lot = computeLotSize(sizingConn, riskSignal, ctx.balance)
      const skip = getLotSizingSkipReason(sizingConn, signal, ctx.balance, lot, ctx.marketPrice)
      if (skip) {
        await supabase.from('mtmcopy_signal_log').update({ status: 'error', detail: `T2T: ${skip}` }).eq('user_id', user.id).eq('chat_message_id', chatMessageId).eq('connection_id', conn.id)
        return { account: label, connectionId: conn.id, ok: false, error: skip }
      }
      // Contas financiadas: almofada, consistência e drawdown diário decidem ANTES de abrir.
      // A trade é encolhida ao tecto de risco da almofada; se a regra morde, não abre.
      let lotFinal = lot
      if (conn.prop_firm_type) {
        const snap = await getAccountSnapshot(conn.metaapi_account_id!)
        const saldo = ctx.balance ?? 0
        const equity = snap?.equity ?? snap?.balance ?? saldo
        const verdict = await evaluatePropFirmGuard({
          accountId: conn.metaapi_account_id!,
          propFirmType: conn.prop_firm_type,
          baseline: conn.baseline_balance ?? saldo,
          equity,
          balance: saldo,
        })
        if (!verdict.allow) {
          const motivo = `${propFirmLabel(conn.prop_firm_type)}: ${verdict.reason}`
          await supabase.from('mtmcopy_signal_log').update({ status: 'skipped', detail: `T2T: ${motivo}` }).eq('user_id', user.id).eq('chat_message_id', chatMessageId).eq('connection_id', conn.id)
          return { account: label, connectionId: conn.id, ok: false, skipped: true, error: motivo }
        }
        // Tecto pela almofada — só faz sentido quando o sizing é por percentagem de risco.
        const modo = conn.t2t_lot_mode ?? conn.lot_mode
        const pct = Number(conn.t2t_lot_value ?? conn.lot_value ?? 0)
        if (modo === 'risk_percent' && pct > 0 && Number.isFinite(verdict.maxRiskAmount)) {
          const riscoPretendido = (saldo * pct) / 100
          if (riscoPretendido > verdict.maxRiskAmount && riscoPretendido > 0) {
            lotFinal = Math.max(0.01, Number((lot * (verdict.maxRiskAmount / riscoPretendido)).toFixed(2)))
          }
        }
      }

      // Tipo de ordem (market/limit/stop) conforme entry vs preço de mercado DESTA corretora.
      let orderType: 'market' | 'limit' | 'stop' = 'market'
      let openPrice: number | null = null
      if (signal.entry != null && signal.entry > 0) {
        const px = ctx.marketPrice
        if (px && px > 0) {
          const diff = Math.abs(signal.entry - px) / px
          // Preço já dentro da zona: o primeiro nível ficou para trás, entra a mercado. Um limite
          // acima do ask (ou abaixo do bid) é recusado pela corretora, e um stop iria à caça do
          // preço na direcção errada — ficaria à espera de sair da zona em vez de entrar nela.
          const dentroDaZona = signal.zone ? px >= signal.zone[0] && px <= signal.zone[1] : false
          if (diff < 0.0003 || dentroDaZona) orderType = 'market'
          else if (signal.direction === 'buy') { orderType = signal.entry > px ? 'stop' : 'limit'; openPrice = signal.entry }
          else { orderType = signal.entry < px ? 'stop' : 'limit'; openPrice = signal.entry }
        } else { orderType = 'limit'; openPrice = signal.entry }
      }
      // Re-ancorar SL/TP ao lado correto preservando a distância do sinal (+ guarda de sanidade 25%).
      const priceRef = openPrice ?? ctx.marketPrice ?? signal.entry ?? null
      const entryRef = signal.entry && signal.entry > 0 ? signal.entry : priceRef
      // Stop alargado ao mínimo da fonte ANTES de tudo o resto. O MTM Scanner escreve stops de 2
      // a 10 pips — dentro do spread do próprio par — e a trade nascia praticamente no stop.
      // Isto é dinheiro do cliente: nunca APERTA, só alarga o que é curto demais. Ver
      // source-risk-rules; foi a conta-espelho que expôs o problema, a fechar tudo no stop.
      const fonteSinal = t2tSourceKey(message.channel_slug, message.content)
      const slDaFonte = slComMinimo(fonteSinal, signal.symbol!, signal.direction!, signal.entry, signal.sl)
      let orderSl = conn.copy_sl !== false ? (slDaFonte ?? null) : null
      let orderTp = conn.copy_tp !== false ? (signal.tp?.[0] ?? null) : null
      let adjustedStops = false
      const SANE_STOP_FRAC = 0.25
      const isInsaneStop = (v: number | null): boolean => v == null || !(v > 0) || !entryRef || entryRef <= 0 || Math.abs(entryRef - v) / entryRef > SANE_STOP_FRAC
      if (isInsaneStop(orderSl)) orderSl = null
      if (isInsaneStop(orderTp)) orderTp = null
      if (priceRef && priceRef > 0 && entryRef && entryRef > 0) {
        if (orderSl != null && orderSl > 0) { const d = Math.abs(entryRef - orderSl); const fixed = signal.direction === 'buy' ? priceRef - d : priceRef + d; if (d > 0 && Math.abs(fixed - orderSl) > 1e-9) adjustedStops = true; if (d > 0) orderSl = fixed }
        if (orderTp != null && orderTp > 0) { const d = Math.abs(entryRef - orderTp); const fixed = signal.direction === 'buy' ? priceRef + d : priceRef - d; if (d > 0 && Math.abs(fixed - orderTp) > 1e-9) adjustedStops = true; if (d > 0) orderTp = fixed }
      }
      // Gate de horário: não tentar abrir com o mercado fechado (fim de semana / rollover).
      const mh = isMarketOpen(sSymbol)
      if (!mh.open) {
        return { account: label, connectionId: conn.id, ok: false, symbol: sSymbol, error: `mercado fechado (${mh.reason})` }
      }
      const orderReq: OrderRequest = { accountId: conn.metaapi_account_id!, symbol: sSymbol, direction: sDirection, volume: lotFinal, orderType, openPrice, stopLoss: orderSl, takeProfit: orderTp, comment: 'TapToTrade MTM' }
      const result = await placeOrder(orderReq)
      await supabase.from('mtmcopy_signal_log').update({
        lot: lotFinal,
        status: result.success ? 'open' : 'error',
        broker_position_id: result.success ? (result.orderId ?? null) : null,
        detail: result.success
          ? `Tap to Trade · ordem ${orderReq.orderType} · ${result.orderId ?? ''}${adjustedStops ? ' · SL/TP ajustado ao lado correto' : ''}`.trim()
          : `Tap to Trade falhou: ${result.error ?? 'erro'}`,
      }).eq('user_id', user.id).eq('chat_message_id', chatMessageId).eq('connection_id', conn.id).then(undefined, (e) => console.error('[tap-to-trade] update log error:', e))
      return { account: label, connectionId: conn.id, ok: result.success, orderId: result.orderId, lot: lotFinal, symbol: result.brokerSymbol ?? sSymbol, sl: orderReq.stopLoss, tp: orderReq.takeProfit, error: result.success ? undefined : (result.error ?? 'erro') }
    } catch (e) {
      return { account: label, connectionId: conn.id, ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  const results = await Promise.all(targets.map(executeOnAccount))
  const opened = results.filter((r) => r.ok)
  const realErrors = results.filter((r) => !r.ok && !r.skipped)

  if (!opened.length) {
    // Todas já aceites antes → 409; senão devolve o 1.º erro real.
    if (results.length && results.every((r) => r.skipped && r.error === 'já aceite')) {
      return NextResponse.json({ error: 'Já aceitaste este sinal.', code: 'already_accepted' }, { status: 409 })
    }
    return NextResponse.json({ error: realErrors[0]?.error || 'Falha ao abrir a ordem', accounts: results }, { status: 502 })
  }

  return NextResponse.json({
    success: true,
    accounts: results,
    opened: opened.length,
    total: targets.length,
    // Compat com a UI de conta-única: 1.º sucesso no topo.
    orderId: opened[0].orderId,
    symbol: opened[0].symbol,
    direction: signal.direction,
    lot: opened[0].lot,
    sl: opened[0].sl,
    tp: opened[0].tp,
    message: opened.length > 1
      ? `Trade ${signal.direction.toUpperCase()} ${signal.symbol} aberta em ${opened.length} contas`
      : `Trade ${signal.direction.toUpperCase()} ${signal.symbol} aberta · ${opened[0].lot} lote`,
  })
}
