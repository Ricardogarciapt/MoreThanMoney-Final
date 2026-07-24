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
  createActivatedSenseiIdea,
  findActiveSenseiIdeaForFollowup,
  findPendingSenseiIdea,
  mergeSenseiTriggerWithIdea,
  saveSenseiTradeIdea,
  type SenseiTradeIdea,
} from "@/lib/mtmcopy/sensei-ideas"
import { processMtmcopyWebhookSignal, processMtmcopyWebhookManagement } from "@/lib/mtmcopy/processor"
import { getSiteOrigin } from "@/lib/site-url"
import { resolvedTradeIdeasChatId, resolvedForexIdeasChatId, resolvedGoldkillerScannerChatId } from "@/lib/telegram-channel-ids"
import { getExecSwitches } from "@/lib/mtmcopy/exec-switches"
import { getSignalRules, passesAlertGate, passesExecGate } from "@/lib/mtmcopy/signal-rules"
import { notifySignalOutcome } from "@/lib/mtm-alerts/notify-outcome"
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
    return [
      `🧠 Sensei Scanner — Coloca BreakEven${tag}`,
      ``,
      head,
      `🔒 Move o Stop Loss para o ponto de entrada (BreakEven) — protege a posição sem risco. A posição continua aberta.`,
      DISCLAIMER,
    ].join("\n")
  }

  if (alertType === "sl_hit") {
    return [`🧠 Sensei Scanner — Stop Loss${tag}`, ``, head, `🛑 Stop Loss atingido — posição encerrada.`, DISCLAIMER].join("\n")
  }

  if (alertType === "exit") {
    return [`🧠 Sensei Scanner — Saída${tag}`, ``, head, `🏁 Fecha a posição.`, DISCLAIMER].join("\n")
  }

  // fallback genérico
  const title = sensei ? senseiAlertTypeLabel(sensei.alertType) : "Alerta"
  return [`🧠 Sensei Scanner — ${title}${tag}`, ``, head, DISCLAIMER].join("\n")
}

// ─── Roteamento por classe de ativo ──────────────────────────────────────────
type AssetClass = "gold_btc" | "forex" | "index" | "crypto_perp" | "other"

const FOREX_CODES = new Set(["EUR", "USD", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD", "SGD", "SEK", "NOK", "MXN", "ZAR"])
const INDEX_SET = new Set([
  "UK100", "US30", "US100", "US500", "SPX500", "SPX", "NAS100", "NAS", "NDX", "DJI",
  "GER40", "DE40", "DE30", "DAX", "JP225", "JPN225", "FRA40", "EU50", "STOXX50",
  "US2000", "HK50", "AUS200", "ESP35", "IT40",
])

/** Classifica o ticker do webhook para escolher canal/telegram/copy. */
function classifyAsset(rawTicker: string | null): AssetClass {
  if (!rawTicker) return "other"
  const norm = rawTicker.toUpperCase().replace(/[^A-Z0-9.]/g, "").replace(/^[A-Z]+:/, "")
  // Ouro + BTC (Sensei) — inclui perpétuos de BTC (BTCUSDT, BTCUSD.P, BTCUSDT.P):
  // o scanner Sensei passou a enviar BTCUSDT.P; o parser normaliza tudo → BTCUSD.
  if (/XAUUSD/.test(norm) || /^BTC(USD|USDT)(\.P)?$/.test(norm)) return "gold_btc"
  // Outros cripto perpétuos (ETH, etc.) — não vão para o Sensei
  if (/\.P$/.test(norm) || /USDT/.test(norm) || /PERP/.test(norm)) return "crypto_perp"
  const letters = norm.replace(/[^A-Z]/g, "")
  if (letters.length === 6 && FOREX_CODES.has(letters.slice(0, 3)) && FOREX_CODES.has(letters.slice(3, 6))) return "forex"
  if (INDEX_SET.has(norm) || INDEX_SET.has(letters)) return "index"
  return "other"
}

interface SignalRoute {
  channel: string | null // null = só Alertas MTM (sem chat)
  telegram: string | null // null = sem relay Telegram
  sender: string
  push: boolean
  autoCopy: boolean // execução automática CopyFactory
}

function resolveRoute(cls: AssetClass): SignalRoute {
  switch (cls) {
    case "gold_btc":
      return { channel: "sensei-scanner", telegram: resolvedTradeIdeasChatId(), sender: "🧠 Sensei Scanner", push: true, autoCopy: true }
    case "forex":
      return { channel: "trade-ideas-setup", telegram: resolvedForexIdeasChatId(), sender: "💱 Ideias de Forex", push: true, autoCopy: false }
    case "index":
      return { channel: "trade-ideas", telegram: null, sender: "📈 Ideias de Índices", push: true, autoCopy: false }
    case "crypto_perp":
      return { channel: "cripto-perps", telegram: null, sender: "🪙 Perpétuos Cripto", push: true, autoCopy: false }
    default:
      return { channel: null, telegram: null, sender: "", push: false, autoCopy: false }
  }
}

/** Card genérico (forex/índices/cripto) — não usa a marca Sensei. */
function composeGenericPost(
  route: SignalRoute,
  v: { symbol: string | null; direction: "buy" | "sell" | null; entry: number | null; sl: number | null; tp: number[]; confidence: number },
  timeframe: string | null,
): string {
  const dir = v.direction === "buy" ? "🔵 COMPRA" : v.direction === "sell" ? "🔴 VENDA" : "—"
  const tps = (v.tp ?? []).map((t, i) => `✅ Take Profit ${i + 1}: ${t}`).filter(Boolean)
  return [
    `${route.sender} — Novo Sinal`,
    ``,
    `📊 ${v.symbol ?? "—"}   ${dir}`,
    timeframe ? `⏱ Timeframe: ${timeframe}` : null,
    `🎯 Entrada: ${v.entry ?? "Mercado"}`,
    `🛑 Stop Loss: ${v.sl ?? "—"}`,
    ...tps,
    ``,
    `🔎 Validação: ${Math.round((v.confidence || 0) * 100)}%`,
    DISCLAIMER,
  ].filter(Boolean).join("\n")
}

// ─── Gate de qualidade para auto-copy (confirmações + timeframe ajustado) ─────
const PREF_TF_MIN: Record<AssetClass, number[]> = {
  gold_btc: [15, 30, 60, 240],
  forex: [15, 30, 60],
  index: [30, 60, 240],
  crypto_perp: [15, 30, 60, 240],
  other: [],
}

function tfToMinutes(tf: string | null): number | null {
  if (!tf) return null
  const s = String(tf).trim().toUpperCase()
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  const m = s.match(/^(\d+)\s*(M|MIN|H|D|W)$/)
  if (m) {
    const n = parseInt(m[1], 10)
    return m[2] === "H" ? n * 60 : m[2] === "D" ? n * 1440 : m[2] === "W" ? n * 10080 : n
  }
  if (s === "D") return 1440
  if (s === "W") return 10080
  return null
}

/** Nº de confirmações passadas no payload (zonetouch/bandtouch/trendtracker...), ou null se não houver. */
function confirmationsPassed(raw: Json): number | null {
  const toBool = (v: unknown) =>
    v === true || v === 1 || (typeof v === "string" && /^(true|1|yes|sim|ok|pass|passed|✅)$/i.test(v.trim()))
  const src = raw.confirmations
  if (src && typeof src === "object" && !Array.isArray(src)) {
    const vals = Object.values(src as Record<string, unknown>)
    return vals.length ? vals.filter(toBool).length : null
  }
  if (Array.isArray(src)) {
    const arr = src as Array<Record<string, unknown>>
    return arr.length ? arr.filter((c) => toBool(c.passed ?? c.value ?? c.status)).length : null
  }
  const keys = ["zonetouch", "bandtouch", "trendtracker", "trend_tracker"]
  const present = keys.filter((k) => k in raw || k.toUpperCase() in raw)
  if (!present.length) return null
  return present.filter((k) => toBool(raw[k] ?? raw[k.toUpperCase()])).length
}

/** Só as melhores ideias abrem: confirmações suficientes + timeframe ajustado ao ativo. */
function passesQualityGate(
  raw: Json,
  timeframe: string | null,
  cls: AssetClass,
  isGoldKiller = false,
): boolean {
  // GoldKiller é um scanner dedicado de Ouro em 5m: a própria entrada É a decisão do
  // scanner (Momentum/Supertrend são só confirmações informativas, muitas vezes 0-1).
  // Aplicar o gate genérico (>=2 confirmações + timeframe 15m+) mataria todos os sinais
  // GoldKiller — por isso a estratégia própria passa direto.
  if (isGoldKiller) return true
  // Confirmações: se existirem, exige pelo menos 2 passadas.
  const passed = confirmationsPassed(raw)
  if (passed !== null && passed < 2) return false
  // Timeframe: se conhecido, tem de estar nos ajustados ao ativo.
  const min = tfToMinutes(timeframe)
  const pref = PREF_TF_MIN[cls]
  if (min !== null && pref.length && !pref.includes(min)) return false
  return true
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
/** Símbolos que cada utilizador recebe por defeito (o resto liga nos settings). */
const ALERT_DEFAULT_SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "USDCAD", "USDJPY", "BTCUSD", "US30"]

/**
 * Push dos Alertas MTM POR SUBSCRIÇÃO pessoal (símbolos/timeframes/push_enabled).
 * Mesma lógica de match do trigger in-app, mas só a utilizadores com dispositivo
 * ativo e com push ligado. Devolve o nº de destinatários.
 */
async function pushSignalSubscribers(
  supabase: SupabaseClient,
  opts: { ticker: string | null; timeframe: string | null; title: string; body: string; url: string; signalId?: string; category?: string; messageId?: string | null }
): Promise<number> {
  const { ticker, timeframe, title, body, url, signalId, category, messageId } = opts
  if (!ticker) return 0
  const norm = ticker.toUpperCase().replace(/[^A-Z0-9]/g, "")

  const { data: tokenRows } = await supabase.from("fcm_tokens").select("user_id").eq("active", true)
  const deviceUsers = [...new Set((tokenRows ?? []).map((t: { user_id: string }) => t.user_id).filter(Boolean))]
  if (!deviceUsers.length) return 0

  const [{ data: profs }, { data: subs }] = await Promise.all([
    supabase.from("profiles").select("id").eq("is_active", true).in("id", deviceUsers),
    supabase
      .from("user_signal_subscriptions")
      .select("user_id, enabled, push_enabled, symbols, timeframes")
      .in("user_id", deviceUsers),
  ])
  const activeSet = new Set((profs ?? []).map((p: { id: string }) => p.id))
  const subMap = new Map<string, { enabled: boolean | null; push_enabled: boolean | null; symbols: string[] | null; timeframes: string[] | null }>()
  for (const s of subs ?? []) subMap.set(s.user_id, s as any)

  const matchSym = (syms: string[]) => syms.some((sym) => norm.includes(sym.toUpperCase().replace(/[^A-Z0-9]/g, "")))

  const targets: string[] = []
  for (const uid of deviceUsers) {
    if (!activeSet.has(uid)) continue
    const s = subMap.get(uid)
    if (s) {
      if (s.enabled === false || s.push_enabled === false) continue
      const syms = Array.isArray(s.symbols) && s.symbols.length ? s.symbols : ALERT_DEFAULT_SYMBOLS
      if (!matchSym(syms)) continue
      if (Array.isArray(s.timeframes) && s.timeframes.length && timeframe && !s.timeframes.includes(timeframe)) continue
    } else {
      if (!matchSym(ALERT_DEFAULT_SYMBOLS)) continue
    }
    targets.push(uid)
  }
  if (!targets.length) return 0

  await fetch(`${getSiteOrigin()}/api/notifications/send-push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userIds: targets,
      title,
      body,
      url,
      data: {
        type: "trade_alert",
        ticker,
        signal_id: signalId ?? "",
        url,
        ...(messageId ? { message_id: messageId } : {}),
        ...(category ? { category } : {}),
      },
      tag: `mtm_alert_${norm}`,
    }),
  })
  return targets.length
}

export async function POST(request: NextRequest) {
  // Secrets válidos: os de TRADINGVIEW_WEBHOOK_SECRET (podem ser vários, separados por
  // vírgula) MAIS o secret em uso "mtm-tv-sensei-2026" — sempre aceite para não partir o
  // webhook LIVE mesmo que a env não esteja definida. Fail-closed: sem secret válido → 401
  // (antes, com a env vazia, o endpoint ficava aberto a qualquer pessoa a disparar trades).
  const validSecrets = Array.from(new Set([
    ...(process.env.TRADINGVIEW_WEBHOOK_SECRET || "").split(",").map((s) => s.trim()).filter(Boolean),
    "mtm-tv-sensei-2026",
  ]))
  const url = new URL(request.url)
  const rawBody = await request.text()

  let payload: Json = {}
  let isJson = false
  try { payload = JSON.parse(rawBody); isJson = true } catch { payload = { message: rawBody } }

  const provided =
    url.searchParams.get("secret") ??
    (typeof payload.secret === "string" ? payload.secret : null) ??
    (typeof payload.passphrase === "string" ? payload.passphrase : null)
  if (!provided || !validSecrets.includes(provided)) {
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
  const entry = num(pick(payload, ["entry", "entry_price"]))
  const sl = num(pick(payload, ["sl", "stoploss", "stop_loss", "stop"]))
  const tp = num(pick(payload, ["tp", "takeprofit", "take_profit", "target", "tp1"]))
  const tp2 = num(pick(payload, ["tp2", "take_profit_2", "target2"]))
  const tp3 = num(pick(payload, ["tp3", "take_profit_3", "target3"]))
  const tp4 = num(pick(payload, ["tp4", "take_profit_4", "target4"]))
  const state = pick(payload, ["state", "phase"])
  const alertName = pick(payload, ["alert_name", "alert", "name", "strategy"])
  const freeText = isJson ? pick(payload, ["message", "comment", "text"]) : String(payload.message ?? "")

  // Classe de ativo → canal / Telegram / auto-copy
  let assetClass = classifyAsset(ticker)
  const route = resolveRoute(assetClass)

  // GoldKiller: trada Ouro (mesma classe que o Sensei) mas é um scanner distinto →
  // identifica-se pelo nome da estratégia/alerta e vai para o seu canal próprio
  // "Sinais Scanner Goldkiller" (chat + Tap to Trade). Auto-copy para a conta GoldKiller
  // (SDNb / 181271197), com 0.5% de risco e trailing conforme o scanner — NÃO copia
  // para a conta Sensei.
  const stratText = `${alertName || ""} ${freeText || ""}`.toLowerCase()
  const isGoldKiller =
    assetClass === "gold_btc" && /goldkiller|gold[\s_-]*kill/.test(stratText) && !/sensei/.test(stratText)
  // Identidade do scanner (p/ exclusões por-scanner nos gates, ex.: MTMScanner sem ouro).
  // Nova dinâmica dedicada de perpétuos cripto — identifica-se pelo nome do alerta
  // (ex.: "MTM Perps"/"MTM Perps X"), não pelo ticker, para poder incluir o BTC perp
  // desta lista sem o roubar ao Sensei (que envia BTCUSDT.P para o fluxo gold_btc).
  const isMtmPerps = /mtm[\s_-]*perps?\b|perps?[\s_-]*scanner/.test(stratText)
  const scannerKey = isMtmPerps
    ? "mtmperps"
    : /mtm[\s_-]*scanner/.test(stratText)
      ? "mtmscanner"
      : isGoldKiller
        ? "goldkiller"
        : /sensei/.test(stratText)
          ? "sensei"
          : null
  // Endpoint dedicado /api/webhooks/tradingview-perps reencaminha para aqui com este
  // header → força o modo perps independentemente do nome do alerta (fonte = a lista).
  const forcedPerps = request.headers.get("x-mtm-perps") === "1"
  if (scannerKey === "mtmperps" || forcedPerps) {
    // Lista única de perps → sempre canal "Ideias de Perpétuos Cripto", em PAPEL.
    // Execução real (Bybit, motor de cópia próprio) fica para a Fase 2, atrás de flag.
    assetClass = "crypto_perp"
    route.channel = "cripto-perps"
    route.telegram = null
    route.sender = "🪙 Perpétuos Cripto"
    route.push = true
    route.autoCopy = false
  } else if (isGoldKiller) {
    route.channel = "sinais-goldkiller"
    // Canal Telegram dedicado GoldKiller (bot admin). Publica lá + chat app + auto-copy.
    // Resolver durável (sobrevive a Basic→Supergroup); env TELEGRAM_CHANNEL_GOLDKILLER se definido.
    route.telegram = resolvedGoldkillerScannerChatId()
    route.sender = "🥇 GoldKiller Scanner"
    route.autoCopy = true
  } else if (scannerKey === "mtmscanner") {
    // MTM Scanner (Forex) → chat dedicado "Sinais Scanner MTM"; Telegram mantém-se no
    // canal Forex (resolveRoute), como pedido. Execução continua pela rota Trade Ideas (5IHE).
    route.channel = "sinais-scanner-mtm"
    route.sender = "📊 MTM Scanner"
  }

  // Perpétuos cripto: só 1H vai para o chat/canal (SL curtos noutros TF → overtrading).
  // Os restantes timeframes ficam só em tradingview_signals (sem chat/Telegram).
  if (assetClass === "crypto_perp") {
    const tfMin = tfToMinutes(timeframe)
    if (tfMin !== null && tfMin !== 60) {
      route.channel = null
      route.telegram = null
      route.push = false
    }
  }

  const allTp = [tp, tp2, tp3, tp4].filter((n): n is number => n != null)
  const senseiFields: SenseiTradingViewFields = {
    ticker,
    action,
    price,
    entry,
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

  // Evento de gestão em JSON (GoldKiller/MTMScanner enviam event: tp_hit/sl_hit/exit/be
  // em tempo real). Estes NÃO criam card novo — só atualizam o estado da entrada + notificam.
  const mgmtRaw = (pick(payload, ["event", "event_type", "mgmt"]) || "").toLowerCase()
  const mgmtStatus: string | null =
    !isSensei && mgmtRaw
      ? /sl_hit|stop.?hit|stoploss/.test(mgmtRaw)
        ? "loss"
        : /exit|close/.test(mgmtRaw)
          ? "closed"
          : /tp_hit|tp.?hit|takeprofit/.test(mgmtRaw)
            ? `exit_${Math.min(4, Math.max(1, Math.round(num(pick(payload, ["tp_level", "level"])) ?? 1)))}`
            : /break.?even|(^|[^a-z])be([^a-z]|$)/.test(mgmtRaw)
              ? "be"
              : null
      : null

  // Estado inicial da trade (garante que TODOS os caminhos, incluindo "só Alertas MTM",
  // gravam trade_status/signal_kind — senão o avaliador de win/loss ignorava-os).
  const initAlertType = activeSensei?.alertType
  const initIsFollow =
    initAlertType === "tp_hit" || initAlertType === "sl_hit" || initAlertType === "breakeven" || initAlertType === "exit"
  const initTradeStatus = mgmtStatus
    ? mgmtStatus
    : initIsFollow
      ? initAlertType === "sl_hit"
        ? "loss"
        : initAlertType === "exit"
          ? "closed"
          : initAlertType === "tp_hit"
            ? `exit_${activeSensei?.tpLevel ?? 1}`
            : "be"
      : initAlertType === "idea"
        ? "pending"
        : "active"
  const initSignalKind = mgmtStatus || initIsFollow ? "followup" : "entry"

  // Log inicial
  const { data: logRow } = await supabase
    .from("tradingview_signals")
    .insert({ ticker, exchange, timeframe, action, price, sl, tp, alert_name: alertName, message: freeText, raw_payload: payload, ai_status: "pending", trade_status: initTradeStatus, signal_kind: initSignalKind })
    .select("id").single()
  const logId = logRow?.id as string | undefined

  // Imagem do sinal (só entradas): aponta o cartão para a rota lazy, que renderiza o gráfico
  // TradingView REAL (chart-img) com as linhas da trade na 1.ª visualização (CDN cacheia por
  // sinal → quota só gasta em sinais vistos) e cai no card sintético /api/og/signal se falhar.
  if (initSignalKind === "entry" && logId) {
    await supabase
      .from("tradingview_signals")
      .update({ chart_image_url: `${url.origin}/api/signals/chart-image?id=${logId}` })
      .eq("id", logId)
      .then(undefined, (e) => console.error("[webhook] chart_image_url update:", e))
  }

  // Atalho para eventos de gestão JSON: atualiza a entrada + notifica na hora, sem chat/cópia.
  if (mgmtStatus && ticker) {
    try {
      const { data: entryRow } = await supabase
        .from("tradingview_signals")
        .select("id, chat_message_id")
        .eq("ticker", ticker)
        .eq("signal_kind", "entry")
        .in("trade_status", ["active", "pending", "be", "exit_1", "exit_2", "exit_3"])
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (entryRow?.id) {
        await supabase.from("tradingview_signals").update({ trade_status: mgmtStatus }).eq("id", entryRow.id)
        if (mgmtStatus === "loss" || mgmtStatus === "be" || mgmtStatus.startsWith("exit_")) {
          await notifySignalOutcome({
            entryId: entryRow.id,
            chatMessageId: (entryRow as { chat_message_id?: string | null }).chat_message_id ?? null,
            ticker,
            status: mgmtStatus,
          })
        }
      }
    } catch (e) {
      console.error("[tradingview-webhook] mgmt event error:", e)
    }
    return NextResponse.json({ ok: true, followup: true, status: mgmtStatus, signal_id: logId })
  }

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

  // Ativos sem canal dedicado (stocks/ETFs/outros) → só sistema de Alertas MTM (sem chat/Telegram)
  if (!route.channel) {
    if (logId) await supabase.from("tradingview_signals").update({ chat_status: "filtered", telegram_status: "filtered" }).eq("id", logId)
    return NextResponse.json({ ok: true, valid: true, filtered: true, asset_class: assetClass, signal_id: logId })
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
  // Auto-copy CopyFactory: Ouro/BTC → conta Sensei; Forex → conta MTM Auto Forex (5IHE).
  // Master switch SENSEI_PROVIDER_EXEC_ENABLED + interruptor por-execução (runtime, DB).
  const execSwitches = await getExecSwitches()
  const execSwitchOn = isGoldKiller
    ? execSwitches.goldkiller
    : assetClass === "forex"
      ? execSwitches.forex
      : execSwitches.sensei
  // Regras de sinal (ruído + execução), data-driven, afináveis sem redeploy.
  const signalRules = await getSignalRules()
  const execConfCount = confirmationsPassed(payload)
  const execSymbolForGate = parsedForExec.symbol ?? ticker
  const execDirForGate = parsedForExec.direction ?? v.direction ?? null
  const execGate = isGoldKiller
    ? { ok: true as const }
    : passesExecGate(signalRules, execSymbolForGate, execDirForGate, execConfCount, scannerKey, assetClass)
  // Ordens LIMIT validadas: uma ideia/setup com preço de entrada pode colocar uma ordem
  // limit na conta provider. O entry_trigger dessa mesma ideia depois NÃO faz market
  // (guard provider_order_placed) → evita duplo preenchimento.
  const isLimitIdea =
    isIdeaAlert &&
    signalRules.exec_allow_limit_ideas &&
    parsedForExec.entry != null &&
    Boolean(parsedForExec.symbol) &&
    Boolean(parsedForExec.direction)
  let pendingHadLimit = false
  if (activeSensei?.alertType === "entry_trigger" && pendingIdeaId) {
    const { data: pi } = await supabase
      .from("sensei_trade_ideas")
      .select("provider_order_placed")
      .eq("id", pendingIdeaId)
      .maybeSingle()
    pendingHadLimit = (pi as { provider_order_placed?: boolean } | null)?.provider_order_placed === true
  }
  const canExecuteProvider =
    SENSEI_PROVIDER_EXEC_ENABLED &&
    execSwitchOn &&
    (assetClass === "gold_btc" || assetClass === "forex") &&
    parsedForExec.symbol &&
    parsedForExec.direction &&
    passesQualityGate(payload, timeframe, assetClass, isGoldKiller) &&
    execGate.ok &&
    !pendingHadLimit &&
    ((!isIdeaAlert && (activeSensei?.alertType === "entry_trigger" || !activeSensei)) || isLimitIdea)

  let savedIdea: { id: string; tradeNumber: number | null } | null = null
  // Ideia/trade a que esta entrada corresponde (para guardar o message_id da entrada).
  let entryTradeIdea: SenseiTradeIdea | null = pendingIdea
  if (isIdeaAlert && activeSensei) {
    savedIdea = await saveSenseiTradeIdea(supabase, activeSensei, logId)
  } else if (activeSensei?.alertType === "entry_trigger" && activeSensei.symbol) {
    // ENTRY sem ideia prévia → cria registo ativado chaveado pelo preço de entrada,
    // para os follow-ups (BE/SL/TP) se associarem e responderem em thread.
    entryTradeIdea = pendingIdea ?? (await createActivatedSenseiIdea(supabase, activeSensei, logId))
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
        target: isGoldKiller ? "goldkiller" : assetClass === "forex" ? "forex" : "sensei",
      })
      providerExecuted = exec.executed
      providerDetail = exec.detail
      // Marca a ideia como já tendo ordem no provider → o entry_trigger não duplica.
      if (isLimitIdea && exec.executed && savedIdea?.id) {
        await supabase.from("sensei_trade_ideas").update({ provider_order_placed: true }).eq("id", savedIdea.id)
      }
    } catch (err) {
      console.error("[tradingview-webhook] provider exec error:", err)
    }
    if (pendingIdeaId) await activateSenseiTradeIdea(supabase, pendingIdeaId, logId)
  }

  // Follow-up (TP/BE/SL/Saída): liga à entrada correspondente para responder em thread
  const alertType = activeSensei?.alertType
  const isFollowup =
    alertType === "tp_hit" || alertType === "sl_hit" || alertType === "breakeven" || alertType === "exit"
  // Gate de RUÍDO: entradas de baixa qualidade (poucas confirmações / símbolo-ruído) não
  // vão para chat/Telegram/push. Follow-ups (TP/BE/SL) e GoldKiller passam sempre.
  const alertOk =
    isFollowup || isGoldKiller || forcedPerps || scannerKey === "mtmperps" ||
    passesAlertGate(signalRules, execSymbolForGate, execConfCount, scannerKey, assetClass)
  let linkedIdea: SenseiTradeIdea | null = null
  if (isFollowup && activeSensei?.symbol) {
    linkedIdea = await findActiveSenseiIdeaForFollowup(
      supabase,
      activeSensei.symbol,
      activeSensei.timeframe,
      activeSensei.direction,
      activeSensei.entry, // associa pelo PREÇO DE ENTRADA original
    )
  }

  // Contexto da mensagem: entrada/TP/numeração (da ideia ligada por preço, ou da própria entrada)
  const msgCtx: SenseiMsgCtx | null = linkedIdea
    ? { entry: linkedIdea.entry, tp: linkedIdea.tp, tradeNumber: linkedIdea.tradeNumber }
    : entryTradeIdea
      ? { entry: activeSensei?.entry ?? entryTradeIdea.entry, tp: activeSensei?.tp ?? entryTradeIdea.tp, tradeNumber: entryTradeIdea.tradeNumber }
      : savedIdea
        ? { entry: activeSensei?.entry ?? null, tp: activeSensei?.tp ?? [], tradeNumber: savedIdea.tradeNumber }
        : null

  // Gestão automática Sensei (gated): TP/BE/SL → parciais + BE + trailing ou fecho na conta Sensei
  if (
    SENSEI_PROVIDER_EXEC_ENABLED &&
    assetClass === "gold_btc" &&
    isFollowup &&
    activeSensei?.symbol &&
    (!isGoldKiller || execSwitches.goldkiller)
  ) {
    try {
      await processMtmcopyWebhookManagement({
        symbol: activeSensei.symbol,
        direction: activeSensei.direction ?? linkedIdea?.direction ?? null,
        alertType: activeSensei.alertType,
        tpLevel: activeSensei.tpLevel ?? null,
        entry: linkedIdea?.entry ?? activeSensei.entry ?? null,
        target: isGoldKiller ? "goldkiller" : "sensei",
      })
    } catch (err) {
      console.error("[tradingview-webhook] sensei/goldkiller management error:", err)
    }
  }

  const post =
    assetClass === "gold_btc" && !isGoldKiller
      ? composePost(v, activeSensei, msgCtx)
      : composeGenericPost(route, v, timeframe)
  const replyToTelegramId = isFollowup ? linkedIdea?.telegramMessageId ?? null : null
  // Ideia cuja mensagem de entrada/activação guardamos para os follow-ups responderem
  const entryIdeaId = savedIdea?.id ?? entryTradeIdea?.id ?? null

  // Publica no canal de chat correspondente à classe de ativo (só se passar o gate de ruído)
  let chatId: string | null = null
  if (!alertOk) {
    if (logId) await supabase.from("tradingview_signals").update({ chat_status: "suppressed", telegram_status: "suppressed" }).eq("id", logId)
  } else {
    try {
      const { data: msg, error } = await supabase
        .from("chat_messages")
        .insert({ channel_slug: route.channel, message_type: "telegram_forward", content: post, telegram_sender: route.sender, user_id: null })
        .select("id").single()
      if (error) throw error
      chatId = msg.id as string
      if (logId) await supabase.from("tradingview_signals").update({ chat_status: "sent", chat_message_id: chatId }).eq("id", logId)
    } catch (err) {
      if (logId) await supabase.from("tradingview_signals").update({ chat_status: "error", ai_error: "chat: " + String(err) }).eq("id", logId)
    }
  }

  // Push (iOS/APK/PWA) — por SUBSCRIÇÃO pessoal (símbolos/timeframes/push_enabled).
  // Só ENTRADAS (não follow-ups) e para todas as classes de ativo.
  // await (não fire-and-forget): no Vercel o trabalho assíncrono é morto após a resposta.
  let pushOk = false
  // Perpétuos cripto só enviam push em 1H (SL curtos noutros TF → overtrading/ruído).
  const cryptoPerpBlocked =
    assetClass === "crypto_perp" && (() => {
      const m = tfToMinutes(timeframe)
      return m !== null && m !== 60
    })()
  if (alertOk && initSignalKind === "entry" && !cryptoPerpBlocked) {
    const dir =
      v.direction === "buy"
        ? "COMPRA"
        : v.direction === "sell"
          ? "VENDA"
          : action && /buy|long|compra/i.test(action)
            ? "COMPRA"
            : action && /sell|short|venda/i.test(action)
              ? "VENDA"
              : ""
    const sym = v.symbol ?? ticker ?? "Sinal"
    // Nome do chat/scanner de origem (ex.: "🥇 GoldKiller Scanner", "🧠 Sensei Scanner").
    const chatName = route.sender || alertName || "MTM"
    const pushTitle = "💡 Nova Ideia"
    const pushBody = [`Sinal · ${chatName}`, sym, dir, price != null ? `@ ${price}` : ""]
      .filter(Boolean)
      .join(" · ")
    // Âmbito T2T (decisão): MTM Scanner + GoldKiller + Forex (Premium vem por outro push).
    // Sinal num canal T2T → o toque abre direto o T2T + menu de aceitação (?signal=<msgId>).
    // Restantes → chat específico do sinal (com âncora à mensagem p/ scroll/realce).
    const T2T_NOTIF_CHANNELS = new Set(["trade-ideas-setup", "sinais-scanner-mtm", "trade-ideas", "sinais-goldkiller"])
    const isT2TNotif = Boolean(route.channel && chatId && T2T_NOTIF_CHANNELS.has(route.channel))
    const pushUrl = isT2TNotif
      ? `/app-mobile?tab=tap-to-trade&signal=${encodeURIComponent(chatId as string)}`
      : route.channel
        ? `/app-mobile?tab=chat&channel=${encodeURIComponent(route.channel)}${chatId ? `&msg=${encodeURIComponent(chatId)}` : ""}`
        : "/app-mobile?tab=trading-alerts"
    try {
      const n = await pushSignalSubscribers(supabase, {
        ticker,
        timeframe,
        title: pushTitle,
        body: pushBody,
        category: isT2TNotif ? "T2T_SIGNAL" : undefined,
        url: pushUrl,
        signalId: logId,
        messageId: chatId,
      })
      pushOk = n > 0
    } catch (e) {
      console.error("[tradingview-webhook] push error:", e)
    }
  }

  // Execução Bybit (ordem-MESTRE do Copy Trading nativo) para entries perp 1H. A chamada
  // vai à rota edge /api/bybit/place (fra1) porque este webhook corre em iad1 (EUA) e a
  // Bybit geo-bloqueia. A rota é gated por BYBIT_PERPS_EXEC_ENABLED (default OFF → skipped),
  // por isso é seguro chamar sempre; só dispara ordem real quando ligares a flag.
  if (assetClass === "crypto_perp" && alertOk && initSignalKind === "entry" && !cryptoPerpBlocked) {
    const cronSecret = process.env.CRON_SECRET
    const bybitSide = v.direction === "sell" ? "sell" : "buy"
    const bybitEntry = v.entry ?? entry ?? price ?? null
    const bybitSl = v.sl ?? sl ?? null
    const bybitTp = tp ?? tp2 ?? null
    if (cronSecret && (v.symbol ?? ticker) && bybitEntry != null) {
      try {
        const res = await fetch(`${url.origin}/api/bybit/place`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cronSecret}` },
          body: JSON.stringify({
            symbol: v.symbol ?? ticker,
            side: bybitSide,
            entry: bybitEntry,
            sl: bybitSl,
            tp: bybitTp,
          }),
        })
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean; skipped?: boolean; orderId?: string | null; retMsg?: string; sizing?: string; reason?: string; error?: string
        }
        const detail = j.skipped
          ? `skipped: ${j.reason ?? "flag off"}`
          : j.ok
            ? `#${j.orderId} · ${j.sizing ?? ""}`
            : `falhou: ${j.retMsg ?? j.error ?? "?"}`
        if (logId) {
          await supabase.from("tradingview_signals").update({
            bybit_order_id: j.ok ? j.orderId ?? null : null,
            bybit_exec_detail: detail.slice(0, 300),
          }).eq("id", logId)
        }
        console.log(`[webhook][bybit] ${v.symbol ?? ticker} ${bybitSide} → ${detail}`)
      } catch (e) {
        console.error("[webhook][bybit] place error:", e)
        if (logId) await supabase.from("tradingview_signals").update({ bybit_exec_detail: `erro: ${String(e).slice(0, 200)}` }).eq("id", logId)
      }
    }
  }

  // Relay Telegram → grupo correspondente à classe (Ouro/BTC: -1003853860780, Forex: -1003716578747)
  const relayChatId = route.telegram
  const relayOn = Boolean(alertOk && relayChatId && AIBOT_TOKEN && !RELAY_DISABLED)
  let tgOk = false
  let telegramMid: number | null = null
  if (relayOn && relayChatId) {
    try {
      const mid = await sendTelegram(AIBOT_TOKEN, relayChatId, post, replyToTelegramId)
      telegramMid = mid
      tgOk = true
      if (logId) await supabase.from("tradingview_signals").update({ telegram_status: "sent", telegram_chat_id: relayChatId, telegram_message_id: mid, relayed_at: new Date().toISOString() }).eq("id", logId)
    } catch (err) {
      if (logId) await supabase.from("tradingview_signals").update({ telegram_status: "error", telegram_chat_id: relayChatId, telegram_error: String(err) }).eq("id", logId)
    }
  } else if (logId) {
    const reason = !relayChatId ? "sem grupo Telegram para esta classe" : !AIBOT_TOKEN ? "TELEGRAM_AIBOT_TOKEN em falta" : "relay desligado"
    await supabase.from("tradingview_signals").update({ telegram_status: "disabled", telegram_error: reason }).eq("id", logId)
  }

  // Estado da trade para os Alertas MTM (Pendente / Ativa / Exit N / Loss / Fechada)
  try {
    const isFollow = isFollowup && Boolean(activeSensei)
    const tradeStatus = isFollow
      ? alertType === "sl_hit"
        ? "loss"
        : alertType === "exit"
          ? "closed"
          : alertType === "tp_hit"
            ? `exit_${activeSensei?.tpLevel ?? 1}`
            : "be" // breakeven → continua ativa (protegida)
      : activeSensei?.alertType === "idea"
        ? "pending"
        : "active"
    const signalKind = isFollow ? "followup" : "entry"
    if (logId) {
      await supabase.from("tradingview_signals").update({ trade_status: tradeStatus, signal_kind: signalKind }).eq("id", logId)
    }
    // Follow-up: atualiza o estado da entrada correspondente mais recente
    if (isFollow && ticker) {
      const { data: entryRow } = await supabase
        .from("tradingview_signals")
        .select("id, chat_message_id")
        .eq("ticker", ticker)
        .eq("signal_kind", "entry")
        .in("trade_status", ["active", "pending", "be", "exit_1", "exit_2", "exit_3"])
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (entryRow?.id) {
        await supabase.from("tradingview_signals").update({ trade_status: tradeStatus }).eq("id", entryRow.id)
        // Notifica seguidores + quem aceitou no T2T: break-even (proteger), SL ou um TP
        if (tradeStatus === "loss" || tradeStatus === "be" || tradeStatus.startsWith("exit_")) {
          try {
            await notifySignalOutcome({
              entryId: entryRow.id,
              chatMessageId: (entryRow as { chat_message_id?: string | null }).chat_message_id ?? null,
              ticker,
              status: tradeStatus,
            })
          } catch (e) {
            console.error("[tradingview-webhook] notify outcome error:", e)
          }
        }
      }
    }
  } catch (e) {
    console.error("[tradingview-webhook] trade_status error:", e)
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
