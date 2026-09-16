/**
 * GATES LOCAIS DO WEBHOOK DO TRADINGVIEW — tirados de app/api/webhooks/tradingview/route.ts sem
 * mudar uma linha de lógica (um ficheiro de rota do Next não pode exportar funções soltas).
 *
 * Porquê em lib: a sombra das estratégias (lib/mtmauto/sombra/scanner.ts) mede «o que TERIA sido
 * executado», e isso só é verdade se a pergunta for feita com o mesmo código que o webhook usa.
 * Uma cópia divergia ao primeiro ajuste.
 */

export type AssetClass = "gold_btc" | "forex" | "index" | "crypto_perp" | "other"

const FOREX_CODES = new Set(["EUR", "USD", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD", "SGD", "SEK", "NOK", "MXN", "ZAR"])
const INDEX_SET = new Set([
  "UK100", "US30", "US100", "US500", "SPX500", "SPX", "NAS100", "NAS", "NDX", "DJI",
  "GER40", "DE40", "DE30", "DAX", "JP225", "JPN225", "FRA40", "EU50", "STOXX50",
  "US2000", "HK50", "AUS200", "ESP35", "IT40",
])

/** Classifica o ticker do webhook para escolher canal/telegram/copy. */
export function classifyAsset(rawTicker: string | null): AssetClass {
  if (!rawTicker) return "other"
  const norm = rawTicker.toUpperCase().replace(/[^A-Z0-9.]/g, "").replace(/^[A-Z]+:/, "")
  // Ouro (Sensei) — SÓ XAUUSD. O BTC foi DESclassificado do Sensei (2026-08, decisão Ricardo):
  // passa a perpétuo cripto (mecânica perps/Bybit) em QUALQUER forma — BTCUSD, BTCUSDT, BTCUSD.P,
  // BTCUSDT.P (o scanner manda BTCUSDT.P; o PrimeVerse manda BTCUSD; ambos vão aos perps).
  if (/XAUUSD/.test(norm)) return "gold_btc"
  // Cripto perpétuos (BTC, ETH, SOL, …) em qualquer forma reconhecida → mecânica de perps.
  if (isCryptoPerpTicker(rawTicker)) return "crypto_perp"
  const letters = norm.replace(/[^A-Z]/g, "")
  if (letters.length === 6 && FOREX_CODES.has(letters.slice(0, 3)) && FOREX_CODES.has(letters.slice(3, 6))) return "forex"
  if (INDEX_SET.has(norm) || INDEX_SET.has(letters)) return "index"
  return "other"
}

const CRYPTO_BASES = new Set([
  "BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "DOT", "MATIC", "LTC",
  "HYPE", "SUI", "APT", "ARB", "OP", "TON", "TRX", "NEAR", "INJ", "SEI", "TIA", "ATOM",
  "FIL", "ETC", "BCH", "UNI", "AAVE", "PEPE", "WIF", "BONK", "SHIB", "FTM", "RNDR", "TAO",
])

/**
 * O ticker é MESMO um perpétuo cripto? Usado para não deixar forex/índices/metais serem
 * forçados para o canal de perps (e para a execução Bybit, que só tem cripto). Um alerta
 * do Aurum Flow disparado num USDCAD/ XAUUSD nunca deve virar "crypto_perp".
 */
export function isCryptoPerpTicker(rawTicker: string | null): boolean {
  if (!rawTicker) return false
  const norm = rawTicker.toUpperCase().replace(/[^A-Z0-9.]/g, "").replace(/^[A-Z]+:/, "")
  if (/XAU|XAG|XPT|XPD/.test(norm)) return false // metais preciosos não são cripto
  const letters = norm.replace(/[^A-Z]/g, "")
  // par fiat-fiat (forex) → não
  if (letters.length === 6 && FOREX_CODES.has(letters.slice(0, 3)) && FOREX_CODES.has(letters.slice(3, 6))) return false
  if (INDEX_SET.has(norm) || INDEX_SET.has(letters)) return false
  // marcadores explícitos de perp cripto
  if (/\.P$/.test(norm) || /USDT/.test(norm) || /USDC/.test(norm) || /PERP/.test(norm)) return true
  // base cripto conhecida (ex.: BTCUSD, SOLUSD, HYPEUSD)
  const base = letters.replace(/(USD|USDT|USDC)$/, "")
  return CRYPTO_BASES.has(base)
}

type Json = Record<string, unknown>

// ─── Gate de qualidade para auto-copy (confirmações + timeframe ajustado) ─────
const PREF_TF_MIN: Record<AssetClass, number[]> = {
  gold_btc: [15, 30, 60, 240],
  forex: [15, 30, 60],
  index: [30, 60, 240],
  crypto_perp: [15, 30, 60, 240],
  other: [],
}

export function tfToMinutes(tf: string | null): number | null {
  if (!tf) return null
  const s = String(tf).trim().toUpperCase()
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  const m = s.match(/^(\d+)\s*(M|MIN|H|D|W)$/)
  if (m) {
    const n = parseInt(m[1], 10)
    return m[2] === "H" ? n * 60 : m[2] === "D" ? n * 1440 : m[2] === "W" ? n * 10080 : n
  }
  if (s === "D") return 1440
  if (s === "W") return 10080
  return null
}

/** Nº de confirmações passadas no payload (zonetouch/bandtouch/trendtracker...), ou null se não houver. */
export function confirmationsPassed(raw: Json): number | null {
  const toBool = (v: unknown) =>
    v === true || v === 1 || (typeof v === "string" && /^(true|1|yes|sim|ok|pass|passed|✅)$/i.test(v.trim()))
  const src = raw.confirmations
  if (src && typeof src === "object" && !Array.isArray(src)) {
    const vals = Object.values(src as Record<string, unknown>)
    return vals.length ? vals.filter(toBool).length : null
  }
  if (Array.isArray(src)) {
    const arr = src as Array<Record<string, unknown>>
    return arr.length ? arr.filter((c) => toBool(c.passed ?? c.value ?? c.status)).length : null
  }
  const keys = ["zonetouch", "bandtouch", "trendtracker", "trend_tracker"]
  const present = keys.filter((k) => k in raw || k.toUpperCase() in raw)
  if (!present.length) return null
  return present.filter((k) => toBool(raw[k] ?? raw[k.toUpperCase()])).length
}

/** Só as melhores ideias abrem: confirmações suficientes + timeframe ajustado ao ativo. */
export function passesQualityGate(
  raw: Json,
  timeframe: string | null,
  cls: AssetClass,
  isGoldKiller = false,
  isSensei = false,
): boolean {
  // Sensei X: scanner com SCORE próprio (não usa as confirmações zonetouch/bandtouch).
  // O gate genérico mataria todos os sinais → confia-se no scanner; o filtro de qualidade
  // é o score (aplicado no canExecuteProvider). Aqui só passa.
  if (isSensei) return true
  // GoldKiller é um scanner dedicado de Ouro em 5m: a própria entrada É a decisão do
  // scanner (Momentum/Supertrend são só confirmações informativas, muitas vezes 0-1).
  // Aplicar o gate genérico (>=2 confirmações + timeframe 15m+) mataria todos os sinais
  // GoldKiller — por isso NÃO se aplica esse. Mas reforça-se um filtro LOCAL próprio (zero lag):
  // a GoldKiller é um scalp de 5m → rejeita sinais fora do intervalo de scalp (timeframe alto,
  // se conhecido), que quase sempre são ruído/erro. As confirmações (0-1) continuam informativas.
  if (isGoldKiller) {
    const gkMin = tfToMinutes(timeframe)
    if (gkMin !== null && gkMin > 15) return false
    return true
  }
  // Confirmações: se existirem, exige pelo menos 2 passadas.
  const passed = confirmationsPassed(raw)
  if (passed !== null && passed < 2) return false
  // Timeframe: se conhecido, tem de estar nos ajustados ao ativo.
  const min = tfToMinutes(timeframe)
  const pref = PREF_TF_MIN[cls]
  if (min !== null && pref.length && !pref.includes(min)) return false
  return true
}

/** Sanidade de stops (LOCAL, ~0 lag): rejeita SL absurdo (>25% do preço) — lixo de parse/sinal.
 *  Sem SL definido não bloqueia (a gestão trata). Protege scalp/GoldKiller de entradas com stop lixo. */
export function stopsSane(refPrice: number | null | undefined, sl: number | null | undefined): boolean {
  if (sl == null || !(sl > 0)) return true
  if (refPrice == null || !(refPrice > 0)) return true
  return Math.abs(refPrice - sl) / refPrice <= 0.25
}
