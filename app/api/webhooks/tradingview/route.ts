import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { parseSignal, type ParsedSignal } from "@/lib/mtmcopy/signal-parser"
import { validateSignalWithAi } from "@/lib/mtmcopy/signal-ai-validator"
import { getSiteOrigin } from "@/lib/site-url"
import type { SupabaseClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CHANNEL_SLUG = process.env.SENSEI_CHANNEL_SLUG || "sensei-scanner"
const CHAT_SENDER = process.env.SENSEI_CHAT_SENDER || "🧠 Sensei Scanner"

// Relay opcional para Telegram (bot dedicado @MoreThanMoney_aibot). DESLIGADO por defeito.
const RELAY_ENABLED = process.env.TRADINGVIEW_RELAY_ENABLED === "true"
const RELAY_CHAT_ID = process.env.TRADINGVIEW_RELAY_CHAT_ID || ""
const AIBOT_TOKEN = process.env.TELEGRAM_AIBOT_TOKEN || ""

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

function composePost(v: { symbol: string | null; direction: "buy" | "sell" | null; entry: number | null; sl: number | null; tp: number[]; confidence: number; reasoning: string }): string {
  const dir = v.direction === "buy" ? "🔵 COMPRA" : v.direction === "sell" ? "🔴 VENDA" : "—"
  const tpStr = v.tp.length ? v.tp.join(" / ") : "—"
  const pct = Math.round((v.confidence || 0) * 100)
  return [
    `🧠 Sensei Scanner — Novo Sinal`,
    ``,
    `📊 ${v.symbol ?? "—"}   ${dir}`,
    `🎯 Entrada: ${v.entry ?? "Mercado"}`,
    `🛑 Stop Loss: ${v.sl ?? "—"}`,
    `✅ Take Profit: ${tpStr}`,
    ``,
    `🔎 Validação IA: ${pct}% — ${v.reasoning}`,
    ``,
    `⚠️ Não é aconselhamento financeiro.`,
  ].join("\n")
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<number> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
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
  const alertName = pick(payload, ["alert_name", "alert", "name", "strategy"])
  const freeText = isJson ? pick(payload, ["message", "comment", "text"]) : String(payload.message ?? "")

  // Texto bruto para o parser/validador: usa formato MTM se houver campos, senão o texto livre
  const raw = ticker && action ? buildRawSignal(ticker, action, sl, tp) : (freeText || JSON.stringify(payload))
  const parsed: ParsedSignal =
    parseSignal(raw) ?? {
      symbol: ticker,
      direction: action && /buy|long/i.test(action) ? "buy" : action && /sell|short/i.test(action) ? "sell" : null,
      entry: price,
      sl,
      tp: tp != null ? [tp] : [],
      orderType: price != null ? "limit" : "market",
      raw,
    }

  // Log inicial
  const { data: logRow } = await supabase
    .from("tradingview_signals")
    .insert({ ticker, exchange, timeframe, action, price, sl, tp, alert_name: alertName, message: freeText, raw_payload: payload, ai_status: "pending" })
    .select("id").single()
  const logId = logRow?.id as string | undefined

  // Validação IA (reutiliza o validador mtmcopy existente)
  const v = await validateSignalWithAi(raw, parsed, { channel: "trade-ideas" })

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

  const post = composePost(v)

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
    const body = `${v.symbol ?? ticker ?? "Sinal"} ${v.direction === "buy" ? "COMPRA" : v.direction === "sell" ? "VENDA" : ""}`.trim()
    try {
      await pushPremium(supabase, chatId, "🧠 Novo sinal — Sensei Scanner", body)
      pushOk = true
    } catch (e) {
      console.error("[tradingview-webhook] push error:", e)
    }
  }

  // Relay Telegram (gated)
  let tgOk = false
  if (RELAY_ENABLED && RELAY_CHAT_ID && AIBOT_TOKEN) {
    try {
      const mid = await sendTelegram(AIBOT_TOKEN, RELAY_CHAT_ID, post)
      tgOk = true
      if (logId) await supabase.from("tradingview_signals").update({ telegram_status: "sent", telegram_chat_id: RELAY_CHAT_ID, telegram_message_id: mid, relayed_at: new Date().toISOString() }).eq("id", logId)
    } catch (err) {
      if (logId) await supabase.from("tradingview_signals").update({ telegram_status: "error", telegram_chat_id: RELAY_CHAT_ID, telegram_error: String(err) }).eq("id", logId)
    }
  } else if (logId) {
    await supabase.from("tradingview_signals").update({ telegram_status: RELAY_ENABLED ? "error" : "disabled" }).eq("id", logId)
  }

  return NextResponse.json({ ok: true, valid: true, confidence: v.confidence, chat: !!chatId, push: pushOk, telegram: tgOk, signal_id: logId })
}
