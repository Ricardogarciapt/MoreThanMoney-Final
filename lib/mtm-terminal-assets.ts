/**
 * Catálogo de ativos do Terminal MTM.
 * Cada ativo tem tudo o que o terminal precisa: símbolo TradingView (gráfico), símbolo da
 * corretora (preço ao vivo, o mesmo do WebTrader), instrumento de referência e categoria.
 * Regra: o número do cabeçalho tem de bater com o gráfico — mesmo instrumento, mesmo nível.
 */

export type TerminalAssetType = "crypto" | "forex" | "commodity" | "index" | "stock"
export type PriceSource = "binance" | "coingecko" | "yahoo"

/**
 * Instrumento de REFERÊNCIA — dá a variação e as velas diárias (níveis, técnicos).
 * · binance-spot: par spot Binance (é o próprio instrumento do gráfico BINANCE:xxxUSDT).
 * · binance-futures: perpétuo Binance que segue o spot (XAUUSDT/XAGUSDT) — mesmo nível do OANDA.
 * · yahoo: símbolo Yahoo.
 * `sameLevel` diz se o preço da referência está ao MESMO nível do gráfico. Os futuros do ouro
 * (GC=F) estão ~40 $ acima do spot: foi daí que veio o «4335» contra os «4294» do gráfico.
 * Quando não está (futuros de índices/petróleo), usa-se só a % da referência e as velas são
 * reescaladas pela base (preço ao vivo ÷ último fecho da referência).
 */
export interface ReferenceInstrument {
  kind: "binance-spot" | "binance-futures" | "yahoo"
  symbol: string
  sameLevel: boolean
}

export interface TerminalAsset {
  /** Identificador curto mostrado ao utilizador (ex.: BTCUSD, XAUUSD, AAPL) */
  symbol: string
  /** Nome legível */
  name: string
  type: TerminalAssetType
  /** Símbolo completo para o widget TradingView (ex.: BINANCE:BTCUSDT, OANDA:XAUUSD, NASDAQ:AAPL) */
  tvSymbol: string
  /** Fonte legada (crypto → Binance; resto → preço da corretora/referência) */
  priceSource: PriceSource
  /** Símbolo legado da fonte de preço (par Binance / símbolo Yahoo) */
  priceSymbol: string
  /**
   * Símbolo na tabela `funded_precos` (streaming PU Prime escrito pelo motor do VPS — o mesmo
   * preço do WebTrader). null = não se usa a corretora (cripto: o gráfico é Binance).
   */
  brokerSymbol: string | null
  /** Referência para variação/velas. */
  ref: ReferenceInstrument
  /** Spot de último recurso para metais (gold-api.com: XAU/XAG). Nunca futuros. */
  metalSpot?: "XAU" | "XAG"
  /**
   * Referências de reserva para VELAS e VARIAÇÃO quando a principal não responde. Existem porque as
   * funções node da Vercel correm em iad1 (EUA) apesar do preferredRegion "fra1", e fapi.binance.com
   * recusa pedidos dos EUA: o ouro e a prata ficavam sem uma única vela (17/09). Todas levam
   * sameLevel:false — as velas são reescaladas ao preço ao vivo e a % é a da própria referência —,
   * por isso nunca mostram o nível dos futuros. Nunca entram no plano do PREÇO (quoteSourcePlan).
   */
  refFallbacks?: ReferenceInstrument[]
}

const y = (symbol: string, sameLevel: boolean): ReferenceInstrument => ({ kind: "yahoo", symbol, sameLevel })
const bs = (symbol: string): ReferenceInstrument => ({ kind: "binance-spot", symbol, sameLevel: true })

export const TERMINAL_ASSETS: TerminalAsset[] = [
  // ─── Metais / Commodities ──────────────────────────────────────────────
  { symbol: "XAUUSD", name: "Ouro / Gold", type: "commodity", tvSymbol: "OANDA:XAUUSD", priceSource: "yahoo", priceSymbol: "XAUUSD", brokerSymbol: "XAUUSD", ref: { kind: "binance-futures", symbol: "XAUUSDT", sameLevel: true }, metalSpot: "XAU",
    // PAXG (1 onça de ouro, espelho spot da Binance que não bloqueia os EUA) segue o spot a décimas de %; GC=F só no fim.
    refFallbacks: [{ kind: "binance-spot", symbol: "PAXGUSDT", sameLevel: false }, y("GC=F", false)] },
  { symbol: "XAGUSD", name: "Prata / Silver", type: "commodity", tvSymbol: "OANDA:XAGUSD", priceSource: "yahoo", priceSymbol: "XAGUSD", brokerSymbol: "XAGUSD", ref: { kind: "binance-futures", symbol: "XAGUSDT", sameLevel: true }, metalSpot: "XAG",
    // Não há prata spot acessível sem chave: futuros SI=F, reescalados ao preço da corretora.
    refFallbacks: [y("SI=F", false)] },
  { symbol: "USOIL", name: "Petróleo WTI", type: "commodity", tvSymbol: "TVC:USOIL", priceSource: "yahoo", priceSymbol: "CL=F", brokerSymbol: "USOIL", ref: y("CL=F", false) },

  // ─── Crypto ────────────────────────────────────────────────────────────
  { symbol: "BTCUSD", name: "Bitcoin", type: "crypto", tvSymbol: "BINANCE:BTCUSDT", priceSource: "binance", priceSymbol: "BTCUSDT", brokerSymbol: null, ref: bs("BTCUSDT") },
  { symbol: "ETHUSD", name: "Ethereum", type: "crypto", tvSymbol: "BINANCE:ETHUSDT", priceSource: "binance", priceSymbol: "ETHUSDT", brokerSymbol: null, ref: bs("ETHUSDT") },
  { symbol: "SOLUSD", name: "Solana", type: "crypto", tvSymbol: "BINANCE:SOLUSDT", priceSource: "binance", priceSymbol: "SOLUSDT", brokerSymbol: null, ref: bs("SOLUSDT") },
  { symbol: "XRPUSD", name: "XRP", type: "crypto", tvSymbol: "BINANCE:XRPUSDT", priceSource: "binance", priceSymbol: "XRPUSDT", brokerSymbol: null, ref: bs("XRPUSDT") },
  { symbol: "BNBUSD", name: "BNB", type: "crypto", tvSymbol: "BINANCE:BNBUSDT", priceSource: "binance", priceSymbol: "BNBUSDT", brokerSymbol: null, ref: bs("BNBUSDT") },
  { symbol: "ADAUSD", name: "Cardano", type: "crypto", tvSymbol: "BINANCE:ADAUSDT", priceSource: "binance", priceSymbol: "ADAUSDT", brokerSymbol: null, ref: bs("ADAUSDT") },
  { symbol: "DOGEUSD", name: "Dogecoin", type: "crypto", tvSymbol: "BINANCE:DOGEUSDT", priceSource: "binance", priceSymbol: "DOGEUSDT", brokerSymbol: null, ref: bs("DOGEUSDT") },

  // ─── Forex ─────────────────────────────────────────────────────────────
  { symbol: "EURUSD", name: "Euro / Dólar", type: "forex", tvSymbol: "OANDA:EURUSD", priceSource: "yahoo", priceSymbol: "EURUSD=X", brokerSymbol: "EURUSD", ref: y("EURUSD=X", true) },
  { symbol: "GBPUSD", name: "Libra / Dólar", type: "forex", tvSymbol: "OANDA:GBPUSD", priceSource: "yahoo", priceSymbol: "GBPUSD=X", brokerSymbol: "GBPUSD", ref: y("GBPUSD=X", true) },
  { symbol: "USDJPY", name: "Dólar / Iene", type: "forex", tvSymbol: "OANDA:USDJPY", priceSource: "yahoo", priceSymbol: "USDJPY=X", brokerSymbol: "USDJPY", ref: y("USDJPY=X", true) },

  // ─── Índices (CFD da corretora ↔ CFD OANDA no gráfico; futuros só para a %) ─────────────
  { symbol: "SPX500", name: "S&P 500", type: "index", tvSymbol: "OANDA:SPX500USD", priceSource: "yahoo", priceSymbol: "ES=F", brokerSymbol: "US500", ref: y("ES=F", false) },
  { symbol: "NAS100", name: "Nasdaq 100", type: "index", tvSymbol: "OANDA:NAS100USD", priceSource: "yahoo", priceSymbol: "NQ=F", brokerSymbol: "NAS100", ref: y("NQ=F", false) },
  { symbol: "US30", name: "Dow Jones", type: "index", tvSymbol: "OANDA:US30USD", priceSource: "yahoo", priceSymbol: "YM=F", brokerSymbol: "US30", ref: y("YM=F", false) },

  // ─── Ações ─────────────────────────────────────────────────────────────
  ...(["AAPL:Apple", "NVDA:NVIDIA", "TSLA:Tesla", "MSFT:Microsoft", "META:Meta", "AMZN:Amazon"].map((e) => {
    const [symbol, name] = e.split(":")
    return { symbol, name, type: "stock" as const, tvSymbol: `NASDAQ:${symbol}`, priceSource: "yahoo" as const, priceSymbol: symbol, brokerSymbol: symbol, ref: y(symbol, true) }
  })),
]

export const TERMINAL_TYPE_LABELS: Record<TerminalAssetType, string> = {
  commodity: "Metais & Commodities",
  crypto: "Criptomoedas",
  forex: "Forex",
  index: "Índices",
  stock: "Ações",
}

/** Ordem das referências para velas/variação: a principal e depois as de reserva. */
export function referencePlan(asset: TerminalAsset): ReferenceInstrument[] {
  return [asset.ref, ...(asset.refFallbacks ?? [])]
}

export function findTerminalAsset(symbol: string): TerminalAsset | undefined {
  const s = symbol.trim().toUpperCase()
  return TERMINAL_ASSETS.find((a) => a.symbol.toUpperCase() === s)
}
