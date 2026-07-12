/**
 * Avaliador de estado dos Alertas MTM.
 * Lê os alertas abertos (pending/active) em `tradingview_signals`, obtém o preço
 * atual de cada ativo e escala o `trade_status` para exit_1/2/3 (win) ou loss.
 * Só progride o estado (nunca reverte um win para loss) e ignora tickers sem
 * fonte de preço fiável. Não cria variáveis de ambiente novas.
 */
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { fetchYahooQuote } from "@/lib/yahoo-market"
import { fetchBinanceSpotUsd } from "@/lib/crypto-usd"

const CRYPTO_BASES = new Set([
  "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "LTC", "AVAX", "LINK",
  "DOT", "MATIC", "TRX", "ATOM", "NEAR", "APT", "ARB", "OP", "SUI", "TON",
])
const FOREX_CODES = new Set(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"])
const YAHOO_MAP: Record<string, string> = {
  XAUUSD: "GC=F", GOLD: "GC=F", XAGUSD: "SI=F", SILVER: "SI=F",
  USOIL: "CL=F", WTIUSD: "CL=F", UKOIL: "BZ=F",
  US30: "^DJI", DJI: "^DJI", DOWJONES: "^DJI",
  US100: "^NDX", NAS100: "^NDX", NDX: "^NDX", USTEC: "^NDX",
  US500: "^GSPC", SPX500: "^GSPC", SPX: "^GSPC",
  GER40: "^GDAXI", DAX: "^GDAXI", DE40: "^GDAXI",
  UK100: "^FTSE", FTSE: "^FTSE", JP225: "^N225",
}

/** Resolve o preço atual de um ticker de webhook para várias classes de ativo. */
export async function resolveCurrentPrice(ticker: string | null): Promise<number | null> {
  if (!ticker) return null
  const norm = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, "")
  const clean = norm.replace(/\.P$/i, "").replace(/[^A-Z0-9]/g, "")

  // Cripto: perp (.P), pares *USDT, ou bases conhecidas terminadas em USD
  const cryptoBase = clean.replace(/USDT?$/i, "")
  const isCrypto = /USDT$/i.test(clean) || /\.P$/i.test(norm) || CRYPTO_BASES.has(cryptoBase)
  if (isCrypto) {
    const spot = await fetchBinanceSpotUsd(`${cryptoBase}USDT`)
    if (spot != null) return spot
  }

  // Mapa direto Yahoo (metais, índices, petróleo)
  if (YAHOO_MAP[clean]) {
    const q = await fetchYahooQuote(YAHOO_MAP[clean])
    return q.price
  }

  // Forex 6 letras (par de moedas)
  if (clean.length === 6 && FOREX_CODES.has(clean.slice(0, 3)) && FOREX_CODES.has(clean.slice(3, 6))) {
    const q = await fetchYahooQuote(`${clean}=X`)
    return q.price
  }

  // Ações / restantes → Yahoo tal como está
  const q = await fetchYahooQuote(clean)
  return q.price
}

type Status = "pending" | "active" | "be" | "exit_1" | "exit_2" | "exit_3" | "exit_4" | "loss" | "closed"
const RANK: Record<string, number> = { pending: 0, active: 1, be: 1, exit_1: 2, exit_2: 3, exit_3: 4, exit_4: 5, closed: 6 }
const isWin = (s: string | null) => Boolean(s && (s.startsWith("exit_") || s === "closed"))

/** Estado candidato a partir do preço atual vs. entrada/SL/TPs. */
function candidateStatus(dir: "buy" | "sell", price: number, entry: number | null, sl: number | null, tps: number[]): Status | null {
  const sorted = [...tps].filter((n) => Number.isFinite(n))
  // TPs por ordem de proximidade à entrada na direção do trade
  sorted.sort((a, b) => (dir === "buy" ? a - b : b - a))
  const tpHit = (i: number) => sorted[i] != null && (dir === "buy" ? price >= sorted[i] : price <= sorted[i])
  const slHit = sl != null && (dir === "buy" ? price <= sl : price >= sl)

  if (sorted.length >= 3 && tpHit(2)) return "exit_3"
  if (sorted.length >= 2 && tpHit(1)) return "exit_2"
  if (sorted.length >= 1 && tpHit(0)) return "exit_1"
  if (slHit) return "loss"
  if (entry != null && (dir === "buy" ? price >= entry : price <= entry)) return "active"
  return null
}

export async function evaluateOpenAlerts(limit = 200): Promise<{ scanned: number; updated: number; skipped: number }> {
  const admin = getSupabaseAdmin()
  const { data: rows } = await admin
    .from("tradingview_signals")
    .select("id, ticker, action, price, sl, tp, raw_payload, trade_status, signal_kind")
    .or("trade_status.is.null,trade_status.in.(pending,active,be)")
    .or("signal_kind.is.null,signal_kind.eq.entry")
    .order("received_at", { ascending: false })
    .limit(limit)

  let updated = 0
  let skipped = 0
  const list = rows ?? []

  for (const r of list) {
    const a = String(r.action ?? "").toLowerCase()
    const dir: "buy" | "sell" | null = /buy|long|compra/.test(a) ? "buy" : /sell|short|venda/.test(a) ? "sell" : null
    if (!dir) { skipped++; continue }

    const raw = (r.raw_payload && typeof r.raw_payload === "object" ? r.raw_payload : {}) as Record<string, unknown>
    const nn = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null)
    const entry = nn(r.price) ?? nn(raw.entry) ?? nn(raw.entry_price)
    const sl = nn(r.sl) ?? nn(raw.sl) ?? nn(raw.stop_loss) ?? nn(raw.stop)
    const tps = [
      nn(r.tp), nn(raw.tp1), nn(raw.tp2), nn(raw.tp3), nn(raw.tp4),
      nn(raw.exit1), nn(raw.exit2), nn(raw.exit3),
    ].filter((n): n is number => n != null)

    const price = await resolveCurrentPrice(r.ticker)
    if (price == null) { skipped++; continue }

    const cand = candidateStatus(dir, price, entry, sl, [...new Set(tps)])
    if (!cand) continue

    const cur = r.trade_status as string | null
    // Nunca reverter um win para loss; só progride o rank.
    if (cand === "loss") {
      if (isWin(cur)) continue
    } else if ((RANK[cand] ?? 1) <= (RANK[cur ?? "active"] ?? 1)) {
      continue
    }
    if (cand === cur) continue

    const { error } = await admin.from("tradingview_signals").update({ trade_status: cand }).eq("id", r.id)
    if (!error) updated++
  }

  return { scanned: list.length, updated, skipped }
}
