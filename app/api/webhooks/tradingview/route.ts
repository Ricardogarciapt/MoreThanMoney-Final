import { NextRequest, NextResponse } from "next/server"
import { encaminharSinalParaMestre } from "@/lib/mestres/servidor/sinal-mestre"
import { estrategiasPublicadasPelaMestre } from "@/lib/mestres/servidor/canais-publicados"
import { publicarEntradaDaMestre } from "@/lib/mestres/servidor/publicar"
import { canalDeSinaisPago } from "@/lib/direito-sinais"
import { filtrarComDireitoSinaisPagos } from "@/lib/direito-sinais-servidor"
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
import { precoDaCorretora } from "@/lib/mtmcopy/trade-outcome"
import { recordSenseiShadow } from "@/lib/mtmcopy/sensei-shadow"
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
import { resolvedTradeIdeasChatId, resolvedForexIdeasChatId, resolvedGoldkillerScannerChatId, resolvedMtmScannerChatId, resolvedPerpsChatId } from "@/lib/telegram-channel-ids"
import { getExecSwitches } from "@/lib/mtmcopy/exec-switches"
import { evaluatePerpsSignalGate } from "@/lib/mtmcopy/perps-signal-gate"
import { getSignalRules, passesAlertGate, passesExecGate } from "@/lib/mtmcopy/signal-rules"
import { temTodasAsConfirmacoes } from "@/lib/mtmcopy/scanner-confirmacoes"
import { decidirScannerParaMestre } from "@/lib/mtmcopy/scanner-para-mestre"
// Classificação do ativo e gates locais vivem em lib: a sombra das estratégias (lib/mtmauto/sombra)
// tem de decidir «teria executado?» com EXACTAMENTE o mesmo código que este webhook.
import { classifyAsset, confirmationsPassed, isCryptoPerpTicker, passesQualityGate, stopsSane, type AssetClass } from "@/lib/mtmcopy/webhook-gates"
import { notifySignalOutcome } from "@/lib/mtm-alerts/notify-outcome"
import { urlDoChat, urlDoTapToTrade } from "@/lib/notificacao-destino"
import { lifecycleMessage, stopFoiProtegido } from "@/lib/mtmcopy/signal-lifecycle"
import { formatarSeguimento, formatarSinal } from "@/lib/sinais/formato-sinal"
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
// Aceita ambos os nomes de env (SENSEI_PROVIDER_EXEC_ENABLED histórico + PROVIDER_EXEC_ENABLED)
// para evitar o mismatch que mantinha Sensei/GoldKiller/Forex sem abrir.
const SENSEI_PROVIDER_EXEC_ENABLED =
  (process.env.SENSEI_PROVIDER_EXEC_ENABLED || process.env.PROVIDER_EXEC_ENABLED || "false").toLowerCase() === "true"

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
  /**
   * O stop ORIGINAL da ideia — não o que vem no alerta de gestão.
   *
   * No `sl_hit` o alerta traz o stop ATUAL, que a esta altura já pode estar no break-even. Sem
   * o original não há forma de saber se a trade fechou no stop ou fechou protegida, e as duas
   * coisas dizem ao membro o contrário uma da outra.
   */
  slOriginal?: number | null
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

  // ---- Entrada: Nova Ideia / Entry Alert (Ideia Activada) — FORMATO ÚNICO ----
  // «Entrada activada» continua no estado: é por ele que o feed T2T distingue a ideia activada.
  if (alertType === "idea" || alertType === "signal" || alertType === "entry_trigger") {
    const isTrigger = alertType === "entry_trigger"
    const dirU = direction === "sell" ? "sell" : direction === "buy" ? "buy" : null
    if (dirU && symbol !== "—") {
      return formatarSinal({
        estrategia: "MTM Auto Sensei",
        simbolo: symbol,
        direcao: dirU,
        entrada: entry,
        sl: v.sl ?? sensei?.sl ?? null,
        tps: tps.slice(0, 4),
        timeframe: sensei?.timeframe ?? null,
        estado: isTrigger ? `Entrada activada${tag} ✅` : `Nova ideia${tag}`,
        extras: [`🔎 Validação: ${pct}%`],
      })
    }
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

  // ---- Follow-ups (gestão) ----
  // NÃO reconstruir COMPRA/VENDA aqui (o alerta de gestão pode trazer a direção do FECHO, que
  // contradiz a entrada). E a gestão é AUTOMÁTICA por PREÇO (parciais + break-even) — nada de
  // instruções manuais "Fecha 25% / Trailing" que já não correspondem ao sistema.
  const mgmtHead = `📊 ${symbol}`

  // Direção da ENTRADA, deduzida do contexto da ideia (entrada vs 1º alvo) e nunca do alerta de
  // gestão — esse pode trazer a direção do FECHO, que é a inversa, e inverteria o sinal dos pips.
  const ctxDir: "buy" | "sell" | null =
    ctx?.entry != null && ctx?.tp?.length ? (ctx.tp[0] > ctx.entry ? "buy" : "sell") : null

  // HARMONIZAÇÃO (pedido Ricardo 2026-08-20): os follow-ups usam o VOCABULÁRIO CANÓNICO
  // (lifecycleMessage) — o mesmo nome do acontecimento em chat, Telegram, push e T2T — com a
  // linha de marca do scanner por baixo. As ENTRADAS mantêm o formato próprio (cartão parseável).
  if (alertType === "tp_hit") {
    const lvl = sensei?.tpLevel ?? 1
    const tpVal = tps[lvl - 1]
    const last = lvl >= 4
    const { text } = lifecycleMessage(last ? "target_final" : "partial", {
      symbol,
      direction: ctxDir,
      level: lvl,
      // O alvo É o preço de saída desta parcial — com a entrada dá pips e percentagem no cabeçalho.
      entry,
      price: tpVal ?? null,
      reason: tpVal != null ? `TP${lvl}: ${tpVal}.` : null,
    })
    return [formatarSeguimento(text, "MTM Auto Sensei"), `🧠 Sensei Scanner${tag} · gestão automática por preço.`, DISCLAIMER].join("\n")
  }

  if (alertType === "breakeven") {
    const { text } = lifecycleMessage("break_even", { symbol, direction: ctxDir })
    return [formatarSeguimento(text, "MTM Auto Sensei"), `🧠 Sensei Scanner${tag}`, DISCLAIMER].join("\n")
  }

  if (alertType === "sl_hit") {
    const slPx = v.sl ?? sensei?.sl ?? null
    /**
     * O alerta diz «o meu stop foi tocado». Não diz se isso foi uma perda.
     *
     * Depois do break-even ou do trailing, o stop está na entrada ou acima dela — tocá-lo é a
     * proteção a funcionar. Comparar o preço de fecho com o stop ORIGINAL é o que separa as
     * duas coisas; sem isso, uma trade que embolsou o alvo 1 e fechou a zero era anunciada como
     * «Stop loss · a trade fechou no stop».
     */
    const protegido = stopFoiProtegido({
      direction: ctxDir,
      entry,
      slOriginal: ctx?.slOriginal ?? null,
      price: slPx,
    })
    const { text } = lifecycleMessage(protegido ? "stop_protegido" : "stop_loss", {
      symbol,
      direction: ctxDir,
      entry,
      price: slPx,
      slOriginal: ctx?.slOriginal ?? null,
    })
    return [formatarSeguimento(text, "MTM Auto Sensei"), `🧠 Sensei Scanner${tag}`, DISCLAIMER].join("\n")
  }

  if (alertType === "exit") {
    const { text } = lifecycleMessage("closed", { symbol, direction: ctxDir })
    return [formatarSeguimento(text, "MTM Auto Sensei"), `🧠 Sensei Scanner${tag}`, DISCLAIMER].join("\n")
  }

  // fallback genérico
  const title = sensei ? senseiAlertTypeLabel(sensei.alertType) : "Alerta"
  return [`🧠 Sensei Scanner — ${title}${tag}`, ``, mgmtHead, DISCLAIMER].join("\n")
}

// ─── Roteamento por classe de ativo ──────────────────────────────────────────
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
      // Fundido com a Aurum Flow a 18/09: um canal só, «MTM Auto Aurum Flow & Perpétuos».
      return { channel: "aurum-flow", telegram: resolvedPerpsChatId(), sender: "🪙 Perpétuos Cripto", push: true, autoCopy: false }
    default:
      return { channel: null, telegram: null, sender: "", push: false, autoCopy: false }
  }
}

/** Etiqueta da estratégia (formato único) a partir do remetente da rota. */
function estrategiaDoRemetente(sender: string): string {
  if (/gold\s*killer/i.test(sender)) return "MTM Auto GoldKiller"
  if (/aurum/i.test(sender)) return "MTM Auto Aurum Flow"
  if (/mtm\s*scanner/i.test(sender)) return "MTM Scanner"
  if (/perp/i.test(sender)) return "MTM Perps"
  if (/sensei/i.test(sender)) return "MTM Auto Sensei"
  if (/forex/i.test(sender)) return "Ideias de Forex"
  if (/[íi]ndices/i.test(sender)) return "Ideias de Índices"
  return sender.replace(/^[^\p{L}]+/u, "").trim() || "MTM"
}

/** Card genérico (forex/índices/cripto/GoldKiller) — FORMATO ÚNICO (lib/sinais/formato-sinal). */
function composeGenericPost(
  route: SignalRoute,
  v: { symbol: string | null; direction: "buy" | "sell" | null; entry: number | null; sl: number | null; tp: number[]; confidence: number },
  timeframe: string | null,
): string {
  if (v.symbol && v.direction) {
    return formatarSinal({
      estrategia: estrategiaDoRemetente(route.sender),
      simbolo: v.symbol,
      direcao: v.direction,
      entrada: v.entry,
      sl: v.sl,
      tps: v.tp ?? [],
      timeframe,
      extras: [`🔎 Validação: ${Math.round((v.confidence || 0) * 100)}%`],
    })
  }
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
  opts: {
    ticker: string | null; timeframe: string | null; title: string; body: string; url: string; signalId?: string; category?: string; messageId?: string | null
    /** Sinal de scanner pago (Sensei/GoldKiller): só vai a quem tem direito (lib/direito-sinais). */
    pago?: boolean
    channel?: string | null
  }
): Promise<number> {
  const { ticker, timeframe, title, body, url, signalId, category, messageId, pago, channel } = opts
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

  // SÓ QUEM SEGUE. Sem subscrição explícita não há aviso: quem nunca escolheu nada recebia
  // TODOS os alertas dos símbolos por omissão — 82 pessoas por cada alerta, dezenas por dia,
  // e como este envio não trazia categoria nenhuma nem sequer passava pelas preferências. Era
  // esta a maior fonte de ruído (e de egress) que sobrava depois de mudar os padrões.
  const targets: string[] = []
  for (const uid of deviceUsers) {
    if (!activeSet.has(uid)) continue
    const s = subMap.get(uid)
    if (!s) continue
    if (s.enabled === false || s.push_enabled === false) continue
    const syms = Array.isArray(s.symbols) && s.symbols.length ? s.symbols : ALERT_DEFAULT_SYMBOLS
    if (!matchSym(syms)) continue
    if (Array.isArray(s.timeframes) && s.timeframes.length && timeframe && !s.timeframes.includes(timeframe)) continue
    targets.push(uid)
  }
  // O corpo leva direção e preço («Sensei · XAUUSD · COMPRA · @ 2345»): num sinal pago, só a quem
  // tem direito. O send-push volta a filtrar pela marca `sinal_pago` — duas guardas, a mesma regra.
  if (pago && targets.length) {
    const comDireito = new Set(await filtrarComDireitoSinaisPagos(targets))
    for (let i = targets.length - 1; i >= 0; i--) if (!comDireito.has(targets[i])) targets.splice(i, 1)
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
        ...(channel ? { channel } : {}),
        ...(pago ? { sinal_pago: "1" } : {}),
      },
      tag: `mtm_alert_${norm}`,
    }),
  })
  return targets.length
}

export async function POST(request: NextRequest) {
  // Secrets válidos: os de TRADINGVIEW_WEBHOOK_SECRET (vários, separados por vírgula) — a via
  // preferida e ROTACIONÁVEL. O secret LEGADO "mtm-tv-sensei-2026" (hardcoded histórico) continua
  // aceite POR DEFEITO para não partir os alertas atuais, MAS pode ser desligado com
  // TRADINGVIEW_ALLOW_LEGACY_SECRET=false depois de migrares os alertas para o env secret forte.
  // Fail-closed: sem secret válido → 401.
  const LEGACY_SECRET = "mtm-tv-sensei-2026"
  const envSecrets = (process.env.TRADINGVIEW_WEBHOOK_SECRET || "").split(",").map((s) => s.trim()).filter(Boolean)
  const allowLegacy = process.env.TRADINGVIEW_ALLOW_LEGACY_SECRET !== "false"
  const validSecrets = new Set<string>([...envSecrets, ...(allowLegacy ? [LEGACY_SECRET] : [])])
  const url = new URL(request.url)
  const rawBody = await request.text()

  let payload: Json = {}
  let isJson = false
  try { payload = JSON.parse(rawBody); isJson = true } catch { payload = { message: rawBody } }

  const provided =
    url.searchParams.get("secret") ??
    (typeof payload.secret === "string" ? payload.secret : null) ??
    (typeof payload.passphrase === "string" ? payload.passphrase : null)
  if (!provided || !validSecrets.has(provided)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  // Aviso de migração: alerta ainda usa o secret LEGADO apesar de já haver env secret forte definido.
  if (provided === LEGACY_SECRET && envSecrets.length) {
    console.warn("[tv-webhook] secret LEGADO em uso — migra o alerta para o env secret e liga TRADINGVIEW_ALLOW_LEGACY_SECRET=false")
  }
  if (isJson) { delete payload.secret; delete payload.passphrase }

  const supabase = getSupabaseAdmin()

  // Campos do alerta TradingView
  const ticker = pick(payload, ["ticker", "symbol", "pair", "instrument"])
  const exchange = pick(payload, ["exchange", "broker"])
  const timeframe = pick(payload, ["timeframe", "interval", "tf", "resolution"])
  const action = pick(payload, ["action", "side", "order_action", "strategy_order_action", "signal"])
  /**
   * Os preços arredondam-se AQUI, à entrada, e não ao mostrar.
   *
   * Um indicador que calcula o stop a partir do ATR manda 4452.9733242788. Esse preço não existe:
   * o ouro cota-se ao cêntimo. Chegava assim ao cartão do chat (que transbordava), ao Telegram,
   * à tabela de acompanhamento, à app e à ordem enviada à corretora — que teria de o arredondar
   * sozinha, ou recusar.
   *
   * Arredondar só na apresentação deixava a base de dados a discordar do ecrã, e o "entry hit"
   * a comparar-se com um número que ninguém viu.
   */
  const preco = (n: number | null) => precoDaCorretora(n, ticker)
  const price = preco(num(pick(payload, ["price", "close", "order_price", "strategy_order_price"])))
  const entry = preco(num(pick(payload, ["entry", "entry_price"])))
  const sl = preco(num(pick(payload, ["sl", "stoploss", "stop_loss", "stop"])))
  const tp = preco(num(pick(payload, ["tp", "takeprofit", "take_profit", "target", "tp1"])))
  const tp2 = preco(num(pick(payload, ["tp2", "take_profit_2", "target2"])))
  const tp3 = preco(num(pick(payload, ["tp3", "take_profit_3", "target3"])))
  const tp4 = preco(num(pick(payload, ["tp4", "take_profit_4", "target4"])))
  const state = pick(payload, ["state", "phase"])
  const alertName = pick(payload, ["alert_name", "alert", "name", "strategy"])
  const freeText = isJson ? pick(payload, ["message", "comment", "text"]) : String(payload.message ?? "")

  // ── Entrada por ZONA + reação Premium (gatilho A) ─────────────────────────────
  // Um alerta Pine de reação DENTRO da zona dispara a entrada de um pendente Premium
  // (mtmcopy_premium_pending). Isolado do routing normal — marca-se com event=premium_zone_reaction
  // ou nome de alerta com "premium zone"/"zone reaction". Respeita a config (off/shadow/live).
  {
    const zoneStrat = `${alertName || ""} ${freeText || ""}`.toLowerCase()
    const eventField = String(pick(payload, ["event", "event_type", "type"]) || "").toLowerCase()
    const isPremiumZoneReaction =
      eventField === "premium_zone_reaction" || /premium[\s_-]*zone|zone[\s_-]*reaction/.test(zoneStrat)
    if (isPremiumZoneReaction) {
      const dir = /sell|short/i.test(String(action || ""))
        ? "sell"
        : /buy|long/i.test(String(action || ""))
          ? "buy"
          : null
      const px = price ?? entry ?? null
      if (dir && px != null && px > 0) {
        const { triggerPremiumZoneByReaction } = await import("@/lib/mtmcopy/premium-zone-monitor")
        const r = await triggerPremiumZoneByReaction(String(ticker || "XAUUSD"), dir, px)
        return NextResponse.json({ ok: true, premium_zone_reaction: true, fired: r.fired })
      }
      return NextResponse.json({ ok: true, premium_zone_reaction: true, fired: 0, note: "sem direção/preço válidos" })
    }
  }

  // Classe de ativo → canal / Telegram / auto-copy
  let assetClass = classifyAsset(ticker)
  const route = resolveRoute(assetClass)

  // GoldKiller: trada Ouro (mesma classe que o Sensei) mas é um scanner distinto →
  // identifica-se pelo nome da estratégia/alerta e vai para o seu canal próprio
  // "Sinais Scanner Goldkiller" (chat + Tap to Trade). Auto-copy para a conta GoldKiller
  // (SDNb / 181271197), com 0.5% de risco e trailing conforme o scanner — NÃO copia
  // para a conta Sensei.
  const stratText = `${alertName || ""} ${freeText || ""}`.toLowerCase()
  let isGoldKiller =
    assetClass === "gold_btc" && /goldkiller|gold[\s_-]*kill/.test(stratText) && !/sensei/.test(stratText)
  // Identidade do scanner (p/ exclusões por-scanner nos gates, ex.: MTMScanner sem ouro).
  // Nova dinâmica dedicada de perpétuos cripto — identifica-se pelo nome do alerta
  // (ex.: "MTM Perps"/"MTM Perps X"), não pelo ticker, para poder incluir o BTC perp
  // desta lista sem o roubar ao Sensei (que envia BTCUSDT.P para o fluxo gold_btc).
  let isMtmPerps = /mtm[\s_-]*perps?\b|perps?[\s_-]*scanner/.test(stratText)
  // Aurum Flow (ORB) — fonte de perps distinta do MTM Perps (Sensei X). Marca própria no chat
  // + gate de execução por-fonte (backtest 2026-08: ORB rentável em ETH, negativo em BTC).
  let isAurumFlow = /aurum\s*flow/.test(stratText)
  let scannerKey: string | null = isMtmPerps
    ? "mtmperps"
    : /mtm[\s_-]*scanner/.test(stratText)
      ? "mtmscanner"
      : isGoldKiller
        ? "goldkiller"
        : /sensei/.test(stratText)
          ? "sensei"
          : null

  // ── WEBHOOK DEDICADO POR ESTRATÉGIA (consolidação) ──────────────────────────────────
  // `?strategy=sensei|goldkiller|aurum|mtmscanner|mtmperps` FORÇA a estratégia e ignora a
  // deteção por conteúdo → cada alerta do TradingView aponta para o seu URL, sem adivinhação.
  const forcedStrategy = (url.searchParams.get("strategy") || "").toLowerCase().trim()
  if (forcedStrategy) {
    isGoldKiller = forcedStrategy === "goldkiller"
    isAurumFlow = forcedStrategy === "aurum" || forcedStrategy === "aurumflow"
    isMtmPerps = forcedStrategy === "mtmperps"
    scannerKey =
      forcedStrategy === "goldkiller"
        ? "goldkiller"
        : forcedStrategy === "sensei"
          ? "sensei"
          : forcedStrategy === "mtmscanner" || forcedStrategy === "scanner"
            ? "mtmscanner"
            : isAurumFlow
              ? "aurum"
              : isMtmPerps
                ? "mtmperps"
                : scannerKey
  }
  // Endpoint dedicado /api/webhooks/tradingview-perps reencaminha para aqui com este
  // header → força o modo perps independentemente do nome do alerta (fonte = a lista).
  const forcedPerps = request.headers.get("x-mtm-perps") === "1"
  // Só força perps se o ticker for MESMO cripto. Um forex/índice/ouro que apareça no alerta
  // dos perps (ex.: USDCAD no Aurum Flow) segue a sua classe natural e nunca vai ao chat de
  // perps nem à Bybit (que só tem cripto). Evita sinais errados no canal + ordens inválidas.
  // strategy=aurum e strategy=mtmperps são fontes de perpétuos → ativam o modo perps (só cripto).
  // IMPORTANTE: a deteção por CONTEÚDO também conta (isAurumFlow/isMtmPerps) — os alertas do TradingView
  // trazem "Aurum Flow"/"MTM Perps" no nome/strategy mesmo sem o `?strategy=` no URL. Sem isto, o sinal
  // perp caía no gate de RUÍDO genérico (passesAlertGate) → chat suprimido e Bybit nunca corria.
  const perpsRequested =
    scannerKey === "mtmperps" || isMtmPerps || isAurumFlow || forcedPerps || forcedStrategy === "aurum" || forcedStrategy === "aurumflow"
  const isCryptoPerp = isCryptoPerpTicker(ticker)
  if (perpsRequested && isCryptoPerp) {
    // Lista única de perps → sempre canal "Ideias de Perpétuos Cripto", em PAPEL.
    // Execução real (Bybit, motor de cópia próprio) fica para a Fase 2, atrás de flag.
    assetClass = "crypto_perp"
    // Canal fundido «MTM Auto Aurum Flow & Perpétuos» (18/09). O slug antigo `cripto-perps` fica
    // escondido com o histórico (migração 118).
    route.channel = "aurum-flow"
    // Telegram dedicado "Ideias de Perpétuos Cripto" (env TELEGRAM_CHANNEL_PERPS). Enquanto o grupo
    // não existir/estiver por definir → resolvedPerpsChatId()=null → publica só no chat da app (seguro).
    route.telegram = resolvedPerpsChatId()
    // Marca a origem: Aurum Flow ORB vs a dinâmica MTM Perps (Sensei X) — mesmo chat, fontes distintas.
    route.sender = isAurumFlow ? "⚡ Aurum Flow ORB" : "🪙 Perpétuos Cripto"
    route.push = true
    route.autoCopy = false
  } else if (isAurumFlow && !isCryptoPerp) {
    // Aurum Flow num activo NÃO cripto (ex.: ouro): vai ao MESMO canal da estratégia (fundido com os
    // perpétuos), com a marca Aurum Flow. Antes caía na rota natural — o ouro ia parar ao Sensei
    // com a marca do Sensei. No iOS aparece (não é cripto); o cripto do mesmo canal sai mensagem a
    // mensagem. Não executa na conta Sensei (ver `aurumNaoCripto` no gate de execução).
    route.channel = "aurum-flow"
    route.telegram = resolvedPerpsChatId()
    route.sender = "⚡ Aurum Flow"
    route.push = true
    route.autoCopy = false
  } else if (perpsRequested && !isCryptoPerp) {
    // Sinal não-cripto no endpoint dos perps → segue a classificação natural do ticker
    // (USDCAD → forex, XAUUSD → gold_btc, etc.). Não sobrepõe route/assetClass.
    console.warn(`[webhook][perps] ticker não-cripto ignorado no modo perps: ${ticker}`)
  } else if (isGoldKiller) {
    route.channel = "sinais-goldkiller"
    // Canal Telegram dedicado GoldKiller (bot admin). Publica lá + chat app + auto-copy.
    // Resolver durável (sobrevive a Basic→Supergroup); env TELEGRAM_CHANNEL_GOLDKILLER se definido.
    route.telegram = resolvedGoldkillerScannerChatId()
    route.sender = "🥇 GoldKiller Scanner"
    route.autoCopy = true
  } else if (scannerKey === "mtmscanner" && assetClass === "gold_btc") {
    // MTM Scanner OURO/BTC → chat + canal Telegram dedicado NOVO ("Sinais Scanner MTM Ouro e BTC",
    // env TELEGRAM_CHANNEL_MTMSCANNER). NUNCA o Telegram Sensei. Se o id ainda não estiver em env,
    // resolvedMtmScannerChatId()=null → não relaya (seguro).
    // Os sinais do MTM Scanner em FOREX e ÍNDICES seguem as rotas naturais (resolveRoute):
    //   forex → "Ideias de Forex"; índices → "Ideias de Índices" (MTM Scanner É o provedor de índices).
    route.channel = "sinais-scanner-mtm"
    route.sender = "📊 MTM Scanner Ouro e BTC"
    // Guarda anti-conflito: o grupo que era do MTM Scanner foi reaproveitado p/ os Perpétuos. Se algum
    // env antigo ainda apontar o MTM Scanner para o MESMO id dos perps, NÃO publica (evita dupla-marca
    // no grupo dos perps). Sem grupo próprio → só chat da app.
    const mtmTg = resolvedMtmScannerChatId()
    route.telegram = mtmTg && mtmTg !== resolvedPerpsChatId() ? mtmTg : null
  }

  // Índices: o provedor é o MTM Scanner (o lucrativo, ~36% vs Sensei X ~5%). O Sensei X é fraco
  // em índices → NÃO publica em "Ideias de Índices" (mantém o canal limpo com o provedor certo).
  if (assetClass === "index" && scannerKey === "sensei") {
    route.channel = null
    route.telegram = null
    route.push = false
  }

  // MTM Scanner FOREX → publica na "Ideias de Forex" (rota natural) MAS marca a fonte como "MTM
  // Scanner" no sender (→ vai para o conteúdo) para o T2T reconhecer (t2tSourceKey lê "MTM Scanner").
  // NÃO executa em casa (gate canExecuteProvider exclui mtmscanner) → a trade abre/gere/fecha SÓ na
  // conta de quem aceitar via T2T, com entry-hit/exit pelo motor. Pedido Ricardo 2026-08-18.
  if (scannerKey === "mtmscanner" && assetClass === "forex") {
    route.sender = "📊 MTM Scanner · Forex"
    route.push = true
  }

  // Perpétuos cripto: o sistema SEGUE o timeframe do alerta (qualquer TF — 15m é 15m).
  // Sem trava de TF: o que o scanner disparar vai a chat/push/execução (decisão do Ricardo 2026-08-06).

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
          // GoldKiller é scalp 5m no XAU → SEM chamada LLM no caminho da entrada (zero lag).
          // O filtro dela é o gate LOCAL reforçado (passesQualityGate + stopsSane), rápido.
          forceFastPath: isSensei || isGoldKiller,
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

  // Forex (conta MTM Auto Forex): entrar a MERCADO (fill garantido) em vez de limit/pullback —
  // o trailing dinâmico da conta trata do resto. (Sensei gold/btc já é forçado a market no processor.)
  if (assetClass === "forex" && parsedForExec) parsedForExec.orderType = "market"

  let providerExecuted = false
  let providerDetail: string | undefined
  /** Porque é que a mestre não abriu este sinal — vai para `tradingview_signals.ai_error`. */
  let mestreMotivo: string | null = null
  const isIdeaAlert = activeSensei?.alertType === "idea" || activeSensei?.alertType === "signal"
  // Auto-copy CopyFactory: Ouro/BTC → conta Sensei; Forex → conta MTM Auto Forex (5IHE).
  // Master switch SENSEI_PROVIDER_EXEC_ENABLED + interruptor por-execução (runtime, DB).
  // RECEÇÃO por canal/scanner (admin): desligado → o sinal é IGNORADO à entrada.
  {
    const { isIntakeEnabled } = await import("@/lib/mtmcopy/intake-switches")
    const intakeKey =
      isGoldKiller ? "goldkiller"
      : scannerKey === "mtmscanner" ? "mtmscanner"
      : perpsRequested ? "perps"
      : scannerKey === "sensei" ? "sensei"
      : null
    if (intakeKey && !(await isIntakeEnabled(intakeKey as "sensei"))) {
      return NextResponse.json({ ok: true, skipped: "intake_off", channel: intakeKey })
    }
  }

  const execSwitches = await getExecSwitches()
  const execSwitchOn = isGoldKiller
    ? execSwitches.goldkiller
    : assetClass === "forex"
      ? execSwitches.forex
      // Sensei ENTRADAS: exige sensei (master) E sensei_entries. Pausar só as entradas =
      // sensei=true + sensei_entries=false → a GESTÃO das abertas (execSwitches.sensei) continua.
      : execSwitches.sensei && execSwitches.sensei_entries
  // Regras de sinal (ruído + execução), data-driven, afináveis sem redeploy.
  const signalRules = await getSignalRules()
  const execConfCount = confirmationsPassed(payload)
  const execSymbolForGate = parsedForExec.symbol ?? ticker
  const execDirForGate = parsedForExec.direction ?? v.direction ?? null
  // Sensei X (Ouro/BTC): scanner dedicado da conta Sensei — a entrada É a decisão do scanner
  // (não usa confirmações zonetouch/bandtouch, nem a BUY-bias genérica). Trata-se como o
  // GoldKiller (bypass do gate genérico + market na conta Sensei), afinado pelo score próprio
  // quando presente. Só se aplica ao fluxo gold_btc; o Sensei forex (alta frequência, conta
  // Trade-Ideas) mantém a whitelist/gate próprios.
  const isSenseiScored = (isSensei || scannerKey === "sensei") && assetClass === "gold_btc"
  const senseiScoreRaw =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).score
      : undefined
  const senseiScore =
    typeof senseiScoreRaw === "number"
      ? senseiScoreRaw
      : typeof senseiScoreRaw === "string" && senseiScoreRaw.trim() !== "" && !Number.isNaN(Number(senseiScoreRaw))
        ? Number(senseiScoreRaw)
        : null
  const SENSEI_MIN_SCORE = Number(process.env.SENSEI_MIN_SCORE || 8)
  // Só bloqueia se o score EXISTE e está abaixo do mínimo (score ausente = compat. c/ formatos antigos).
  const senseiScoreOk = !isSenseiScored || senseiScore == null || senseiScore >= SENSEI_MIN_SCORE
  const execGate =
    isGoldKiller || isSenseiScored
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
  // ── GATE DEDICADO DO SENSEI X (Ouro/BTC) ──────────────────────────────────────
  // O parser partilhado (mergeSenseiParsed) nem sempre classifica a ENTRADA do Sensei X
  // como `entry_trigger` → a cláusula genérica falhava e a trade nunca abria (confirmado:
  // entradas ENTRY chegam mas 0 execuções). Aqui lê-se o `state` CRU do payload: `state:"ENTRY"`
  // é inequivocamente uma entrada a mercado (os follow-ups trazem BE/SL/TP1..). Executa pelo
  // MESMO executor (processor força MARKET na conta Sensei) → sem caminho paralelo/dupla ordem.
  const senseiState = String(
    (payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).state
      : "") ?? "",
  ).toUpperCase()
  const isSenseiXEntry =
    isSenseiScored &&
    senseiState === "ENTRY" &&
    Boolean(parsedForExec.symbol) &&
    Boolean(parsedForExec.direction)

  // Aurum Flow fora do cripto não é um sinal do Sensei — não abre na conta/mestre do Sensei.
  const aurumNaoCripto = isAurumFlow && !isCryptoPerp
  const canExecuteProvider =
    !aurumNaoCripto &&
    // Master switch = interruptor por-ativo na BD (mtmcopy_exec_switches), afinável sem redeploy.
    // (Antes exigia também o env SENSEI_PROVIDER_EXEC_ENABLED, que mantinha tudo OFF por defeito.)
    execSwitchOn &&
    // MTM Scanner NÃO executa em conta nenhuma (pedido Ricardo): só PUBLICA + alimenta o T2T
    // (forex). Sem casa própria — a trade abre/gere/fecha na conta de quem aceitar via T2T.
    scannerKey !== "mtmscanner" &&
    (assetClass === "gold_btc" || assetClass === "forex") &&
    parsedForExec.symbol &&
    parsedForExec.direction &&
    passesQualityGate(payload, timeframe, assetClass, isGoldKiller, isSenseiScored) &&
    senseiScoreOk &&
    stopsSane(parsedForExec.entry ?? price, parsedForExec.sl) &&
    execGate.ok &&
    !pendingHadLimit &&
    ((!isIdeaAlert && (activeSensei?.alertType === "entry_trigger" || !activeSensei)) ||
      isLimitIdea ||
      isSenseiXEntry)

  // ── SHADOW #57/#59 (não executa, não posta) ──────────────────────────────────
  // Regista o que a nova política do Sensei FARIA — entrar-NO-SINAL (sem esperar gatilho) +
  // alvo ~100 pips + permitir SELLs — para validar com dados reais antes de ir a dinheiro real.
  // Ignora o execGate/score de propósito (é isso que queremos medir). Gated por
  // site_settings.sensei_shadow_config.enabled. Best-effort (nunca afeta o fluxo live).
  if (
    isSenseiScored &&
    initSignalKind === "entry" &&
    (parsedForExec.direction === "buy" || parsedForExec.direction === "sell")
  ) {
    const shadowEntry = parsedForExec.entry ?? price
    if (shadowEntry != null && shadowEntry > 0) {
      await recordSenseiShadow({
        ticker: String(parsedForExec.symbol ?? ticker),
        side: parsedForExec.direction,
        entry: shadowEntry,
        sl: parsedForExec.sl ?? null,
        timeframe,
      }).catch(() => {})
    }
  }

  /**
   * CANAL PUBLICADO PELA MESTRE (18/09, começa pelo «MTM Auto Sensei»): com a estratégia em
   * `sinal_modo='live'`, o chat e o Telegram deixam de receber o cartão do webhook, os seguimentos
   * do Pine e o espelho de fecho — passam a contar só o que a conta-mestre abre, gere e fecha.
   * Reversível pela base (sinal_modo), sem deploy.
   */
  const publicacaoMestre = route.channel
    ? (await estrategiasPublicadasPelaMestre()).find((e) => e.canal === route.channel) ?? null
    : null
  let mestrePositionId: string | null = null

  let savedIdea: { id: string; tradeNumber: number | null } | null = null
  // Ideia/trade a que esta entrada corresponde (para guardar o message_id da entrada).
  let entryTradeIdea: SenseiTradeIdea | null = pendingIdea
  if (isSenseiXEntry && activeSensei?.symbol) {
    // Sensei X ENTRY (gate dedicado): cria SEMPRE registo ATIVADO (chaveado pelo preço de
    // entrada) para os follow-ups (BE/SL/TP) se associarem e responderem em thread — mesmo
    // que o parser tenha classificado como "idea" (que de outra forma ficaria só pendente).
    entryTradeIdea = pendingIdea ?? (await createActivatedSenseiIdea(supabase, activeSensei, logId))
  } else if (isIdeaAlert && activeSensei) {
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
    const execTarget = isGoldKiller ? "goldkiller" : assetClass === "forex" ? "forex" : "sensei"
    // MESTRES NOSSAS (116): o sinal abre também/só na mestre SIM da estratégia. `sinal_modo` desligado
    // (por omissão) não faz nada; sombra só regista; live abre na SIM e SUBSTITUI a ordem na mestre MT5.
    let mestreSubstituiMt5 = false
    try {
      const sinalExec = parsedForExec as NonNullable<ReturnType<typeof parseSignal>>
      const tpsExec = (Array.isArray(sinalExec.tp) ? sinalExec.tp : []).filter((t): t is number => typeof t === "number" && t > 0)
      const m = await encaminharSinalParaMestre({
        fonte: execTarget, symbol: String(sinalExec.symbol), direcao: sinalExec.direction === "sell" ? "sell" : "buy",
        entrada: sinalExec.entry ?? price ?? null, sl: sinalExec.sl ?? null, tps: tpsExec, externalRef: String(logId ?? ""),
      })
      mestreSubstituiMt5 = m.substituiMt5
      // O motivo tem de sobreviver até à gravação do registo do sinal: `providerDetail` só saía na
      // resposta HTTP, e era por isso que uma entrada que não abriu não deixava rasto nenhum (24/09).
      mestreMotivo = m.motivo ?? null
      // «Não abri E o MT5 também não abre» é o caso que ficava em silêncio total: grava-se JÁ, sem
      // esperar pelo ramo da publicação pela mestre (que só existe para algumas estratégias).
      if (logId && m.substituiMt5 && m.motivo) {
        await supabase.from("tradingview_signals").update({ ai_error: `mestre: ${m.motivo}` }).eq("id", logId)
      }
      if (m.modo !== "desligado") providerDetail = `mestre SIM ${m.estrategia ?? ""}: ${m.modo}${m.motivo ? ` (${m.motivo})` : ""}`
      // A posição que a MESTRE abriu — é ela (e só ela) que o chat e o Telegram anunciam quando o
      // canal é publicado pela mestre (lib/mestres/servidor/publicar.ts).
      if (m.modo === "live" && publicacaoMestre) {
        const daMestre = (m.contas ?? []).find((c) => c.accountId === publicacaoMestre!.contaMestreId && c.estado === "aberta" && c.positionId)
        mestrePositionId = daMestre?.positionId ?? null
      }
    } catch (err) {
      console.error("[tradingview-webhook] mestre SIM:", err)
      mestreMotivo = `erro ao encaminhar para a mestre: ${err instanceof Error ? err.message : String(err)}`
    }
    try {
      const exec = mestreSubstituiMt5
        ? { executed: true, detail: `${providerDetail ?? "mestre SIM"} · mestre MT5 substituída` }
        : await processMtmcopyWebhookSignal({
            raw,
            signal: parsedForExec as NonNullable<ReturnType<typeof parseSignal>>,
            validation: v,
            externalRef: logId,
            target: execTarget,
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

  /**
   * MTM SCANNER → A SUA MESTRE, E SÓ AS ENTRADAS COM TODAS AS CONFIRMAÇÕES (24/09).
   *
   * Pedido do dono: «as entradas de mtm scanner devem ser passadas para a conta que criaste de 10k
   * mas apenas as que tiverem todas as confirmações».
   *
   * Porque é um bloco à parte e não uma linha a menos no `canExecuteProvider`: aquele portão comanda
   * DUAS coisas ao mesmo tempo — a mestre SIM e o `processMtmcopyWebhookSignal`, que abre ordens nas
   * contas MT5 dos clientes. Tirar de lá o `scannerKey !== "mtmscanner"` punha o scanner a executar
   * nas contas das pessoas, que não é o que foi pedido e que é exactamente a porta que o dono fechou
   * a 18/08. Por isso o portão fica intacto e o scanner ganha um desvio só para a mestre, pelo MESMO
   * `encaminharSinalParaMestre` que as outras seis estratégias usam — não há segundo executor.
   *
   * O filtro: `temTodasAsConfirmacoes` (lib/mtmcopy/scanner-confirmacoes) — o Pine v3.5 manda sempre
   * três confirmações e exigem-se as três A FAVOR do lado do sinal (numa venda, as três a `false`).
   * Nos 60 dias medidos isto tira ~95% do que o scanner grita: de ~304 alertas/dia para ~21/dia, e
   * ~9,5/dia depois da whitelist de execução e de não repetir o mesmo par/direcção em 4 h.
   *
   * Continua a passar pelas regras de sempre (qualidade, stops sãos, whitelist/exclusões do
   * `passesExecGate`) — ao gate de execução entra a contagem A FAVOR, porque é essa a leitura que
   * este caminho usa; para as compras dá o mesmo número de sempre.
   *
   * NASCE MUDO: `mestres_estrategias.sinal_modo` está em `desligado` e `mtmauto_providers.ativo` em
   * `false` — `encaminharSinalParaMestre` devolve `desligado` e não escreve nada. Ligar é decisão do
   * dono, no admin, e vê-se primeiro em sombra.
   *
   * A DECISÃO VIVE EM lib/mtmcopy/scanner-para-mestre (pura, com testes). Ficou lá depois do defeito
   * do próprio dia 24/09: escrita aqui à mão, a lista trazia `!isIdeaAlert && !activeSensei` copiados
   * do `canExecuteProvider` — e nos alertas do scanner essas duas são SEMPRE falsas (o parser do
   * Sensei monta um alerta a partir de ticker+action e infere `idea`). O desvio nunca correu uma
   * única vez. A pergunta certa é `initSignalKind === "entry"`, a mesma que fica em `signal_kind`.
   */
  const confirmacoesScanner =
    scannerKey === "mtmscanner" ? temTodasAsConfirmacoes(payload, execDirForGate) : null
  const gateScanner =
    scannerKey === "mtmscanner"
      ? passesExecGate(
          signalRules,
          execSymbolForGate,
          execDirForGate,
          confirmacoesScanner?.leitura?.aFavor ?? null,
          scannerKey,
          assetClass,
        )
      : { ok: false as const, reason: "não é o MTM Scanner" }
  const decisaoScanner = decidirScannerParaMestre({
    scanner: scannerKey,
    tipoSinal: initSignalKind === "entry" ? "entry" : "followup",
    classe: assetClass,
    simbolo: parsedForExec.symbol ?? null,
    direcao: parsedForExec.direction ?? null,
    confirmacoes: confirmacoesScanner,
    stopsSaos: stopsSane(parsedForExec.entry ?? price, parsedForExec.sl),
    gateExec: gateScanner,
    podeExecutarProvider: Boolean(canExecuteProvider),
  })
  /** Deixa dito, na linha do sinal, porque é que a mestre do scanner não o abriu. */
  const registarMotivoScanner = async (motivo: string) => {
    if (!logId) return
    await supabase
      .from("tradingview_signals")
      .update({ ai_error: `mestre scanner: ${motivo}`.slice(0, 300) })
      .eq("id", logId)
      .then(undefined, (e) => console.error("[tradingview-webhook] motivo mestre scanner:", e))
  }
  if (decisaoScanner.vai) {
    try {
      const tpsScanner = (Array.isArray(parsedForExec.tp) ? parsedForExec.tp : []).filter(
        (t): t is number => typeof t === "number" && t > 0,
      )
      const m = await encaminharSinalParaMestre({
        fonte: "mtmscanner",
        symbol: String(parsedForExec.symbol),
        direcao: parsedForExec.direction === "sell" ? "sell" : "buy",
        entrada: parsedForExec.entry ?? price ?? null,
        sl: parsedForExec.sl ?? null,
        tps: tpsScanner,
        externalRef: String(logId ?? ""),
      })
      if (m.modo !== "desligado") {
        providerDetail = `mestre SIM ${m.estrategia ?? "mtm-scanner"}: ${m.modo}${m.motivo ? ` (${m.motivo})` : ""}`
      }
      // O motivo de não ter aberto (estratégia desligada, kill-switch, a mestre recusou) tem de
      // sobreviver à resposta HTTP: é isto que responde «porque é que este sinal não abriu?».
      mestreMotivo = m.motivo ?? mestreMotivo
      if (m.motivo) await registarMotivoScanner(m.motivo)
    } catch (err) {
      // Nunca pode partir o webhook: o scanner PUBLICA, e a publicação é o principal aqui. Mas
      // engolir o erro sem rasto foi metade do problema de 24/09 — fica escrito.
      console.error("[tradingview-webhook] mestre MTM Scanner:", err)
      const motivo = `erro ao encaminhar: ${err instanceof Error ? err.message : String(err)}`
      mestreMotivo = motivo
      await registarMotivoScanner(motivo)
    }
  } else if (decisaoScanner.candidato && decisaoScanner.motivo) {
    // Passou o filtro das confirmações e mesmo assim não foi: é uma pergunta que alguém vai fazer.
    // (Os ~95% que o filtro corta não escrevem nada — isto são ~21 linhas/dia, não 300.)
    await registarMotivoScanner(decisaoScanner.motivo)
  }

  // Follow-up (TP/BE/SL/Saída): liga à entrada correspondente para responder em thread
  const alertType = activeSensei?.alertType
  const isFollowup =
    alertType === "tp_hit" || alertType === "sl_hit" || alertType === "breakeven" || alertType === "exit"
  // Gate dos SINAIS de perps: trend-guard macro (BTC 4h + Cripto30) + scorecard por moeda.
  // Backtest (5d, 346 sinais): SELL +58.9R vs BUY −32.3R; o trend-guard triplica o R/trade
  // e sobe o winrate para ~52%. Aplica-se ao que PUBLICA no chat E ao que executa na Bybit.
  let perpsGate: { allow: boolean; reason: string } = { allow: true, reason: "" }
  if (perpsRequested && !isFollowup && execSymbolForGate && (execDirForGate === "buy" || execDirForGate === "sell")) {
    perpsGate = await evaluatePerpsSignalGate(execSymbolForGate, execDirForGate, { entry: entry ?? price, sl, timeframe })
    if (!perpsGate.allow && logId) {
      await supabase
        .from("tradingview_signals")
        .update({ trade_status: "filtered", ai_error: `perps-gate: ${perpsGate.reason}`.slice(0, 300) })
        .eq("id", logId)
    }
  }
  // Gate de RUÍDO: entradas de baixa qualidade (poucas confirmações / símbolo-ruído) não
  // vão para chat/Telegram/push. Follow-ups (TP/BE/SL) e GoldKiller passam sempre.
  // PERPS (pedido Ricardo 2026-09-04): o perps-gate é de EXECUÇÃO, não de entrega — as
  // IDEIAS publicam sempre no chat da app, no Telegram (Ideias de Perpétuos Cripto) e nas
  // fontes T2T; o bloqueio de execução fica registado acima em trade_status='filtered'.
  // Antes, o gate suprimia a entrega toda e o Aurum Flow nunca chegava ao chat.
  /**
   * O break-even que vem LOGO A SEGUIR a um alvo não se publica.
   *
   * A mensagem do alvo já diz «o resto corre com o stop protegido». Uma segunda a dizer «stop
   * movido para a entrada» é a mesma informação outra vez — no Sensei saíram as duas ao mesmo
   * minuto, com a ideia #18384, e o canal ficou a repetir-se (decisão do Ricardo, 09/09).
   *
   * Um break-even SEM alvo nenhum atrás continua a ser publicado: aí é notícia, porque o cliente
   * não tinha como saber que o risco tinha desaparecido.
   *
   * A execução e o movimento do stop não passam por aqui — isto só decide o que se ESCREVE.
   */
  const ehBreakeven = (activeSensei?.alertType ?? initAlertType) === "breakeven"
  let breakevenRedundante = false
  if (ehBreakeven && activeSensei?.symbol) {
    const { data: linha } = await supabase
      .from("mtmcopy_signal_tracking")
      .select("exits_done")
      .eq("symbol", activeSensei.symbol)
      .in("status", ["active", "closed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    breakevenRedundante = Number(linha?.exits_done ?? 0) >= 1
  }

  const alertOk =
    !breakevenRedundante &&
    (isFollowup ||
      isGoldKiller ||
      perpsRequested ||
      passesAlertGate(signalRules, execSymbolForGate, execConfCount, scannerKey, assetClass))
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
    ? { entry: linkedIdea.entry, tp: linkedIdea.tp, tradeNumber: linkedIdea.tradeNumber, slOriginal: linkedIdea.sl }
    : entryTradeIdea
      ? { entry: activeSensei?.entry ?? entryTradeIdea.entry, tp: activeSensei?.tp ?? entryTradeIdea.tp, tradeNumber: entryTradeIdea.tradeNumber, slOriginal: entryTradeIdea.sl }
      : savedIdea
        ? { entry: activeSensei?.entry ?? null, tp: activeSensei?.tp ?? [], tradeNumber: savedIdea.tradeNumber }
        : null

  // Gestão automática Sensei (gated): TP/BE/SL → parciais + BE + trailing ou fecho na conta Sensei
  if (
    execSwitches.sensei &&
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

  // T2T: espelha o FECHO da fonte nas ordens dos seguidores desse sinal. Só no 'exit' (fecho
  // discricionário) — o SL do próprio seguidor trata o sl_hit; tp_hit é parcial. QUALQUER fonte T2T
  // (Sensei/GoldKiller/MTM Scanner forex/…), mesmo sem Sensei-idea (forex). Gated pelo kill-switch
  // t2t_auto_close (dentro do helper).
  const t2tCloseSymbol = activeSensei?.symbol ?? v.symbol ?? parsedForExec.symbol ?? null
  const t2tCloseDir = (activeSensei?.direction ?? linkedIdea?.direction ?? v.direction ?? null) as "buy" | "sell" | null
  const isExitFollowup = isFollowup && (activeSensei?.alertType === "exit" || initAlertType === "exit")
  // SL da fonte: as posições já abertas fecham pelo SL do próprio seguidor, mas as ordens
  // PENDENTES que nunca encheram ficavam órfãs — a ideia morreu e a ordem continuava no mercado.
  // Esse caso é um DESCARTE, não um fecho.
  const isSlFollowup = isFollowup && (activeSensei?.alertType === "sl_hit" || initAlertType === "sl_hit")
  /**
   * Um `sl_hit` depois do break-even NÃO é um descarte.
   *
   * «Descartado» é o que se diz de uma ideia que morreu antes de valer alguma coisa. A #18384
   * do Sensei foi activada, bateu o alvo 1 a +148 pips e fechou protegida — e mesmo assim o
   * cartão de entrada ficou marcado «Descartado», porque qualquer `sl_hit` entrava aqui como
   * descarte. Quem lê o histórico via uma trade ganha rotulada como ideia falhada.
   *
   * Com o stop protegido, isto é um FECHO normal.
   */
  const slProtegido =
    isSlFollowup &&
    stopFoiProtegido({
      direction: t2tCloseDir,
      entry: msgCtx?.entry ?? null,
      slOriginal: msgCtx?.slOriginal ?? null,
      price: v.sl ?? activeSensei?.sl ?? null,
    })
  if ((isExitFollowup || isSlFollowup) && t2tCloseSymbol && route.channel && !publicacaoMestre) {
    try {
      const { closeT2TFollowersForSignal } = await import("@/lib/mtmcopy/t2t-lifecycle")
      await closeT2TFollowersForSignal({
        kind: isSlFollowup && !slProtegido ? "discard" : "close",
        // No SL só se apagam as pendentes: a posição aberta do seguidor fecha pelo SL dela.
        pendingOnly: isSlFollowup,
        chatSlug: route.channel,
        symbol: t2tCloseSymbol,
        direction: t2tCloseDir,
        label: isGoldKiller ? "GoldKiller" : scannerKey === "mtmscanner" ? "MTM Scanner" : "Sensei",
      })
    } catch (err) {
      console.error("[tradingview-webhook] t2t close mirror error:", err)
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
  if (publicacaoMestre) {
    // Só a ENTRADA que a mestre abriu, no formato único, no chat E no Telegram (o publicador
    // trata dos dois). Ideias por activar e seguimentos do Pine não saem — os seguimentos vêm das
    // posições da mestre, pelo cron /api/cron/mestre-publicar.
    if (mestrePositionId) {
      try {
        chatId = await publicarEntradaDaMestre(publicacaoMestre, mestrePositionId, { forcar: true })
      } catch (err) {
        console.error("[tradingview-webhook] publicar entrada da mestre:", err)
      }
    }
    if (logId) {
      await supabase
        .from("tradingview_signals")
        .update(chatId
          ? { chat_status: "sent", chat_message_id: chatId, telegram_status: "sent" }
          : {
              chat_status: "mestre",
              telegram_status: "mestre",
              // O MOTIVO, não a frase genérica: «a mestre não abriu este sinal» não dizia porquê, e
              // 3 das 14 entradas do Sensei em 7 dias ficaram assim, sem linha em `mestres_sinais`
              // nem em `funded_sinal_posicoes` (auditoria de 24/09).
              ai_error: `canal publicado pela mestre: ${mestreMotivo ?? "a mestre não abriu este sinal (sem motivo registado)"}`,
            })
        .eq("id", logId)
    }
  } else if (!alertOk) {
    if (logId) await supabase.from("tradingview_signals").update({ chat_status: "suppressed", telegram_status: "suppressed" }).eq("id", logId)
  } else {
    try {
      // Threading no chat da app: os follow-ups (TP/BE/SL/exit) respondem à mensagem da ENTRADA
      // (linkedIdea.chatMessageId) — senão aparecem todos ao mesmo nível, como acontecia no Premium.
      const parentChatId = isFollowup ? linkedIdea?.chatMessageId ?? null : null
      const { data: msg, error } = await supabase
        .from("chat_messages")
        .insert({
          channel_slug: route.channel,
          message_type: "telegram_forward",
          content: post,
          telegram_sender: route.sender,
          user_id: null,
          ...(parentChatId ? { reply_to_id: parentChatId } : {}),
        })
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
  // Perpétuos cripto: push/execução em 30m e 1H; outros TF ficam bloqueados (overtrading/ruído).
  // Segue o timeframe do alerta: sem bloqueio por TF nos perps (15m/5m/1H — o que o alarme mandar).
  const cryptoPerpBlocked = false
  if (alertOk && initSignalKind === "entry" && !cryptoPerpBlocked && (!publicacaoMestre || chatId)) {
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
    const T2T_NOTIF_CHANNELS = new Set(["trade-ideas-setup", "sinais-scanner-mtm", "trade-ideas", "sinais-goldkiller", "sensei-scanner"])
    const isT2TNotif = Boolean(route.channel && chatId && T2T_NOTIF_CHANNELS.has(route.channel))
    const pushUrl = isT2TNotif
      ? urlDoTapToTrade(chatId as string)
      : route.channel
        ? urlDoChat(route.channel, chatId)
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
        channel: route.channel,
        // Pago = o canal é pago (o mesmo do chat); sem canal, o scanner Premium (Sensei/GoldKiller).
        pago: route.channel ? canalDeSinaisPago(route.channel) : isGoldKiller || scannerKey === "sensei" || scannerKey === "goldkiller",
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
    // Lado robusto: v.direction OU o campo `action` do payload (evita colocar BUY num SELL se v.direction vier null).
    const dirResolved =
      v.direction ??
      (action && /sell|short|venda/i.test(action) ? "sell" : action && /buy|long|compra/i.test(action) ? "buy" : null)
    const bybitSide = dirResolved === "sell" ? "sell" : "buy"
    const bybitEntry = v.entry ?? entry ?? price ?? null
    const bybitSl = v.sl ?? sl ?? null
    const bybitTps = [tp, tp2, tp3].filter((n): n is number => n != null && n > 0)
    const normSym = String(v.symbol ?? ticker).toUpperCase().replace(/^[A-Z]+:/, "").replace(/\.P$/, "")
    // Shadow do Aurum BTC REMOVIDO (decisão Ricardo 2026-08): o BTC do Aurum Flow passa a EXECUTAR
    // na Bybit como o restante cripto (antes ficava em shadow pelo backtest PF<1).
    const aurumBtcShadow = false

    /**
     * E A CONTA MESTRE, em paralelo com a Bybit.
     *
     * A execução que conta é a da Bybit — é lá que o perpétuo existe. Mas os mesmos pares
     * existem como CFD em MT5 (BTCUSD, ETHUSD…), e abrir lá dá à estratégia um histórico
     * MetaApi próprio, que é o que a torna copiável pela CopyFactory: sem posições na conta
     * mestre não há nada para os subscritores replicarem.
     *
     * Só onde a corretora cota o par — dos cinco da lista, uma conta de CFD costuma ter dois.
     * Os que faltam são saltados em silêncio: é uma condição normal, não um erro.
     */
    if (isAurumFlow && normSym && initSignalKind === "entry") {
      try {
        const { abrirNaContaMestreAurum } = await import("@/lib/mtmcopy/aurum-conta-mestre")
        const rm = await abrirNaContaMestreAurum({
          ticker: normSym,
          direcao: execDirForGate === "sell" ? "sell" : "buy",
          entrada: entry ?? price ?? null,
          sl: sl ?? null,
          tp: tp ?? null,
        })
        if (logId) {
          await supabase
            .from("tradingview_signals")
            .update({
              bybit_exec_detail: rm.ok
                ? `mestre: ${rm.simbolo} ${rm.volume}`
                : `mestre: ${String(rm.motivo).slice(0, 90)}`,
            })
            .eq("id", logId)
        }
      } catch (e) {
        console.warn("[webhook][aurum] conta mestre falhou:", e instanceof Error ? e.message : e)
      }
    }

    if (cronSecret && normSym && bybitEntry != null && !aurumBtcShadow) {
      // Lista de símbolos que o Copy Trading da Bybit não suporta (auto-preenchida) → salta sem tentar.
      const { data: usRow } = await supabase.from("site_settings").select("value").eq("key", "bybit_copy_unsupported").maybeSingle()
      const unsupported: string[] = Array.isArray((usRow?.value as { symbols?: unknown })?.symbols)
        ? ((usRow!.value as { symbols: string[] }).symbols)
        : []
      if (unsupported.includes(normSym)) {
        if (logId) await supabase.from("tradingview_signals").update({ bybit_exec_detail: `skip: ${normSym} não suportado no Copy` }).eq("id", logId)
      } else {
      try {
        const res = await fetch(`${url.origin}/api/bybit/place`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cronSecret}` },
          body: JSON.stringify({
            symbol: v.symbol ?? ticker,
            side: bybitSide,
            entry: bybitEntry,
            sl: bybitSl,
            tps: bybitTps,
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
        // Copy Trading não suporta o símbolo → memoriza p/ saltar de futuro (sem repetir o erro).
        if (!j.ok && !j.skipped && /not\s*support|does not currently support/i.test(String(j.retMsg ?? j.error ?? ""))) {
          const next = Array.from(new Set([...unsupported, normSym]))
          await supabase.from("site_settings").upsert(
            { key: "bybit_copy_unsupported", value: { symbols: next }, updated_at: new Date().toISOString() },
            { onConflict: "key" },
          ).then(undefined, () => {})
        }
        if (logId) {
          await supabase.from("tradingview_signals").update({
            bybit_order_id: j.ok ? j.orderId ?? null : null,
            bybit_exec_detail: detail.slice(0, 300),
          }).eq("id", logId)
        }
        console.log(`[webhook][bybit] ${normSym} ${bybitSide} → ${detail}`)
      } catch (e) {
        console.error("[webhook][bybit] place error:", e)
        if (logId) await supabase.from("tradingview_signals").update({ bybit_exec_detail: `erro: ${String(e).slice(0, 200)}` }).eq("id", logId)
      }
      }
    }
  }

  // Relay Telegram → grupo correspondente à classe (Ouro/BTC: -1003853860780, Forex: -1003716578747)
  const relayChatId = route.telegram
  // Canal publicado pela mestre: o Telegram já recebeu o MESMO texto do publicador.
  const relayOn = Boolean(alertOk && relayChatId && AIBOT_TOKEN && !RELAY_DISABLED && !publicacaoMestre)
  let tgOk = false
  let telegramMid: number | null = null
  if (relayOn && relayChatId) {
    try {
      const mid = await sendTelegram(AIBOT_TOKEN, relayChatId, post, replyToTelegramId)
      telegramMid = mid
      tgOk = true
      /**
       * Guardar o id do Telegram JUNTO da mensagem do chat.
       *
       * Ele já era gravado, mas só em `tradingview_signals` — e o insert no chat acontece antes
       * do envio, por isso `chat_messages.telegram_message_id` ficava sempre a null (5 em 349 no
       * Sensei). Sem ele, corrigir uma mensagem no site deixa a cópia do Telegram a dizer o
       * contrário e não há como a editar: um bot não consegue procurar uma mensagem antiga.
       */
      if (chatId && mid) {
        await supabase
          .from('chat_messages')
          .update({ telegram_message_id: mid })
          .eq('id', chatId)
          .then(() => {}, () => {})
      }
      if (logId) await supabase.from("tradingview_signals").update({ telegram_status: "sent", telegram_chat_id: relayChatId, telegram_message_id: mid, relayed_at: new Date().toISOString() }).eq("id", logId)
    } catch (err) {
      if (logId) await supabase.from("tradingview_signals").update({ telegram_status: "error", telegram_chat_id: relayChatId, telegram_error: String(err) }).eq("id", logId)
    }
  } else if (logId) {
    /**
     * O motivo real, e por esta ordem.
     *
     * Faltava o caso mais comum: o sinal ter sido cortado pelo gate de ruído. Como `alertOk`
     * entra no `relayOn` mas não estava na cadeia de motivos, esses sinais ficavam gravados como
     * "relay desligado" — e quem fosse depurar ia procurar um interruptor que estava bem.
     * Aconteceu 51 vezes só no Aurum Flow.
     */
    const reason = !alertOk
      ? "cortado pelo filtro de ruído (ver ai_error)"
      : !relayChatId
        ? "sem grupo Telegram para esta classe"
        : !AIBOT_TOKEN
          ? "TELEGRAM_AIBOT_TOKEN em falta"
          : "relay desligado"
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
        // Notifica seguidores + quem aceitou no T2T: break-even (proteger), SL ou um TP.
        // Canal publicado pela mestre: o desfecho é o da mestre, não o do Pine — não se avisa daqui.
        if (!publicacaoMestre && (tradeStatus === "loss" || tradeStatus === "be" || tradeStatus.startsWith("exit_"))) {
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
