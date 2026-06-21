import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase"
import { cryptoPortfolio, etfPortfolio } from "@/lib/portfolio-data"
import { fetchCryptoUsdBest } from "@/lib/crypto-usd"
import { classifyCryptoDailyChange, classifyEtfDailyChange } from "@/lib/dca-classifier"
import { fetchYahooQuote, fetchYahooHistoricalCloses } from "@/lib/yahoo-market"
import { generateDcaAiSummary } from "@/lib/dca-ai-summary"

interface DCAOpportunity {
  symbol: string
  name: string
  asset_type: "crypto" | "etf"
  current_price: number
  avg_price_last_7d: number
  avg_price_last_30d: number
  discount_percent: number
  recommendation: "Forte Compra" | "Compra" | "Aguardar" | "Não Reforçar"
  suggested_amount: number
  suggested_percent: number
  rationale: string
  confidence: number
  entry_zones: {
    optimal: number
    good: number
    fair: number
  }
  take_profits: number[]
  stop_loss: number
}

interface DcaEtfRow {
  symbol: string
  etf: string
  reforco_semanal: number
  entry_price?: number | null
  current_price_mtm?: number | null
}

type PriceSnap = { price: number | null; change24h: number | null }

interface DcaCryptoRow {
  symbol: string
  criptomoeda: string
  reforco_mensal: number
  entry_price?: number | null
  /** Preço já vindo do MTM (Notion/Admin), alinhado com /portfolios */
  current_price_mtm?: number | null
}

function normalizeBinanceSymbol(symbol: string): string {
  if (!symbol || typeof symbol !== "string") return symbol
  const aliases: Record<string, string> = {
    CARDANO: "ADA",
    RIPPLE: "XRP",
    POLKADOT: "DOT",
    POLYGON: "MATIC",
    CHAINLINK: "LINK",
    AVALANCHE: "AVAX",
    VECHAIN: "VET",
    ARBITRUM: "ARB",
    OPTIMISM: "OP",
    THEGRAPH: "GRT",
    HEDERA: "HBAR",
    KASPA: "KAS",
    JUPITER: "JUP",
    ALGORAND: "ALGO",
    IMMUTABLE: "IMX",
    TETHER: "USDT",
  }

  const cleaned = symbol
    .toUpperCase()
    .replace(/^BINANCE:/, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim()

  if (!cleaned) return symbol
  if (cleaned.endsWith("USDT")) return cleaned

  const mapped = aliases[cleaned] || cleaned
  return mapped.endsWith("USDT") ? mapped : `${mapped}USDT`
}

async function getBinanceHistoricalPrices(symbol: string, interval: string, limit: number) {
  const binanceSymbol = normalizeBinanceSymbol(symbol)
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`,
      { cache: "no-store" }
    )
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

function calculateAveragePrice(candles: any[]): number {
  if (!candles || candles.length === 0) return 0
  const sum = candles.reduce((acc, candle) => acc + parseFloat(candle[4]), 0)
  return sum / candles.length
}

/** Um pedido CoinGecko para todos os pares — mesmos números que /portfolios. */
async function fetchPriceSnapshotMap(baseUrl: string, binanceSymbols: string[]): Promise<Record<string, PriceSnap>> {
  const unique = [...new Set(binanceSymbols.map((s) => normalizeBinanceSymbol(s)).filter(Boolean))]
  const out: Record<string, PriceSnap> = {}
  if (unique.length === 0) return out
  const symParam = unique.join(",")
  try {
    const res = await fetch(`${baseUrl}/api/portfolio/prices-coingecko?symbols=${symParam}`, {
      cache: "no-store",
    })
    if (!res.ok) return out
    const j = (await res.json()) as {
      prices?: Record<string, number | null>
      changes_24h?: Record<string, number | null>
    }
    for (const s of unique) {
      const p = j.prices?.[s]
      const c = j.changes_24h?.[s]
      out[s] = {
        price: typeof p === "number" && Number.isFinite(p) && p > 0 ? p : null,
        change24h:
          typeof c === "number" && Number.isFinite(c) && !Number.isNaN(c) ? c : null,
      }
    }
  } catch {
    /* vazio */
  }
  return out
}

/** Uma linha por símbolo normalizado — evita cartões duplicados na análise DCA. */
function dedupeRowsBySymbol(rows: DcaCryptoRow[]): DcaCryptoRow[] {
  const seen = new Set<string>()
  const out: DcaCryptoRow[] = []
  for (const r of rows) {
    const k = normalizeBinanceSymbol(r.symbol)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

function mergeSnap(row: DcaCryptoRow, map: Record<string, PriceSnap>): PriceSnap {
  const key = normalizeBinanceSymbol(row.symbol)
  const m = map[key] || { price: null, change24h: null }
  const mtm = row.current_price_mtm
  const price =
    typeof mtm === "number" && mtm > 0 && Number.isFinite(mtm)
      ? mtm
      : m.price
  return { price: price ?? null, change24h: m.change24h }
}

function classifyByDailyChange(dailyChangePercent: number, plannedInvestment: number) {
  return classifyCryptoDailyChange(dailyChangePercent, plannedInvestment)
}

/**
 * Sempre devolve um cartão por ativo — preço alinhado ao snapshot/MTM/CoinGecko direto.
 */
async function analyzeDCAOpportunity(row: DcaCryptoRow, snap: PriceSnap): Promise<DCAOpportunity> {
  const symbol = row.symbol
  const name = row.criptomoeda || symbol
  const planned =
    Number.isFinite(row.reforco_mensal) && row.reforco_mensal > 0 ? row.reforco_mensal : 100
  const binanceSymbol = normalizeBinanceSymbol(symbol)

  let current: number | null = snap.price ?? null
  if (!current || current <= 0) {
    current = await fetchCryptoUsdBest(binanceSymbol)
  }

  const candles7d = await getBinanceHistoricalPrices(binanceSymbol, "1d", 7)
  const candles30d = await getBinanceHistoricalPrices(binanceSymbol, "1d", 30)

  if ((!current || current <= 0) && candles7d?.length) {
    current = parseFloat(candles7d[candles7d.length - 1][4])
  }

  const entry =
    typeof row.entry_price === "number" && row.entry_price > 0 && Number.isFinite(row.entry_price)
      ? row.entry_price
      : current && current > 0
        ? current * 0.92
        : 1

  if (!current || current <= 0) {
    current = entry
  }

  let avg7d = entry * 1.05
  let avg30d = entry * 1.08
  if (candles7d && candles7d.length > 0) {
    avg7d = calculateAveragePrice(candles7d)
  }
  if (candles30d && candles30d.length > 0) {
    avg30d = calculateAveragePrice(candles30d)
  }

  let dailyMove: number
  if (typeof snap.change24h === "number" && Number.isFinite(snap.change24h)) {
    dailyMove = snap.change24h
  } else if (candles7d && candles7d.length >= 2 && avg7d > 0) {
    dailyMove = ((avg7d - current) / avg7d) * 100
  } else {
    dailyMove = ((current - entry) / Math.max(entry, 1e-12)) * 100
  }

  if (!Number.isFinite(dailyMove)) {
    dailyMove = 0
  }

  const dailyDecision = classifyByDailyChange(dailyMove, planned)

  const zoneBase = candles30d?.length ? avg30d : current * 1.02
  const entryZones = {
    optimal: zoneBase * 0.92,
    good: zoneBase * 0.96,
    fair: zoneBase * 0.99,
  }

  const takeProfits = [current * 1.2, current * 1.5, current * 2.0]
  const stopLoss = current * 0.85

  return {
    symbol,
    name,
    asset_type: "crypto" as const,
    current_price: current,
    avg_price_last_7d: avg7d,
    avg_price_last_30d: avg30d,
    discount_percent: dailyMove,
    recommendation: dailyDecision.recommendation,
    suggested_amount: dailyDecision.suggestedAmount,
    suggested_percent: dailyDecision.suggestedPercent,
    rationale: dailyDecision.rationale,
    confidence: dailyDecision.confidence,
    entry_zones: entryZones,
    take_profits: takeProfits,
    stop_loss: stopLoss,
  }
}

async function analyzeRows(rows: DcaCryptoRow[], baseUrl: string): Promise<DCAOpportunity[]> {
  if (rows.length === 0) return []
  const keys = rows.map((r) => normalizeBinanceSymbol(r.symbol))
  const snapshotMap = await fetchPriceSnapshotMap(baseUrl, keys)
  const list = await Promise.all(
    rows.map(async (row) => {
      const snap = mergeSnap(row, snapshotMap)
      return analyzeDCAOpportunity(row, snap)
    })
  )
  return list
}

async function createStrongBuyNotification(opportunity: DCAOpportunity) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      }
    )

    const { data: users } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .or("user_type.eq.admin,member_category.eq.vip")

    if (!users || users.length === 0) return

    const notifications = users.map((user) => ({
      user_id: user.id,
      type: "dca_opportunity",
      title: `🚀 Forte Compra: ${opportunity.name}`,
      message: `Oportunidade DCA! ${opportunity.name} com variação diária de ${opportunity.discount_percent.toFixed(1)}%. Preço: $${opportunity.current_price.toFixed(4)}. Sugestão: ${opportunity.suggested_percent}% do reforço.`,
      read: false,
    }))

    await supabase.from("notifications").insert(notifications)
    console.log(`📢 Notificações de Forte Compra criadas para ${users.length} usuários (${opportunity.symbol})`)
  } catch (error) {
    console.error("Erro ao criar notificações:", error)
  }
}

function mapMtmAssetToRow(a: Record<string, unknown>): DcaCryptoRow {
  const ep = a.entry_price as number | null | undefined
  const cur = a.current_price as number | null | undefined
  return {
    symbol: String(a.symbol),
    criptomoeda: String(a.criptomoeda ?? a.nome ?? a.name ?? a.symbol ?? ""),
    reforco_mensal: Number(a.reforco_mensal ?? a.reforco_periodico ?? 0) || 0,
    entry_price: ep ?? null,
    current_price_mtm: typeof cur === "number" && cur > 0 ? cur : null,
  }
}

function mapMtmEtfToRow(a: Record<string, unknown>): DcaEtfRow {
  const ep = a.entry_price as number | null | undefined
  const cur = a.current_price as number | null | undefined
  return {
    symbol: String(a.symbol),
    etf: String(a.etf ?? a.name ?? a.symbol ?? ""),
    reforco_semanal: Number(a.reforco_semanal ?? 0) || 0,
    entry_price: ep ?? null,
    current_price_mtm: typeof cur === "number" && cur > 0 ? cur : null,
  }
}

async function analyzeEtfOpportunity(row: DcaEtfRow): Promise<DCAOpportunity> {
  const symbol = row.symbol.toUpperCase()
  const name = row.etf || symbol
  const weekly = row.reforco_semanal > 0 ? row.reforco_semanal : 25

  const quote = await fetchYahooQuote(symbol)
  let current =
    typeof row.current_price_mtm === "number" && row.current_price_mtm > 0
      ? row.current_price_mtm
      : quote.price

  const closes7d = await fetchYahooHistoricalCloses(symbol, "7d")
  const closes30d = await fetchYahooHistoricalCloses(symbol, "1mo")

  const entry =
    typeof row.entry_price === "number" && row.entry_price > 0
      ? row.entry_price
      : current && current > 0
        ? current * 0.95
        : 100

  if (!current || current <= 0) {
    current = closes7d.length ? closes7d[closes7d.length - 1] : entry
  }

  const avg7d =
    closes7d.length > 0
      ? closes7d.reduce((a, b) => a + b, 0) / closes7d.length
      : current * 1.02
  const avg30d =
    closes30d.length > 0
      ? closes30d.reduce((a, b) => a + b, 0) / closes30d.length
      : current * 1.04

  let dailyMove: number
  if (typeof quote.changePercent === "number" && Number.isFinite(quote.changePercent)) {
    dailyMove = quote.changePercent
  } else if (closes7d.length >= 2) {
    const prev = closes7d[closes7d.length - 2]
    dailyMove = prev > 0 ? ((current - prev) / prev) * 100 : 0
  } else {
    dailyMove = ((current - entry) / Math.max(entry, 1e-9)) * 100
  }

  const decision = classifyEtfDailyChange(dailyMove, weekly)
  const zoneBase = avg30d > 0 ? avg30d : current

  return {
    symbol,
    name,
    asset_type: "etf",
    current_price: current,
    avg_price_last_7d: avg7d,
    avg_price_last_30d: avg30d,
    discount_percent: dailyMove,
    recommendation: decision.recommendation,
    suggested_amount: decision.suggestedAmount,
    suggested_percent: decision.suggestedPercent,
    rationale: decision.rationale,
    confidence: decision.confidence,
    entry_zones: {
      optimal: zoneBase * 0.96,
      good: zoneBase * 0.98,
      fair: zoneBase * 0.995,
    },
    take_profits: [current * 1.12, current * 1.25, current * 1.4],
    stop_loss: current * 0.88,
  }
}

async function loadEtfRows(baseUrl: string): Promise<DcaEtfRow[]> {
  let rows: DcaEtfRow[] = []
  try {
    const mtmRes = await fetch(`${baseUrl}/api/portfolio/mtm?type=etf`, { cache: "no-store" })
    if (mtmRes.ok) {
      const mtm = await mtmRes.json()
      const assets = mtm.data?.etf?.assets
      if (Array.isArray(assets) && assets.length > 0) {
        rows = assets.map((a: Record<string, unknown>) => mapMtmEtfToRow(a))
        console.log(`✅ [DCA SMART] ${rows.length} ETF do MTM`)
      }
    }
  } catch (e) {
    console.warn("⚠️ [DCA SMART] Falha ao ler mtm ETF:", e)
  }

  if (rows.length === 0) {
    const supabaseAdmin = getSupabaseAdmin()
    const { data: adminEtf } = await supabaseAdmin
      .from("admin_etf_portfolio")
      .select("symbol, etf, reforco_semanal, entry_price")
      .order("percentual", { ascending: false })

    if (adminEtf && adminEtf.length > 0) {
      rows = adminEtf.map((a) => ({
        symbol: a.symbol,
        etf: a.etf,
        reforco_semanal: Number(a.reforco_semanal) || 0,
        entry_price: a.entry_price ?? null,
        current_price_mtm: null,
      }))
    } else {
      rows = etfPortfolio.map((a) => ({
        symbol: a.symbol,
        etf: a.etf,
        reforco_semanal: a.reforco_semanal,
        entry_price: a.entry_price ?? null,
        current_price_mtm: null,
      }))
    }
  }

  const seen = new Set<string>()
  return rows.filter((r) => {
    const k = r.symbol.toUpperCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

async function analyzeEtfRows(rows: DcaEtfRow[]): Promise<DCAOpportunity[]> {
  return Promise.all(rows.map((row) => analyzeEtfOpportunity(row)))
}

function buildSummary(opportunities: DCAOpportunity[], expectedCount: number) {
  const categorized = {
    strong_buys: opportunities.filter((o) => o.recommendation === "Forte Compra"),
    buys: opportunities.filter((o) => o.recommendation === "Compra"),
    waits: opportunities.filter((o) => o.recommendation === "Aguardar"),
    no_reinforce: opportunities.filter((o) => o.recommendation === "Não Reforçar"),
  }
  return {
    categorized,
    summary: {
      total_assets_analyzed: opportunities.length,
      expected_assets: expectedCount || opportunities.length,
      strong_buy_count: categorized.strong_buys.length,
      buy_count: categorized.buys.length,
      wait_count: categorized.waits.length,
      no_reinforce_count: categorized.no_reinforce.length,
      total_suggested_investment:
        categorized.strong_buys.reduce((sum, o) => sum + o.suggested_amount, 0) +
        categorized.buys.reduce((sum, o) => sum + o.suggested_amount, 0),
      best_opportunity: categorized.strong_buys[0] || categorized.buys[0] || null,
      notifications_created: categorized.strong_buys.length,
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") || "crypto"
    const withAi = searchParams.get("ai") !== "0"

    const baseUrl = request?.url
      ? new URL(request.url).origin
      : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"

    let opportunities: DCAOpportunity[] = []
    let expectedCount = 0
    const assetType: "crypto" | "etf" = type === "etf" ? "etf" : "crypto"

    if (type === "etf") {
      const rows = await loadEtfRows(baseUrl)
      expectedCount = rows.length
      opportunities = await analyzeEtfRows(rows)
      console.log(`📊 [DCA SMART ETF] Cartões: ${opportunities.length} / ${expectedCount}`)
    } else {
      let rows: DcaCryptoRow[] = []

      try {
        const mtmRes = await fetch(`${baseUrl}/api/portfolio/mtm?type=crypto`, { cache: "no-store" })
        if (mtmRes.ok) {
          const mtm = await mtmRes.json()
          const assets = mtm.data?.crypto?.assets
          if (Array.isArray(assets) && assets.length > 0) {
            rows = assets
              .filter((a: { symbol?: string }) => a.symbol && String(a.symbol).toUpperCase() !== "USDTUSDT")
              .map((a: Record<string, unknown>) => mapMtmAssetToRow(a))
            console.log(`✅ [DCA SMART] ${rows.length} crypto do MTM`)
          }
        }
      } catch (e) {
        console.warn("⚠️ [DCA SMART] Falha ao ler mtm:", e)
      }

      if (rows.length === 0) {
        const supabaseAdmin = getSupabaseAdmin()
        const { data: adminCrypto, error } = await supabaseAdmin
          .from("admin_crypto_portfolio")
          .select("symbol, criptomoeda, reforco_mensal, entry_price")
          .neq("symbol", "USDTUSDT")
          .order("percentual", { ascending: false })

        if (!error && adminCrypto && adminCrypto.length > 0) {
          rows = adminCrypto.map((a) => ({
            symbol: a.symbol,
            criptomoeda: a.criptomoeda,
            reforco_mensal: Number(a.reforco_mensal) || 0,
            entry_price: a.entry_price ?? null,
            current_price_mtm: null,
          }))
        } else {
          rows = cryptoPortfolio
            .filter((asset) => asset.symbol !== "USDTUSDT")
            .map((asset) => ({
              symbol: asset.symbol,
              criptomoeda: asset.criptomoeda,
              reforco_mensal: asset.reforco_mensal,
              entry_price: asset.entry_price ?? null,
              current_price_mtm: null,
            }))
        }
      }

      rows = dedupeRowsBySymbol(rows)
      expectedCount = rows.length
      const raw = await analyzeRows(rows, baseUrl)
      const seenSym = new Set<string>()
      opportunities = raw.filter((o) => {
        const k = normalizeBinanceSymbol(o.symbol)
        if (seenSym.has(k)) return false
        seenSym.add(k)
        return true
      })
      console.log(`📊 [DCA SMART] Cartões crypto: ${opportunities.length} / ${expectedCount}`)
    }

    const { categorized, summary } = buildSummary(opportunities, expectedCount)

    if (assetType === "crypto" && categorized.strong_buys.length > 0) {
      for (const opp of categorized.strong_buys) {
        await createStrongBuyNotification(opp)
      }
    }

    let ai_summary: string | null = null
    if (withAi && opportunities.length > 0) {
      ai_summary = await generateDcaAiSummary(assetType, opportunities, summary)
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          asset_type: assetType,
          opportunities,
          categorized,
          summary,
          ai_summary,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    )
  } catch (error) {
    console.error("❌ [DCA SMART] Erro:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao analisar oportunidades DCA",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
