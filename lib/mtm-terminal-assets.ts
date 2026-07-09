/**
 * Catálogo de ativos do Terminal MTM.
 * Cada ativo tem tudo o que o terminal precisa: símbolo TradingView (gráfico),
 * fonte de preço ao vivo (Binance para crypto, Yahoo para o resto) e categoria.
 *
 * Não injeta variáveis novas — usa apenas as libs de preço já existentes.
 */

export type TerminalAssetType = "crypto" | "forex" | "commodity" | "index" | "stock"
export type PriceSource = "binance" | "coingecko" | "yahoo"

export interface TerminalAsset {
  /** Identificador curto mostrado ao utilizador (ex.: BTCUSD, XAUUSD, AAPL) */
  symbol: string
  /** Nome legível */
  name: string
  type: TerminalAssetType
  /** Símbolo completo para o widget TradingView (ex.: BINANCE:BTCUSDT, OANDA:XAUUSD, NASDAQ:AAPL) */
  tvSymbol: string
  /** Onde buscar o preço ao vivo */
  priceSource: PriceSource
  /** Símbolo a passar à fonte de preço (par Binance / símbolo Yahoo) */
  priceSymbol: string
}

export const TERMINAL_ASSETS: TerminalAsset[] = [
  // ─── Metais / Commodities ──────────────────────────────────────────────
  { symbol: "XAUUSD", name: "Ouro / Gold", type: "commodity", tvSymbol: "OANDA:XAUUSD", priceSource: "yahoo", priceSymbol: "GC=F" },
  { symbol: "XAGUSD", name: "Prata / Silver", type: "commodity", tvSymbol: "OANDA:XAGUSD", priceSource: "yahoo", priceSymbol: "SI=F" },
  { symbol: "USOIL", name: "Petróleo WTI", type: "commodity", tvSymbol: "TVC:USOIL", priceSource: "yahoo", priceSymbol: "CL=F" },

  // ─── Crypto ────────────────────────────────────────────────────────────
  { symbol: "BTCUSD", name: "Bitcoin", type: "crypto", tvSymbol: "BINANCE:BTCUSDT", priceSource: "binance", priceSymbol: "BTCUSDT" },
  { symbol: "ETHUSD", name: "Ethereum", type: "crypto", tvSymbol: "BINANCE:ETHUSDT", priceSource: "binance", priceSymbol: "ETHUSDT" },
  { symbol: "SOLUSD", name: "Solana", type: "crypto", tvSymbol: "BINANCE:SOLUSDT", priceSource: "binance", priceSymbol: "SOLUSDT" },
  { symbol: "XRPUSD", name: "XRP", type: "crypto", tvSymbol: "BINANCE:XRPUSDT", priceSource: "binance", priceSymbol: "XRPUSDT" },
  { symbol: "BNBUSD", name: "BNB", type: "crypto", tvSymbol: "BINANCE:BNBUSDT", priceSource: "binance", priceSymbol: "BNBUSDT" },
  { symbol: "ADAUSD", name: "Cardano", type: "crypto", tvSymbol: "BINANCE:ADAUSDT", priceSource: "binance", priceSymbol: "ADAUSDT" },
  { symbol: "DOGEUSD", name: "Dogecoin", type: "crypto", tvSymbol: "BINANCE:DOGEUSDT", priceSource: "binance", priceSymbol: "DOGEUSDT" },

  // ─── Forex ─────────────────────────────────────────────────────────────
  { symbol: "EURUSD", name: "Euro / Dólar", type: "forex", tvSymbol: "OANDA:EURUSD", priceSource: "yahoo", priceSymbol: "EURUSD=X" },
  { symbol: "GBPUSD", name: "Libra / Dólar", type: "forex", tvSymbol: "OANDA:GBPUSD", priceSource: "yahoo", priceSymbol: "GBPUSD=X" },
  { symbol: "USDJPY", name: "Dólar / Iene", type: "forex", tvSymbol: "OANDA:USDJPY", priceSource: "yahoo", priceSymbol: "USDJPY=X" },

  // ─── Índices ───────────────────────────────────────────────────────────
  { symbol: "SPX500", name: "S&P 500", type: "index", tvSymbol: "SP:SPX", priceSource: "yahoo", priceSymbol: "^GSPC" },
  { symbol: "NAS100", name: "Nasdaq 100", type: "index", tvSymbol: "NASDAQ:NDX", priceSource: "yahoo", priceSymbol: "^NDX" },
  { symbol: "US30", name: "Dow Jones", type: "index", tvSymbol: "DJ:DJI", priceSource: "yahoo", priceSymbol: "^DJI" },

  // ─── Ações ─────────────────────────────────────────────────────────────
  { symbol: "AAPL", name: "Apple", type: "stock", tvSymbol: "NASDAQ:AAPL", priceSource: "yahoo", priceSymbol: "AAPL" },
  { symbol: "NVDA", name: "NVIDIA", type: "stock", tvSymbol: "NASDAQ:NVDA", priceSource: "yahoo", priceSymbol: "NVDA" },
  { symbol: "TSLA", name: "Tesla", type: "stock", tvSymbol: "NASDAQ:TSLA", priceSource: "yahoo", priceSymbol: "TSLA" },
  { symbol: "MSFT", name: "Microsoft", type: "stock", tvSymbol: "NASDAQ:MSFT", priceSource: "yahoo", priceSymbol: "MSFT" },
  { symbol: "META", name: "Meta", type: "stock", tvSymbol: "NASDAQ:META", priceSource: "yahoo", priceSymbol: "META" },
  { symbol: "AMZN", name: "Amazon", type: "stock", tvSymbol: "NASDAQ:AMZN", priceSource: "yahoo", priceSymbol: "AMZN" },
]

export const TERMINAL_TYPE_LABELS: Record<TerminalAssetType, string> = {
  commodity: "Metais & Commodities",
  crypto: "Criptomoedas",
  forex: "Forex",
  index: "Índices",
  stock: "Ações",
}

export function findTerminalAsset(symbol: string): TerminalAsset | undefined {
  const s = symbol.trim().toUpperCase()
  return TERMINAL_ASSETS.find((a) => a.symbol.toUpperCase() === s)
}
