/**
 * TERMINAL MTM — cálculos técnicos PUROS a partir de velas diárias (sem I/O).
 * Usado no servidor (prompt da análise) e no browser (cartões ao vivo, recalculados com o preço
 * que está a chegar). Nada aqui é inventado: pivots, swings, EMA, RSI e ATR são aritmética.
 */

export interface Candle { t: number; o: number; h: number; l: number; c: number }

export interface TerminalLevels {
  supports: number[]
  resistances: number[]
  detail: {
    pivot: number
    priorDay: { h: number; l: number }
    priorWeek: { h: number; l: number }
    swingHighs: number[]
    swingLows: number[]
    asOf: string
  }
}

export function roundTo(v: number): number {
  const abs = Math.abs(v)
  const dp = abs >= 1000 ? 1 : abs >= 100 ? 2 : abs >= 1 ? 3 : 5
  return Number(v.toFixed(dp))
}

/** Pivôs de swing locais (janela w para cada lado). */
function swings(candles: Candle[], w = 3): { highs: number[]; lows: number[] } {
  const highs: number[] = []
  const lows: number[] = []
  for (let i = w; i < candles.length - w; i++) {
    const h = candles[i].h
    const l = candles[i].l
    let isH = true
    let isL = true
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue
      if (candles[j].h >= h) isH = false
      if (candles[j].l <= l) isL = false
    }
    if (isH) highs.push(h)
    if (isL) lows.push(l)
  }
  return { highs, lows }
}

/**
 * Suportes/resistências reais à volta do preço atual: junta pivots clássicos (do dia anterior
 * COMPLETO), high/low do dia e semana anteriores, e swings recentes; escolhe os mais próximos
 * (dedup por proximidade >0.2%). Devolve null se não houver dados.
 */
export function computeTerminalLevels(candles: Candle[], price: number): TerminalLevels | null {
  if (!candles.length || !Number.isFinite(price) || price <= 0) return null
  // A última vela pode ser o dia em curso → o "dia anterior completo" é a penúltima.
  const prev = candles.length >= 2 ? candles[candles.length - 2] : candles[candles.length - 1]
  const P = (prev.h + prev.l + prev.c) / 3
  const r1 = 2 * P - prev.l
  const s1 = 2 * P - prev.h
  const r2 = P + (prev.h - prev.l)
  const s2 = P - (prev.h - prev.l)
  const r3 = prev.h + 2 * (P - prev.l)
  const s3 = prev.l - 2 * (prev.h - P)
  const wk = candles.slice(-6, -1) // 5 dias anteriores ao dia em curso
  const priorWeekH = wk.length ? Math.max(...wk.map((c) => c.h)) : prev.h
  const priorWeekL = wk.length ? Math.min(...wk.map((c) => c.l)) : prev.l
  const { highs, lows } = swings(candles.slice(-60), 3)

  const above = [r1, r2, r3, prev.h, priorWeekH, ...highs].filter((v) => Number.isFinite(v) && v > price * 1.0005)
  const below = [s1, s2, s3, prev.l, priorWeekL, ...lows].filter((v) => Number.isFinite(v) && v < price * 0.9995)

  const pickNearest = (arr: number[], ascending: boolean): number[] => {
    const uniq = [...new Set(arr.map(roundTo))]
    uniq.sort((a, b) => Math.abs(a - price) - Math.abs(b - price))
    const picked: number[] = []
    for (const v of uniq) {
      if (picked.every((p) => Math.abs(p - v) / price > 0.002)) picked.push(v)
      if (picked.length >= 3) break
    }
    return picked.sort((a, b) => (ascending ? a - b : b - a))
  }

  const resistances = pickNearest(above, true)
  const supports = pickNearest(below, false)
  if (!resistances.length && !supports.length) return null

  return {
    supports,
    resistances,
    detail: {
      pivot: roundTo(P),
      priorDay: { h: roundTo(prev.h), l: roundTo(prev.l) },
      priorWeek: { h: roundTo(priorWeekH), l: roundTo(priorWeekL) },
      swingHighs: highs.slice(-6).map(roundTo),
      swingLows: lows.slice(-6).map(roundTo),
      asOf: new Date().toISOString(),
    },
  }
}

/** Contexto para o prompt: força o LLM a usar estes níveis reais em vez de inventar. */
export function buildLevelsContext(levels: TerminalLevels | null): string {
  if (!levels) return ""
  return `\n\n[NÍVEIS TÉCNICOS REAIS — calculados AGORA a partir de OHLC diário (pivots clássicos do dia anterior + máximos/mínimos de swing + high/low do dia e semana anteriores). Usa ESTES números EXATOS como suportes/resistências no dashboard; NÃO inventes outros nem os arredondes de forma diferente]:
- Suportes (do mais próximo): ${levels.supports.join(", ") || "n/d"}
- Resistências (do mais próximo): ${levels.resistances.join(", ") || "n/d"}
- Pivô diário: ${levels.detail.pivot} · Dia anterior H/L: ${levels.detail.priorDay.h}/${levels.detail.priorDay.l} · Semana anterior H/L: ${levels.detail.priorWeek.h}/${levels.detail.priorWeek.l}
Ancora as zonas de entrada, stops e take-profits nestes níveis.`
}


// ─── Indicadores ──────────────────────────────────────────────────────────────
export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null
  const k = 2 / (period + 1)
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k)
  return e
}

/** RSI de Wilder. O último valor pode ser substituído pelo preço ao vivo. */
export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
  }
  if (loss === 0) return 100
  return 100 - 100 / (1 + gain / loss)
}

export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length <= period) return null
  const trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    const pc = candles[i - 1].c
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc)))
  }
  let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / period
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period
  return a
}

/**
 * Reescala velas de uma referência a outro nível (futuros → CFD da corretora). Só se aplica quando
 * a referência NÃO está ao nível do preço mostrado e a base é plausível (±10 %).
 */
export function basisAdjust(candles: Candle[], livePrice: number | null, sameLevel: boolean): { candles: Candle[]; factor: number } {
  if (sameLevel || !candles.length || livePrice == null || !(livePrice > 0)) return { candles, factor: 1 }
  const last = candles[candles.length - 1].c
  const f = livePrice / last
  if (!Number.isFinite(f) || f < 0.9 || f > 1.1) return { candles, factor: 1 }
  return { candles: candles.map((c) => ({ t: c.t, o: c.o * f, h: c.h * f, l: c.l * f, c: c.c * f })), factor: f }
}

export interface TerminalTechnicals {
  price: number
  ema20: number | null
  ema50: number | null
  ema200: number | null
  rsi14: number | null
  atr14: number | null
  atrPct: number | null
  /** Posição do preço no intervalo das últimas 20 sessões (0 = mínimo, 100 = máximo) */
  range20Pct: number | null
  range20: { h: number; l: number } | null
  regime: "tendência de alta" | "tendência de baixa" | "lateral" | "indefinido"
  momentum: "sobrecomprado" | "forte" | "neutro" | "fraco" | "sobrevendido" | "indefinido"
  asOf: string
}

/** Técnicos diários com o último fecho substituído pelo preço ao vivo (a vela do dia ainda corre). */
export function computeTechnicals(candles: Candle[], price: number, now = Date.now()): TerminalTechnicals | null {
  if (candles.length < 21 || !(price > 0)) return null
  const closes = candles.map((c) => c.c)
  closes[closes.length - 1] = price
  const e20 = ema(closes, 20)
  const e50 = ema(closes, 50)
  const e200 = ema(closes, 200)
  const r = rsi(closes, 14)
  const a = atr(candles, 14)
  const last20 = candles.slice(-20)
  const h = Math.max(...last20.map((c) => c.h), price)
  const l = Math.min(...last20.map((c) => c.l), price)
  const range20Pct = h > l ? ((price - l) / (h - l)) * 100 : null

  let regime: TerminalTechnicals["regime"] = "indefinido"
  if (e20 != null && e50 != null) {
    const gap = Math.abs(e20 - e50) / price
    if (price > e20 && e20 > e50 && gap > 0.002) regime = "tendência de alta"
    else if (price < e20 && e20 < e50 && gap > 0.002) regime = "tendência de baixa"
    else regime = "lateral"
  }
  let momentum: TerminalTechnicals["momentum"] = "indefinido"
  if (r != null) momentum = r >= 70 ? "sobrecomprado" : r >= 55 ? "forte" : r > 45 ? "neutro" : r > 30 ? "fraco" : "sobrevendido"

  return {
    price,
    ema20: e20 != null ? roundTo(e20) : null,
    ema50: e50 != null ? roundTo(e50) : null,
    ema200: e200 != null ? roundTo(e200) : null,
    rsi14: r != null ? Math.round(r * 10) / 10 : null,
    atr14: a != null ? roundTo(a) : null,
    atrPct: a != null ? Math.round((a / price) * 10000) / 100 : null,
    range20Pct: range20Pct != null ? Math.round(range20Pct) : null,
    range20: { h: roundTo(h), l: roundTo(l) },
    regime,
    momentum,
    asOf: new Date(now).toISOString(),
  }
}

export function buildTechnicalsContext(t: TerminalTechnicals | null): string {
  if (!t) return ""
  return `\n\n[TÉCNICOS DIÁRIOS — calculados agora de OHLC, com o preço ao vivo]:
- Regime: ${t.regime} · Momentum: ${t.momentum} (RSI14 ${t.rsi14 ?? "n/d"})
- EMA20 ${t.ema20 ?? "n/d"} · EMA50 ${t.ema50 ?? "n/d"} · EMA200 ${t.ema200 ?? "n/d"}
- ATR14 ${t.atr14 ?? "n/d"} (${t.atrPct ?? "n/d"}% do preço) · Intervalo 20 sessões ${t.range20 ? `${t.range20.l}–${t.range20.h}` : "n/d"} (preço a ${t.range20Pct ?? "n/d"}% do intervalo)`
}
