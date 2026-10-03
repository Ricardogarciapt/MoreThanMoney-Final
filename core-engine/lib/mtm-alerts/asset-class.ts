/**
 * Classe de ativo de um alerta, a partir do ticker. Vivia dentro de /api/mtm-alerts; saiu para aqui
 * porque a gestão IA (/api/mtm-alerts/manage) precisa da mesma resposta para saber se o sinal é
 * pago (lib/direito-sinais → alertaDeSinalPago). Módulo PURO.
 */
export type AlertAssetClass = "gold_btc" | "forex" | "index" | "crypto_perp" | "other"
const FX_CODES = new Set(["EUR", "USD", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD", "SGD", "SEK", "NOK", "MXN", "ZAR"])
const IDX_SET = new Set(["UK100", "US30", "US100", "US500", "SPX500", "SPX", "NAS100", "NAS", "NDX", "DJI", "GER40", "DE40", "DE30", "DAX", "JP225", "JPN225", "FRA40", "EU50", "US2000", "HK50", "AUS200", "ESP35", "IT40"])
export function classifyAssetClass(ticker: string | null): AlertAssetClass {
  if (!ticker) return "other"
  const norm = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, "").replace(/^[A-Z]+:/, "")
  if (/XAUUSD/.test(norm) || /^BTCUSD$/.test(norm)) return "gold_btc"
  if (/\.P$/.test(norm) || /USDT/.test(norm) || /PERP/.test(norm)) return "crypto_perp"
  const letters = norm.replace(/[^A-Z]/g, "")
  if (letters.length === 6 && FX_CODES.has(letters.slice(0, 3)) && FX_CODES.has(letters.slice(3, 6))) return "forex"
  if (IDX_SET.has(norm) || IDX_SET.has(letters)) return "index"
  return "other"
}
