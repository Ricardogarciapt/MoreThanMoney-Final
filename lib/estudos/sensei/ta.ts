/**
 * Funções ta.* do Pine v6, em série inteira, com a semântica de `na` do Pine.
 *
 * Regras que importam para bater certo com o TradingView:
 *  - `na` é NaN; aritmética com NaN dá NaN (igual ao Pine).
 *  - ta.sma devolve na enquanto a janela não tiver `length` valores e sempre que um deles for na.
 *  - ta.ema e ta.rma arrancam com a SMA dos primeiros `length` valores (pseudo-código oficial:
 *    `sum := na(sum[1]) ? ta.sma(src, length) : alpha * src + (1 - alpha) * nz(sum[1])`).
 *    Se o src ficar na a meio, o valor fica na e volta a semear quando a janela limpar.
 *  - ta.atr usa o true range com `na(high[1]) ? high - low : …` na primeira barra.
 *  - Comparações com na são falsas — em JS `NaN != x` é true, por isso há `diferente()`.
 */

export const na = Number.NaN
export const isNa = (x: number | null | undefined): boolean => x == null || Number.isNaN(x)
/** nz(x, y) */
export const nz = (x: number, y = 0): number => (Number.isNaN(x) ? y : x)
/** `a != b` do Pine: falso se algum for na. */
export const diferente = (a: number, b: number): boolean => !Number.isNaN(a) && !Number.isNaN(b) && a !== b
/** math.max / math.min do Pine: na se algum for na (Math.max já faz isso). */
export const maxPine = (a: number, b: number): number => Math.max(a, b)
export const minPine = (a: number, b: number): number => Math.min(a, b)
/** math.round do Pine (meio para cima). */
export const roundPine = (x: number): number => (Number.isNaN(x) ? na : Math.round(x))

/** x[k] com fora-de-alcance = na. */
export const ref = (s: ArrayLike<number>, i: number, k = 0): number => {
  const j = i - k
  return j >= 0 && j < s.length ? s[j] : na
}

export function sma(src: ArrayLike<number>, length: number): number[] {
  const out = new Array<number>(src.length).fill(na)
  let soma = 0
  let nNa = 0
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    if (Number.isNaN(x)) nNa++
    else soma += x
    if (i >= length) {
      const y = src[i - length]
      if (Number.isNaN(y)) nNa--
      else soma -= y
    }
    if (i >= length - 1 && nNa === 0) {
      // soma corrida acumula erro de vírgula flutuante; recalcula de vez em quando
      if (i % 512 === 0) {
        soma = 0
        for (let k = i - length + 1; k <= i; k++) soma += src[k]
      }
      out[i] = soma / length
    }
  }
  return out
}

/** Média exponencial genérica com semente SMA (base de ta.ema e ta.rma). */
function mediaExp(src: ArrayLike<number>, length: number, alpha: number): number[] {
  const semente = sma(src, length)
  const out = new Array<number>(src.length).fill(na)
  for (let i = 0; i < src.length; i++) {
    const ant = i > 0 ? out[i - 1] : na
    out[i] = Number.isNaN(ant) ? semente[i] : alpha * src[i] + (1 - alpha) * ant
  }
  return out
}

export const ema = (src: ArrayLike<number>, length: number): number[] => mediaExp(src, length, 2 / (length + 1))
export const rma = (src: ArrayLike<number>, length: number): number[] => mediaExp(src, length, 1 / length)

/** dema() do script: 2·ema1 − ema(ema1). */
export function dema(src: ArrayLike<number>, length: number): number[] {
  const e1 = ema(src, length)
  const e2 = ema(e1, length)
  return e1.map((v, i) => 2 * v - e2[i])
}

/** ta.stdev(src, length) — desvio-padrão populacional (biased = true, o default). */
export function stdev(src: ArrayLike<number>, length: number): number[] {
  const media = sma(src, length)
  const out = new Array<number>(src.length).fill(na)
  for (let i = length - 1; i < src.length; i++) {
    const m = media[i]
    if (Number.isNaN(m)) continue
    let s = 0
    for (let k = 0; k < length; k++) {
      const d = src[i - k] - m
      s += d * d
    }
    out[i] = Math.sqrt(s / length)
  }
  return out
}

/** ta.tr(true) — true range; na(high[1]) → high − low. */
export function trueRange(h: ArrayLike<number>, l: ArrayLike<number>, c: ArrayLike<number>): number[] {
  const out = new Array<number>(h.length)
  for (let i = 0; i < h.length; i++) {
    out[i] = i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))
  }
  return out
}

export const atr = (h: ArrayLike<number>, l: ArrayLike<number>, c: ArrayLike<number>, length: number): number[] =>
  rma(trueRange(h, l, c), length)

/** ta.rsi(src, length) com os casos-limite do built-in (d = 0 → 100, u = 0 → 0). */
export function rsi(src: ArrayLike<number>, length: number): number[] {
  const u = new Array<number>(src.length)
  const d = new Array<number>(src.length)
  for (let i = 0; i < src.length; i++) {
    const ant = i > 0 ? src[i - 1] : na
    u[i] = Math.max(src[i] - ant, 0)
    d[i] = Math.max(ant - src[i], 0)
  }
  const ru = rma(u, length)
  const rd = rma(d, length)
  return ru.map((up, i) => {
    const dn = rd[i]
    if (Number.isNaN(up) || Number.isNaN(dn)) return na
    if (dn === 0) return 100
    if (up === 0) return 0
    return 100 - 100 / (1 + up / dn)
  })
}

/** ta.highest(src, length) — na nas primeiras length−1 barras. */
export function highest(src: ArrayLike<number>, length: number): number[] {
  const out = new Array<number>(src.length).fill(na)
  for (let i = length - 1; i < src.length; i++) {
    let m = -Infinity
    for (let k = 0; k < length; k++) {
      const x = src[i - k]
      if (Number.isNaN(x)) { m = na; break }
      if (x > m) m = x
    }
    out[i] = m
  }
  return out
}

export function lowest(src: ArrayLike<number>, length: number): number[] {
  const out = new Array<number>(src.length).fill(na)
  for (let i = length - 1; i < src.length; i++) {
    let m = Infinity
    for (let k = 0; k < length; k++) {
      const x = src[i - k]
      if (Number.isNaN(x)) { m = na; break }
      if (x < m) m = x
    }
    out[i] = m
  }
  return out
}

/** math.sum(src, length) — soma móvel, na até haver length valores. */
export function soma(src: ArrayLike<number>, length: number): number[] {
  return sma(src, length).map((x) => x * length)
}

/** ta.crossover(a, b) na barra i: a > b e a[1] <= b[1]. */
export const crossover = (a: ArrayLike<number>, b: ArrayLike<number>, i: number): boolean =>
  i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1]

export const crossunder = (a: ArrayLike<number>, b: ArrayLike<number>, i: number): boolean =>
  i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1]

/**
 * ADX exatamente como o script o calcula à mão (não é ta.dmi): tr_ com close[1] na na 1.ª barra,
 * dmP_/dmM_ = 0 quando a comparação envolve na, e divisão por zero = na.
 */
export function adxSensei(h: ArrayLike<number>, l: ArrayLike<number>, c: ArrayLike<number>, len = 14): number[] {
  const n = h.length
  const tr = new Array<number>(n)
  const dmP = new Array<number>(n)
  const dmM = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const c1 = i > 0 ? c[i - 1] : na
    tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c1), Math.abs(l[i] - c1))
    const up = i > 0 ? h[i] - h[i - 1] : na
    const dn = i > 0 ? l[i - 1] - l[i] : na
    dmP[i] = up > dn ? Math.max(up, 0) : 0
    dmM[i] = dn > up ? Math.max(dn, 0) : 0
  }
  const atrA = rma(tr, len)
  const rP = rma(dmP, len)
  const rM = rma(dmM, len)
  const dx = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const diP = atrA[i] === 0 ? na : (rP[i] / atrA[i]) * 100
    const diM = atrA[i] === 0 ? na : (rM[i] / atrA[i]) * 100
    const s = diP + diM
    dx[i] = s === 0 ? na : (Math.abs(diP - diM) / s) * 100
  }
  return rma(dx, len)
}
