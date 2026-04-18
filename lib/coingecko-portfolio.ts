/** Mapeamento símbolo (Binance/Notion) → id CoinGecko — partilhado por rotas de portefólio */

export const SYMBOL_TO_COINGECKO: Record<string, string> = {
  ADAUSDT: "cardano",
  XRPUSDT: "ripple",
  DOTUSDT: "polkadot",
  MATICUSDT: "matic-network",
  LINKUSDT: "chainlink",
  AVAXUSDT: "avalanche-2",
  VETUSDT: "vechain",
  ARBUSDT: "arbitrum",
  OPUSDT: "optimism",
  GRTUSDT: "the-graph",
  HBARUSDT: "hedera-hashgraph",
  KASUSDT: "kaspa",
  JUPUSDT: "jupiter-exchange-solana",
  JUP: "jupiter-exchange-solana",
  SUIUSDT: "sui",
  SUI: "sui",
  TIAUSDT: "celestia",
  TIA: "celestia",
  CELESTIAUSDT: "celestia",
  CELESTIA: "celestia",
  ASTERUSDT: "aster",
  ASTER: "aster",
  ALGOUSDT: "algorand",
  IMXUSDT: "immutable-x",
  ONDOUSDT: "ondo-finance",
  JTOUSDT: "jito-governance-token",
  AEROUSDT: "aerodrome-finance",
  ILVUSDT: "illuvium",
  FLOWUSDT: "flow",
  USDTUSDT: "tether",
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  SOLUSDT: "solana",
  BNBUSDT: "binancecoin",
  ADA: "cardano",
  XRP: "ripple",
  DOT: "polkadot",
  MATIC: "matic-network",
  LINK: "chainlink",
  AVAX: "avalanche-2",
  VET: "vechain",
  ARB: "arbitrum",
  OP: "optimism",
  GRT: "the-graph",
  HBAR: "hedera-hashgraph",
  KAS: "kaspa",
  ALGO: "algorand",
  IMX: "immutable-x",
  ONDO: "ondo-finance",
  AERO: "aerodrome-finance",
  ILV: "illuvium",
  FLOW: "flow",
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  USDT: "tether",
  CARDANO: "cardano",
  RIPPLE: "ripple",
  POLKADOT: "polkadot",
  POLYGON: "matic-network",
  CHAINLINK: "chainlink",
  AVALANCHE: "avalanche-2",
  VECHAIN: "vechain",
  ARBITRUM: "arbitrum",
  OPTIMISM: "optimism",
  THEGRAPH: "the-graph",
  HEDERA: "hedera-hashgraph",
  KASPA: "kaspa",
  JUPITER: "jupiter-exchange-solana",
  ALGORAND: "algorand",
  IMMUTABLE: "immutable-x",
  TETHER: "tether",
}

export function normalizeSymbolKey(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/^BINANCE:/, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim()
}

export function resolveCoinGeckoId(rawSymbol: string): string | null {
  const normalized = normalizeSymbolKey(rawSymbol)
  if (!normalized) return null
  if (SYMBOL_TO_COINGECKO[normalized]) return SYMBOL_TO_COINGECKO[normalized]
  if (normalized.endsWith("USDT")) {
    const base = normalized.slice(0, -4)
    if (SYMBOL_TO_COINGECKO[base]) return SYMBOL_TO_COINGECKO[base]
  }
  return null
}

export function coingeckoFetchConfig(): {
  baseUrl: string
  headers: Record<string, string>
} {
  const key = process.env.COINGECKO_API_KEY?.trim()
  if (key) {
    return {
      baseUrl: "https://pro-api.coingecko.com/api/v3",
      headers: {
        Accept: "application/json",
        "x-cg-pro-api-key": key,
      },
    }
  }
  return {
    baseUrl: "https://api.coingecko.com/api/v3",
    headers: { Accept: "application/json" },
  }
}
