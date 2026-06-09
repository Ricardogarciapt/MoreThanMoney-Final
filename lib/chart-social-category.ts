/** Categorias do feed Social (app-mobile) para gráficos partilhados */
export type ChartSocialCategory = "crypto" | "forex"

const CRYPTO_PREFIXES = ["BINANCE:", "COINBASE:", "KRAKEN:", "BITSTAMP:"]

export function inferChartSocialCategory(symbol: string): ChartSocialCategory {
  const s = String(symbol || "").trim().toUpperCase()
  if (!s) return "forex"
  if (CRYPTO_PREFIXES.some((p) => s.startsWith(p))) return "crypto"
  if (s.includes("USDT") || s.includes("BTC") || s.includes("ETH")) return "crypto"
  return "forex"
}

export const CHART_SOCIAL_CATEGORIES: { value: ChartSocialCategory; label: string }[] = [
  { value: "crypto", label: "Criptomoedas" },
  { value: "forex", label: "Forex" },
]
