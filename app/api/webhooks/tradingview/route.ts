import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import {
  parseSenseiTradingViewAlert,
  parseSignal,
  isSenseiTradingViewFormat,
  senseiAlertTypeLabel,
  type ParsedSignal,
  type SenseiParsedAlert,
  type SenseiTradingViewFields,
} from "@/lib/mtmcopy/signal-parser"
import { validateSenseiWebhookSignal, validateSignalWithAi } from "@/lib/mtmcopy/signal-ai-validator"
import {
  activateSenseiTradeIdea,
  attachSenseiIdeaMessages,
  findActiveSenseiIdeaForFollowup,
  findPendingSenseiIdea,
  mergeSenseiTriggerWithIdea,
  saveSenseiTradeIdea,
  type SenseiTradeIdea,
} from "@/lib/mtmcopy/sensei-ideas"
import { processMtmcopyWebhookSignal, processMtmcopyWebhookManagement } from "@/lib/mtmcopy/processor"
import { getSiteOrigin } from "@/lib/site-url"
import { resolvedTradeIdeasChatId } from "@/lib/telegram-channel-ids"
import type { SupabaseClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CHANNEL_SLUG = process.env.SENSEI_CHANNEL_SLUG || "sensei-scanner"
const CHAT_SENDER = process.env.SENSEI_CHAT_SENDER || "🧠 Sensei Scanner"

const DEFAULT_RELAY_CHAT_ID = resolvedTradeIdeasChatId()
const RELAY_CHAT_ID = (process.env.TRADINGVIEW_RELAY_CHAT_ID || DEFAULT_RELAY_CHAT_ID).trim()
const AIBOT_TOKEN = (process.env.TELEGRAM_AIBOT_TOKEN || "").trim()
const RELAY_DISABLED = (process.env.TRADINGVIEW_RELAY_ENABLED || "true").toLowerCase() === "false"
const RELAY_ENABLED = !RELAY_DISABLED && Boolean(RELAY_CHAT_ID && AIBOT_TOKEN)

// Auto-execução de trades reais a partir do Sensei (alto risco): OFF por defeito.
// Notificações/chat/Telegram funcionam sempre; só a abertura de posições é gated.
const SENSEI_PROVIDER_EXEC_ENABLED =
  (process.env.SENSEI_PROVIDER_EXEC_ENABLED || "false").toLowerCase() === "true"

type Json = Record<string, unknown>

function pick(obj: Json, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k] ?? obj[k.toLowerCase()] ?? obj[k.toUpperCase()]
    if (v !== undefined && v !== null && v !== "") return String(v)
  }
  return null
}
function num(s: string | null): number | null {
  return s !== null && !isNaN(Number(s)) ? Number(s) : null
}

/** Constrói texto no formato oficial MTM (consumível pelo parser + legível). */
function buildRawSignal(symbol: string | null, action: string | null, sl: number | null, tp: number | null): string {
  const a = (action || "").toLowerCase()
  const acao = a.includes("buy") || a.includes("long") || a === "b" ? "🔵 Buy 🔵"
    : a.includes("sell") || a.includes("short") || a === "s" ? "🔴 Sell 🔴" : action || ""
  return `Moeda: ${symbol ?? ""}\nAção:   ${acao}\nStoploss: ${sl ?? ""}\nTakeprofit: ${tp ?? ""}`
}

/** Contexto da trade (entrada/TP/numeração) para ligar follow-ups à ideia. */
interface SenseiMsgCtx {
  entry: number | null
  tp: number[]
  tradeNumber: number | null
}

const DISCLAIMER = "⚠️ Não é aconselhamento financeiro."

function composePost(
  v: {
    symbol: string | null
    direction: "buy" | "sell" | null
    entry: number | null
    sl: number | null
    tp: number[]
    confidence: number
    reasoning: string
  },
  sensei?: SenseiParsedAlert | null,
  ctx?: SenseiMsgCtx | null,
): string {
  const direction = sensei?.direction ?? v.direction
  const dir = direction === "buy" ? "🔵 COMPRA" : direction === "sell" ? "🔴 VENDA" : "—"
  const symbol = v.symbol ?? sensei?.symbol ?? "—"
  const pct = Math.round((v.confidence || 0) * 100)
  const tfLine = sensei?.timeframe ? `⏱ Timeframe: ${sensei.timeframe}` : null
  const tag = ctx?.tradeNumber != null ? ` #${ctx.tradeNumber}` : ""
  const entry = ctx?.entry ?? v.entry ?? sensei?.entry ?? null
  const tps = (ctx?.tp?.length ? ctx.tp : v.tp) ?? []
  const alertType = sensei?.alertType

  // ---- Entrada: Nova Ideia / Entry Alert (Ideia Activada) ----
  if (alertType === "idea" || alertType === "signal" || alertType === "entry_trigger") {
    const isTrigger = alertType === "entry_trigger"
    const title = isTrigger ? "Entry Alert — Ideia Activada" : "Nova Ideia"
    const tpLines = [0, 1, 2, 3]
      .map((i) => (tps[i] != null ? `✅ Take Profit ${i + 1}: ${tps[i]}` : null))
      .filter(Boolean) as string[]
    return [
      `🧠 Sensei Scanner — ${title}${tag}${isTrigger ? " ✅" : ""}`,
      ``,
      `📊 ${symbol}   ${dir}`,
      tfLine,
      `🎯 ${isTrigger ? "Entrada activada" : "Ponto de Entrada"}: ${entry ?? "Mercado"}`,
      `🛑 Stop Loss: ${v.sl ?? sensei?.sl ?? "—"}`,
      ...tpLines,
      ``,
      `🔎 Validação: ${pct}%`,
      DISCLAIMER,
    ].filter(Boolean).join("\n")
  }

  // ---- Follow-ups (sempre em resposta à entrada) ----
  const head = `📊 ${symbol}   ${dir} com 🎯 Entrada: ${entry ?? "—"}`

  if (alertType === "tp_hit") {
    const lvl = sensei?.tpLevel ?? 1
    const tpVal = tps[lvl - 1]
    const last = lvl >= 4
    return [
      `🧠 Sensei Scanner — TP${lvl} Hit${tag}`,
      ``,
      head,
      `✅ Take Profit ${lvl}: ${tpVal ?? "—"}${last ? " — todas as saídas atingidas" : " — Fecha 25%"}`,
      last
        ? `🏁 Fecha a posição (saídas completas).`
        : lvl === 1
          ? `⚠️ Colocar BE + iniciar Trailing Stop.`
          : `⚠️ Mantém BE + continua Trailing Stop.`,
      DISCLAIMER,
    ].filter(Boolean).join("\n")
  }

  if (alertType === "breakeven") {
    return [`🧠 Sensei Scanner — Breakeven${tag}`, ``, head, `Posição Fechada.`, DISCLAIMER].join("\n")
  }

  if (alertType === "sl_hit") {
    return [`🧠 Sensei Scanner — Stop Loss${tag}`, ``, head, DISCLAIMER].join("\n")
  }

  if (alertType === "exit") {
    return [`🧠 Sensei Scanner — Saída${tag}`, ``, head, `🏁 Fecha a posição.`, DISCLAIMER].join("\n")
  }

  // fallback genérico
  const title = sensei ? senseiAlertTypeLabel(sensei.alertType) : "Alerta"
  return [`🧠 Sensei Scanner — ${title}${tag}`, ``, head, DISCLAIMER].join("\n")
}

async function sendTelegram(token: string, chatId: string, text: string, replyToMessageId?: number | null): Promise<number> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(replyToMessageId != null ? { reply_to_message_id: replyToMessageId, allow_sending_without_reply: true } : {}),
    }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram: ${JSON.stringify(data)}`)
  return data.result.message_id as number
}

/** Push só para membros Premium/IQ/VIP/admin (canal #Sensei Scanner é restrito). */
async function pushPremium(supabase: SupabaseClient, messageId: string, title: string, body: string): Promise<void> {
  const { data: members } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .or("subscription_plan.eq.premium,member_category.eq.iq,member_category.eq.vip,user_type.eq.admin")
  const userIds = (members ?? []).map((m: { id: string }) => m.id)
  if (!userIds.length) return
  const url = `/app-mobile?tab=chat&channel=${encodeURIComponent(CHANNEL_SLUG)}`
  await fetch(`${getSiteOrigin()}/api/notifications/send-push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userIds,
      title,
      body,
      url,
      data: { type: "chat_message", channel: CHANNEL_SLUG, message_id: messageId, url },
      tag: `chat_${CHANNEL_SLUG}`,
    }),
  })
}

export async function POST(request: NextRequest) {
  const secretEnv = process.env.TRADINGVIEW_WEBHOOK_SECRET || ""
  const url = new URL(request.url)
  const rawBody = await request.text()

  let payload: Json = {}
  let isJson = false
  try { payload = JSON.parse(rawBody); isJson = true } catch { payload = { message: rawBody } }

  const provided =
    url.searchParams.get("secret") ??
    (typeof payload.secret === "string" ? payload.secret : null) ??
    (typeof payload.passphrase === "string" ? payload.passphrase : null)
  if (secretEnv && provided !== secretEnv) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (isJson) { delete payload.secret; delete payload.passphrase }

  const supabase = getSupabaseAdmin()

  // Campos do alerta TradingView
  const ticker = pick(payload, ["ticker", "symbol", "pair", "instrument"])
  const exchange = pick(payload, ["exchange", "broker"])
  const timeframe = pick(payload, ["timeframe", "interval", "tf", "resolution"])
  const action = pick(payload, ["action", "side", "order_action", "strategy_order_action", "signal"])
  const price = num(pick(payload, ["price", "close", "order_price", "strategy_order_price"]))
  const sl = num(pick(payload, ["sl", "stoploss", "stop_loss", "stop"]))
  const tp = num(pick(payload, ["tp", "takeprofit", "take_profit", "target", "tp1"]))
  const tp2 = num(pick(payload, ["tp2", "take_profit_2", "target2"]))
  const tp3 = num(pick(payload, ["tp3", "take_profit_3", "target3"]))
  const tp4 = num(pick(payload, ["tp4", "take_profit_4", "target4"]))
  const state = pick(payload, ["state", "phase"])
  const alertName = pick(payload, ["alert_name", "alert", "name", "strategy"])
  const freeText = isJson ? pick(payload, ["message", "comment", "text"]) : String(payload.message ?? "")

  const allTp = [tp, tp2, tp3, tp4].filter((n): n is number => n != null)
  const senseiFields: SenseiTradingViewFields = {
    ticker,
    action,
    price,
    sl,
    tp: allTp.length ? allTp : null,
    tp1: tp,
    tp2,
    tp3,
    tp4,
    timeframe,
    exchange,
    alertName,
    state,
  }

  // Texto bruto: mensagem Sensei (Entry Buy/Sell/Alert), formato MTM, ou JSON
  const senseiHint = freeText || alertName || ''
  const raw =
    senseiHint && (isSenseiTradingViewFormat(senseiHint, senseiFields) || /entry\s+(buy|sell|alert|trigger)/i.test(senseiHint))
      ? senseiHint
      : ticker && action
        ? buildRawSignal(ticker, action, sl, tp)
        : freeText || JSON.stringify(payload)
  const senseiParsed = parseSenseiTradingViewAlert(raw, senseiFields)
  const isSensei = isSenseiTradingViewFormat(raw, senseiFields) || Boolean(senseiParsed)

  // Entry Alert: fundir com ideia pendente (Entry Buy/Sell anterior) → SL/TP/direcção completos
  let activeSensei = senseiParsed
  let pendingIdeaId: string | null = null
  let pendingIdea: SenseiTradeIdea | null = null
  if (senseiParsed?.alertType === "entry_trigger" && senseiParsed.symbol) {
    let pending = await findPendingSenseiIdea(supabase, senseiParsed.symbol, senseiParsed.timeframe)
    if (!pending && senseiParsed.timeframe) {
      pending = await findPendingSenseiIdea(supabase, senseiParsed.symbol, null)
    }
    if (pending) {
      pendingIdeaId = pending.id
      pendingIdea = pending
      activeSensei = mergeSenseiTriggerWithIdea(senseiParsed, pending)
    }
  }

  const parsed: ParsedSignal =
    activeSensei ??
    parseSignal(raw) ??
    {
      symbol: ticker,
      direction: action && /buy|long/i.test(action) ? "buy" : action && /sell|short/i.test(action) ? "sell" : null,
      entry: price,
      sl,
      tp: [tp, tp2, tp3].filter((n): n is number => n != null),
      orderType: price != null ? "limit" : "market",
      raw,
    }

  // Log inicial
  const { data: logRow } = await supabase
    .from("tradingview_signals")
    .insert({ ticker, exchange, timeframe, action, price, sl, tp, alert_name: alertName, message: freeText, raw_payload: payload, ai_status: "pending" })
    .select("id").single()
  const logId = logRow?.id as string | undefined

  // Validação (Sensei: ideia vs activação vs gestão)
  const v =
    isSensei && activeSensei
      ? validateSenseiWebhookSignal(activeSensei, raw)
      : await validateSignalWithAi(raw, parsed, {
          channel: "trade-ideas",
          senseiWebhook: isSensei,
          forceFastPath: isSensei,
        })

  if (logId) {
    await supabase.from("tradingview_signals").update({
      ai_status: "done",
      ai_model: "mtmcopy-validator",
      ai_analysis: v.reasoning,
      processed_at: new Date().toISOString(),
    }).eq("id", logId)
  }

  if (!v.valid) {
    if (logId) await supabase.from("tradingview_signals").update({ chat_status: "rejected", telegram_status: "rejected", ai_error: `rejeitado: ${v.reasoning}` }).eq("id", logId)
    return NextResponse.json({ ok: true, valid: false, reason: v.reasoning, confidence: v.confidence })
  }

  const parsedForExec =
    activeSensei ??
    parseSignal(raw) ??
    ({
      symbol: v.symbol ?? ticker,
      direction: v.direction,
      entry: v.entry ?? price,
      sl: v.sl ?? sl,
      tp: v.tp?.length ? v.tp : [tp, tp2, tp3].filter((n): n is number => n != null),
      orderType: (v.entry ?? price) != null ? "limit" : "market",
      raw,
    } as ParsedSignal)

  let providerExecuted = false
  let providerDetail: string | undefined
  const isIdeaAlert = activeSensei?.alertType === "idea" || activeSensei?.alertType === "signal"
  const canExecuteProvider =
    SENSEI_PROVIDER_EXEC_ENABLED &&
    !isIdeaAlert &&
    parsedForExec.symbol &&
    parsedForExec.direction &&
    (activeSensei?.alertType === "entry_trigger" || !activeSensei)

  let savedIdea: { id: string; tradeNumber: number | null } | null = null
  if (isIdeaAlert && activeSensei) {
    savedIdea = await saveSenseiTradeIdea(supabase, activeSensei, logId)
  }

  if (canExecuteProvider) {
    // await (não fire-and-forget): no Vercel o trabalho assíncrono é morto após a resposta,
    // o que deixaria a trade por abrir. A latência é cortada dentro do processor (chamadas
    // MetaAPI paralelizadas), não tirando a execução do caminho da resposta.
    try {
      const exec = await processMtmcopyWebhookSignal({
        raw,
        signal: parsedForExec as NonNullable<ReturnType<typeof parseSignal>>,
        validation: v,
        externalRef: logId,
      })
      providerExecuted = exec.executed
      providerDetail = exec.detail
    } catch (err) {
      console.error("[tradingview-webhook] provider exec error:", err)
    }
    if (pendingIdeaId) await activateSenseiTradeIdea(supabase, pendingIdeaId, logId)
  }

  // Follow-up (TP/BE/SL/Saída): liga à entrada correspondente para responder em thread
  const alertType = activeSensei?.alertType
  const isFollowup =
    alertType === "tp_hit" || alertType === "sl_hit" || alertType === "breakeven" || alertType === "exit"
  let linkedIdea: SenseiTradeIdea | null = null
  if (isFollowup && activeSensei?.symbol) {
    linkedIdea = await findActiveSenseiIdeaForFollowup(
      supabase,
      activeSensei.symbol,
      activeSensei.timeframe,
      activeSensei.direction,
    )
  }

  // Contexto da mensagem: entrada/TP/numeração (da ideia ligada ou da própria entrada)
  const msgCtx: SenseiMsgCtx | null = linkedIdea
    ? { entry: linkedIdea.entry, tp: linkedIdea.tp, tradeNumber: linkedIdea.tradeNumber }
    : pendingIdea
      ? { entry: activeSensei?.entry ?? pendingIdea.entry, tp: activeSensei?.tp ?? pendingIdea.tp, tradeNumber: pendingIdea.tradeNumber }
      : savedIdea
        ? { entry: activeSensei?.entry ?? null, tp: activeSensei?.tp ?? [], tradeNumber: savedIdea.tradeNumber }
        : null

  // Gestão automática Sensei (gated): TP/BE/SL → parciais + BE + trailing ou fecho na conta Sensei
  if (SENSEI_PROVIDER_EXEC_ENABLED && isFollowup && activeSensei?.symbol) {
    try {
      await processMtmcopyWebhookManagement({
        symbol: activeSensei.symbol,
        direction: activeSensei.direction ?? linkedIdea?.direction ?? null,
        alertType: activeSensei.alertType,
        tpLevel: activeSensei.tpLevel ?? null,
        entry: linkedIdea?.entry ?? activeSensei.entry ?? null,
      })
    } catch (err) {
      console.error("[tradingview-webhook] sensei management error:", err)
    }
  }

  const post = composePost(v, activeSensei, msgCtx)
  const replyToTelegramId = isFollowup ? linkedIdea?.telegramMessageId ?? null : null
  // Ideia cuja mensagem de entrada/activação guardamos para os follow-ups responderem
  const entryIdeaId = savedIdea?.id ?? (alertType === "entry_trigger" ? pendingIdeaId : null)

  // Publica no chat #Sensei Scanner (mesma convenção do mirror Telegram)
  let chatId: string | null = null
  try {
    const { data: msg, error } = await supabase
      .from("chat_messages")
      .insert({ channel_slug: CHANNEL_SLUG, message_type: "telegram_forward", content: post, telegram_sender: CHAT_SENDER, user_id: null })
      .select("id").single()
    if (error) throw error
    chatId = msg.id as string
    if (logId) await supabase.from("tradingview_signals").update({ chat_status: "sent", chat_message_id: chatId }).eq("id", logId)
  } catch (err) {
    if (logId) await supabase.from("tradingview_signals").update({ chat_status: "error", ai_error: "chat: " + String(err) }).eq("id", logId)
  }

  // Push (iOS/APK/PWA) — só Premium/IQ/VIP/admin (canal restrito).
  // await (não fire-and-forget): no Vercel o trabalho assíncrono é morto após a resposta.
  let pushOk = false
  if (chatId) {
    const body = [
      v.symbol ?? ticker ?? "Sinal",
      activeSensei ? senseiAlertTypeLabel(activeSensei.alertType) : "",
      v.direction === "buy" ? "COMPRA" : v.direction === "sell" ? "VENDA" : "",
    ].filter(Boolean).join(" — ")
    const pushTitle =
      activeSensei?.alertType === "idea"
        ? "💡 Nova ideia — Sensei Scanner"
        : activeSensei?.alertType === "entry_trigger"
          ? "✅ Ideia activada — Sensei Scanner"
          : "🧠 Novo sinal — Sensei Scanner"
    try {
      await pushPremium(supabase, chatId, pushTitle, body)
      pushOk = true
    } catch (e) {
      console.error("[tradingview-webhook] push error:", e)
    }
  }

  // Relay Telegram → canal Sensei Scanner (-1003853860780 por defeito)
  let tgOk = false
  let telegramMid: number | null = null
  if (RELAY_ENABLED) {
    try {
      const mid = await sendTelegram(AIBOT_TOKEN, RELAY_CHAT_ID, post, replyToTelegramId)
      telegramMid = mid
      tgOk = true
      if (logId) await supabase.from("tradingview_signals").update({ telegram_status: "sent", telegram_chat_id: RELAY_CHAT_ID, telegram_message_id: mid, relayed_at: new Date().toISOString() }).eq("id", logId)
    } catch (err) {
      if (logId) await supabase.from("tradingview_signals").update({ telegram_status: "error", telegram_chat_id: RELAY_CHAT_ID, telegram_error: String(err) }).eq("id", logId)
    }
  } else if (logId) {
    const reason = !AIBOT_TOKEN ? "TELEGRAM_AIBOT_TOKEN em falta" : !RELAY_CHAT_ID ? "TRADINGVIEW_RELAY_CHAT_ID em falta" : "relay desligado"
    await supabase.from("tradingview_signals").update({ telegram_status: "disabled", telegram_error: reason }).eq("id", logId)
  }

  // Guarda os message_id da entrada/activação na ideia → follow-ups respondem em thread
  if (entryIdeaId && (telegramMid != null || chatId)) {
    try {
      await attachSenseiIdeaMessages(supabase, entryIdeaId, { telegramMessageId: telegramMid, chatMessageId: chatId })
    } catch (err) {
      console.error("[tradingview-webhook] attach idea messages error:", err)
    }
  }

  return NextResponse.json({ ok: true, valid: true, confidence: v.confidence, chat: !!chatId, push: pushOk, telegram: tgOk, provider: providerExecuted, provider_detail: providerDetail, signal_id: logId })
}
