import { NextRequest, NextResponse } from "next/server"
import { computeOutcome, unitFor } from "@/lib/mtmcopy/trade-outcome"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase"
import { TERMINAL_ASSETS } from "@/lib/mtm-terminal-assets"
import { userIdDoPedido } from "@/lib/sessao-do-pedido"
import { alertaDeSinalPago, ocultarConteudoDoAlerta } from "@/lib/direito-sinais"
import { classifyAssetClass, type AlertAssetClass as MtmAlertAssetClass } from "@/lib/mtm-alerts/asset-class"
import { temDireitoSinaisPagosUtilizador } from "@/lib/direito-sinais-servidor"

/**
 * Alertas MTM — lê os sinais gerados pelo webhook TradingView existente
 * (tabela `tradingview_signals`) e normaliza todos os dados dos plots:
 * entrada, stop loss, múltiplos take-profits, gestão da trade e imagem do gráfico.
 * Não altera o webhook nem cria variáveis novas.
 */

export interface AlertConfirmation {
  name: string
  passed: boolean
}

export interface MtmAlert {
  id: string
  ticker: string | null
  tvSymbol: string | null
  exchange: string | null
  timeframe: string | null
  action: string | null
  direction: "buy" | "sell" | "neutral"
  entry: number | null
  stopLoss: number | null
  takeProfits: number[]
  alertName: string | null
  strategy: string | null
  session: string | null
  confirmations: AlertConfirmation[]
  message: string | null
  aiAnalysis: string | null
  chartImageUrl: string | null
  createdAt: string
  status: string | null
  tradeStatus: string | null
  assetClass: "gold_btc" | "forex" | "index" | "crypto_perp" | "other"
  slDistance: number | null
  slPercent: number | null
  slPips: number | null
  slUnit: "pips" | "pts"
  crypto: { margin: number; leverage: number; notionalUsd: number; quantity: number | null } | null
  /** Desfecho do sinal terminado: pips/pontos ASSINADOS feitos e % de flutuação (null enquanto vivo). */
  outcomePips: number | null
  outcomePct: number | null
  outcomeUnit: "pips" | "pontos"
  /** Sinal pago visto por quem não tem direito: a linha fica, o conteúdo não (ver lib/direito-sinais). */
  bloqueado?: boolean
  motivoBloqueio?: "premium"
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function resolveDirection(action: string | null): "buy" | "sell" | "neutral" {
  if (!action) return "neutral"
  const a = action.toLowerCase()
  if (/(buy|long|compra|bull|up)/.test(a)) return "buy"
  if (/(sell|short|venda|bear|down)/.test(a)) return "sell"
  return "neutral"
}

type AlertAssetClass = MtmAlertAssetClass

/** Distância de SL em pips (forex) ou pontos + %. */
function slInfo(ticker: string | null, entry: number | null, sl: number | null, cls: AlertAssetClass) {
  if (entry == null || sl == null || entry <= 0) {
    return { slDistance: null, slPercent: null, slPips: null, slUnit: "pts" as const }
  }
  const dist = Math.abs(entry - sl)
  const pct = (dist / entry) * 100
  if (cls === "forex") {
    const jpy = /JPY/.test((ticker || "").toUpperCase())
    const pip = jpy ? 0.01 : 0.0001
    return { slDistance: dist, slPercent: pct, slPips: Math.round((dist / pip) * 10) / 10, slUnit: "pips" as const }
  }
  return { slDistance: dist, slPercent: pct, slPips: Math.round(dist * 100) / 100, slUnit: "pts" as const }
}

/**
 * DESFECHO de um sinal terminado — pips/pontos ASSINADOS e % de flutuação, deterministas a
 * partir do próprio sinal: exit_N → preço do TP N · loss → SL · be → 0 · closed → último TP
 * conhecido. Presente em todo o sistema (app, /alertas-mtm, scanner-access, métricas).
 */
/**
 * Desfecho de um alerta fechado, em pips e percentagem.
 *
 * O cálculo vive em lib/mtmcopy/trade-outcome.ts — a mesma fonte que o chat, o Telegram, as
 * notificações e o T2T usam. A versão que estava aqui tinha a sua própria tabela de pips
 * (só forex, com JPY) e o ouro caía em "pontos": o mesmo fecho aparecia com números
 * diferentes conforme a superfície onde o cliente o lia.
 */
function outcomeInfo(
  ticker: string | null,
  direction: "buy" | "sell" | "neutral",
  entry: number | null,
  sl: number | null,
  tps: number[],
  tradeStatus: string | null,
): { outcomePips: number | null; outcomePct: number | null; outcomeUnit: "pips" | "pontos" } {
  const unidade = unitFor(ticker)
  const none = { outcomePips: null, outcomePct: null, outcomeUnit: unidade }
  if (!tradeStatus || entry == null || entry <= 0 || direction === "neutral") return none

  let exit: number | null = null
  const m = tradeStatus.match(/^exit_(\d)$/)
  if (m) exit = tps[Number(m[1]) - 1] ?? tps[tps.length - 1] ?? null
  else if (tradeStatus === "loss") exit = sl
  else if (tradeStatus === "be") exit = entry
  else if (tradeStatus === "closed") exit = tps[tps.length - 1] ?? null
  if (exit == null || exit <= 0) return none

  const o = computeOutcome({ symbol: ticker, direction, entry, exit })
  if (!o) return none
  return { outcomePips: o.pips, outcomePct: o.pct, outcomeUnit: o.unit }
}

/** Cripto perp: alavancagem sugerida + tamanho de posição para margem $10 (SL ≈ 50% da margem). */
function cryptoSizing(entry: number | null, slPercent: number | null) {
  const margin = 10
  let leverage = slPercent && slPercent > 0 ? Math.round(50 / slPercent) : 10
  leverage = Math.max(1, Math.min(25, leverage))
  const notionalUsd = margin * leverage
  const quantity = entry && entry > 0 ? notionalUsd / entry : null
  return { margin, leverage, notionalUsd, quantity }
}

/** Extrai múltiplos take-profits do payload bruto (tp, tp1..tp5, targets[]). */
function extractTakeProfits(tp: number | null, raw: Record<string, unknown>): number[] {
  const out: number[] = []
  const push = (v: unknown) => {
    const n = num(v)
    if (n != null && !out.includes(n)) out.push(n)
  }
  for (const k of [
    "tp1", "tp2", "tp3", "tp4", "tp5",
    "exit1", "exit2", "exit3", "exit_1", "exit_2", "exit_3",
    "take_profit", "takeprofit", "target", "target1", "target2", "target3",
  ]) {
    push(raw[k] ?? raw[k.toUpperCase()])
  }
  if (Array.isArray(raw.targets)) raw.targets.forEach(push)
  if (Array.isArray(raw.tps)) (raw.tps as unknown[]).forEach(push)
  if (Array.isArray(raw.exits)) (raw.exits as unknown[]).forEach(push)
  if (out.length === 0 && tp != null) out.push(tp)
  return out
}

/** Stop loss — aceita sl/stop/invalidation. */
function extractStopLoss(sl: number | null, raw: Record<string, unknown>): number | null {
  if (sl != null) return sl
  for (const k of ["invalidation", "stop", "stop_loss", "stoploss", "sl"]) {
    const n = num(raw[k] ?? raw[k.toUpperCase()])
    if (n != null) return n
  }
  return null
}

function pickStr(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k] ?? raw[k.toUpperCase()]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

/** Confirmações do indicador (ex.: Zonetouch/Bandtouch/TrendTracker) a partir do payload. */
function extractConfirmations(raw: Record<string, unknown>): AlertConfirmation[] {
  const out: AlertConfirmation[] = []
  const toBool = (v: unknown): boolean => {
    if (typeof v === "boolean") return v
    if (typeof v === "number") return v > 0
    if (typeof v === "string") return /^(true|1|yes|sim|ok|pass|passed|✅)$/i.test(v.trim())
    return false
  }
  const src = (raw.confirmations && typeof raw.confirmations === "object" && !Array.isArray(raw.confirmations))
    ? (raw.confirmations as Record<string, unknown>)
    : null
  if (src) {
    for (const [k, v] of Object.entries(src)) out.push({ name: k, passed: toBool(v) })
    return out
  }
  if (Array.isArray(raw.confirmations)) {
    for (const c of raw.confirmations as unknown[]) {
      if (c && typeof c === "object") {
        const o = c as Record<string, unknown>
        const name = (o.name ?? o.label ?? o.title) as string | undefined
        if (name) out.push({ name: String(name), passed: toBool(o.passed ?? o.value ?? o.status) })
      }
    }
    return out
  }
  // Chaves soltas conhecidas
  for (const k of ["zonetouch", "bandtouch", "trendtracker", "trend_tracker"]) {
    if (k in raw || k.toUpperCase() in raw) {
      out.push({ name: k, passed: toBool(raw[k] ?? raw[k.toUpperCase()]) })
    }
  }
  return out
}

/** Constrói símbolo TradingView a partir de exchange + ticker. */
// Índices/commodities de corretora → símbolo TradingView resolúvel.
const TV_INDEX_MAP: Record<string, string> = {
  US30: "DJ:DJI", DJ30: "DJ:DJI", WALL: "DJ:DJI",
  NAS100: "NASDAQ:NDX", US100: "NASDAQ:NDX", USTEC: "NASDAQ:NDX",
  SPX500: "SP:SPX", US500: "SP:SPX", SPX: "SP:SPX",
  GER40: "XETR:DAX", DE40: "XETR:DAX", GER30: "XETR:DAX", DAX: "XETR:DAX",
  UK100: "TVC:UKX", UKX: "TVC:UKX",
  FRA40: "EURONEXT:PX1", EU50: "TVC:SX5E", STOXX50: "TVC:SX5E",
  JP225: "TVC:NI225", JPN225: "TVC:NI225", NIKKEI: "TVC:NI225",
  AUS200: "ASX:XJO", HK50: "TVC:HSI",
  USOIL: "TVC:USOIL", WTI: "TVC:USOIL", UKOIL: "TVC:UKOIL", BRENT: "TVC:UKBRENT",
  XAUUSD: "OANDA:XAUUSD", GOLD: "OANDA:XAUUSD", XAGUSD: "OANDA:XAGUSD", SILVER: "OANDA:XAGUSD",
}

function buildTvSymbol(ticker: string | null, exchange: string | null): string | null {
  if (!ticker) return null
  const t = ticker.toUpperCase().replace(/[^A-Z0-9:._]/g, "")
  if (t.includes(":")) return t
  // 1) Catálogo do terminal (já tem os tvSymbol corretos, ex.: OANDA:XAUUSD, DJ:DJI)
  const asset = TERMINAL_ASSETS.find((a) => a.symbol.toUpperCase() === t)
  if (asset?.tvSymbol) return asset.tvSymbol
  // 2) Mapa de índices/commodities de corretora
  if (TV_INDEX_MAP[t]) return TV_INDEX_MAP[t]
  // 3) Cripto perpétuos/spot Binance (ex.: BTCUSDT.P, SOLUSDT.P, ONDOUSDT) → BINANCE:
  //    (só quotes de cripto ou sufixo .P — NÃO "USD" puro, que é forex/metais)
  if (/(USDT|USDC|BUSD)(\.P)?$/.test(t) || /\.P$/.test(t)) return `BINANCE:${t}`
  // 4) exchange explícita do alerta
  if (exchange) return `${exchange.toUpperCase()}:${t}`
  // 5) Forex de 6 letras sem exchange → OANDA (resolve bem no TradingView)
  if (/^[A-Z]{6}$/.test(t)) return `OANDA:${t}`
  return t
}

/** Procura URL/ID de imagem de gráfico no payload ou na mensagem. */
function extractChartImage(raw: Record<string, unknown>, message: string | null): string | null {
  for (const k of ["chart_url", "chartUrl", "chart", "image", "image_url", "imageUrl", "snapshot", "screenshot"]) {
    const v = raw[k]
    if (typeof v === "string" && /^https?:\/\//.test(v)) return v
  }
  // ID de snapshot TradingView (tradingview.com/x/ID) no payload ou mensagem
  const hay = `${JSON.stringify(raw)} ${message ?? ""}`
  const m = hay.match(/tradingview\.com\/x\/([A-Za-z0-9]+)/i)
  if (m) {
    const id = m[1]
    return `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`
  }
  return null
}

export async function GET(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get("limit")) || 30, 100)
  const symbolFilter = (searchParams.get("symbol") || "").toUpperCase().trim()
  const idFilter = (searchParams.get("id") || "").trim()

  try {
    const admin = getSupabaseAdmin()
    const SELECT =
      "id, ticker, exchange, timeframe, action, price, sl, tp, alert_name, message, ai_management, raw_payload, chat_status, chart_image_url, trade_status, signal_kind, received_at"
    let data: unknown[] | null = null
    let error: { message: string } | null = null

    if (idFilter) {
      // Sinal específico (deep-link da notificação) — para abrir o modal do alerta.
      const res = await admin.from("tradingview_signals").select(SELECT).eq("id", idFilter).limit(1)
      data = res.data
      error = res.error
    } else if (symbolFilter) {
      // Pesquisa por símbolo → feed cronológico direto.
      const res = await admin
        .from("tradingview_signals")
        .select(SELECT)
        .or("signal_kind.is.null,signal_kind.eq.entry")
        .ilike("ticker", `%${symbolFilter}%`)
        .order("received_at", { ascending: false })
        .limit(limit)
      data = res.data
      error = res.error
    } else {
      // Feed principal: garante os últimos N POR estratégia (senão GoldKiller e outras
      // de baixo volume ficam afogadas pelos milhares de Sensei/Scanner recentes).
      const res = await admin.rpc("mtm_recent_alerts", {
        p_per_strategy: 12,
        p_total: Math.max(limit, 80),
      })
      data = res.data
      error = res.error
      // Fallback: se a função não existir/falhar, usa o feed cronológico direto.
      if (error) {
        const fb = await admin
          .from("tradingview_signals")
          .select(SELECT)
          .or("signal_kind.is.null,signal_kind.eq.entry")
          .order("received_at", { ascending: false })
          .limit(Math.max(limit, 80))
        data = fb.data
        error = fb.error
      }
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Nota 2026-08-20: a API devolve TODOS os estados (com outcomePips/outcomePct nos
    // terminados) — quem esconde os terminados da vista principal são os CLIENTES, que
    // precisam deles para os filtros Wins/Loss e para as métricas de desempenho. Só os
    // 'discarded'/'filtered' saem do payload do feed (nunca abriram — ficam apenas na BD).
    if (!idFilter && data) {
      data = (data as any[]).filter((row) => {
        const st = String(row.trade_status ?? "")
        return st !== "discarded" && st !== "filtered"
      })
    }

    const alerts: MtmAlert[] = (data || []).map((row: any) => {
      const raw = (row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {}) as Record<string, unknown>
      // `price` chega a 0 nos sinais pendentes do MTM Scanner, mas o payload traz a entrada
      // real (`entry`): o gráfico do sinal mostrava «ENTRADA 0.99111» e o cartão «a mercado»
      // (visto na app a 05/10/2026). A entrada é a da BD e, se for zero, a do payload.
      const entry = num(row.price) || num(raw.entry) || num(raw.entry_price) || null
      const stopLoss = extractStopLoss(num(row.sl), raw)
      const cls = classifyAssetClass(row.ticker)
      const sl = slInfo(row.ticker, entry, stopLoss, cls)
      const direction = resolveDirection(row.action)
      const takeProfits = extractTakeProfits(num(row.tp), raw)
      const outcome = outcomeInfo(row.ticker, direction, entry, stopLoss, takeProfits, (row.trade_status as string | null) ?? null)
      return {
        id: row.id,
        ticker: row.ticker,
        tvSymbol: buildTvSymbol(row.ticker, row.exchange),
        exchange: row.exchange,
        timeframe: row.timeframe,
        action: row.action,
        direction,
        entry,
        stopLoss,
        takeProfits,
        alertName: row.alert_name,
        strategy: pickStr(raw, ["strategy", "strategy_name", "scanner", "estrategia"]) || row.alert_name,
        session: pickStr(raw, ["session", "trading_session", "sessao", "sessions"]),
        confirmations: extractConfirmations(raw),
        message: row.message,
        aiAnalysis: (row.ai_management as string | null) ?? null,
        chartImageUrl: (row.chart_image_url as string | null) || extractChartImage(raw, row.message),
        createdAt: row.received_at,
        status: row.chat_status,
        tradeStatus: (row.trade_status as string | null) ?? "active",
        assetClass: cls,
        slDistance: sl.slDistance,
        slPercent: sl.slPercent,
        slPips: sl.slPips,
        slUnit: sl.slUnit,
        crypto: cls === "crypto_perp" ? cryptoSizing(entry, sl.slPercent) : null,
        outcomePips: outcome.outcomePips,
        outcomePct: outcome.outcomePct,
        outcomeUnit: outcome.outcomeUnit,
      }
    })

    // SINAIS PAGOS (Sensei, GoldKiller) só com direito — a mesma regra do chat desses canais.
    // Quem não o tem continua a ver a linha (ativo, scanner, hora, desfecho), sem entrada/stop/alvos.
    // O direito só se pergunta se houver algum sinal pago na resposta.
    const algumPago = alerts.some((a) => alertaDeSinalPago(a))
    const acessoSinaisPagos = algumPago ? await temDireitoSinaisPagosUtilizador(userId) : true
    const entregues = acessoSinaisPagos
      ? alerts
      : alerts.map((a) => (alertaDeSinalPago(a) ? ocultarConteudoDoAlerta(a) : a))

    return NextResponse.json(
      // `acessoSinaisPagos` só vai quando foi perguntado (havia sinais pagos na resposta).
      { success: true, alerts: entregues, ...(algumPago ? { acessoSinaisPagos } : {}) },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (err) {
    console.error("[MTM ALERTS] erro:", err)
    return NextResponse.json({ error: "Erro ao carregar alertas" }, { status: 500 })
  }
}
