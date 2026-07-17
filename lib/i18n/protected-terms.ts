/**
 * TERMOS PROTEGIDOS — nunca traduzir.
 *
 * Estes termos devem aparecer IDÊNTICOS em todos os 21 idiomas do dicionário.
 * Ao escrever traduções (lib/i18n/messages/*.ts), mantém qualquer um destes
 * tokens exatamente como está — não os traduzas, transliteres nem flexiones.
 *
 * Regra prática para quem migra componentes / cria namespaces:
 *  - Marca, produtos, features, estratégias, scanners → forma canónica abaixo.
 *  - Pares/ativos e símbolos de mercado (XAUUSD, EURUSD, BTC, ouro como "XAU")
 *    → deixar como estão; nunca traduzir tickers.
 *  - Nomes próprios de plataformas/parceiros (Stripe, Apple, MetaApi, brokers)
 *    → forma canónica.
 *
 * Esta lista é documental + utilitária: PROTECTED_TERMS pode ser usada em
 * scripts de auditoria para detetar violações nos ficheiros de tradução.
 */

export const PROTECTED_TERMS: string[] = [
  // ── Marca ──
  "MoreThanMoney",
  "More Than Money",
  "MTM",

  // ── Produtos / features ──
  "Tap to Trade",
  "T2T",
  "MTM Copy",
  "MTM Copier",
  "Swipe to Trade",

  // ── Estratégias ──
  "MTM Auto Premium",
  "MTM Auto Forex",
  "MTM Auto Sensei",
  "MTM Auto Trade Ideas",
  "Trade Ideas",
  "Premium",
  "GoldKiller",

  // ── Scanners / setups de trading ──
  "Sensei",
  "Sensei Scanner",
  "Kill Shot",
  "Golden Zone",
  "Fear & Greed",

  // ── Plataformas / parceiros / infra ──
  "Stripe",
  "Apple",
  "App Store",
  "Google Play",
  "MetaApi",
  "CopyFactory",
  "MetaTrader",
  "MT5",
  "MT4",
  "TradingView",
  "CoinGecko",
  "Telegram",
  "VT Markets",
  "PU Prime",
  "Monaxa",

  // ── Conceitos financeiros mantidos em EN (uso universal no ecossistema) ──
  "DCA",
  "ETF",
  "VIP",
]

/**
 * Pares e ativos de mercado — nunca traduzir (nem os tickers nem as formas
 * curtas). Lista não-exaustiva; qualquer ticker segue a mesma regra.
 */
export const PROTECTED_SYMBOLS: string[] = [
  "XAUUSD", "XAU", "XAGUSD", "XAG",
  "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "AUDUSD", "NZDUSD", "USDCHF",
  "EURJPY", "GBPJPY", "EURGBP",
  "BTCUSD", "BTC", "ETHUSD", "ETH", "SOL", "XRP",
  "US30", "NAS100", "US500", "SPX500", "GER40", "UK100",
  "WTI", "USOIL", "UKOIL",
]
