/**
 * Peças partilhadas pelos estudos portados do Pine (Sensei, GoldKiller): a vela, o contexto que o
 * TradingView dá de graça (timeframe, mintick, barstate.isconfirmed) e as cores do Pine.
 */

/** Uma vela OHLCV. `t` em SEGUNDOS unix; `v` é o volume (tick volume em forex/CFD); sem volume, usar 0. */
export interface Vela {
  t: number
  o: number
  h: number
  l: number
  c: number
  v?: number
}

/** Deduz o timeframe (s) pela diferença mais frequente entre velas consecutivas. */
export function deduzirTf(velas: Vela[]): number {
  const conta = new Map<number, number>()
  for (let i = Math.max(1, velas.length - 300); i < velas.length; i++) {
    const d = velas[i].t - velas[i - 1].t
    if (d > 0) conta.set(d, (conta.get(d) ?? 0) + 1)
  }
  let melhor = 60
  let max = -1
  conta.forEach((n, d) => {
    if (n > max || (n === max && d < melhor)) { melhor = d; max = n }
  })
  return melhor
}

/** Deduz o syminfo.mintick pelas casas decimais observadas (máx. 5). */
export function deduzirMintick(velas: Vela[]): number {
  let casas = 0
  for (let i = Math.max(0, velas.length - 300); i < velas.length; i++) {
    for (const x of [velas[i].o, velas[i].h, velas[i].l, velas[i].c]) {
      const s = String(x)
      const p = s.indexOf('.')
      if (p >= 0) casas = Math.max(casas, Math.min(5, s.length - p - 1))
    }
  }
  return Math.pow(10, -casas)
}

/**
 * barstate.isconfirmed da ÚLTIMA vela pelo relógio: fechada se t + tf <= agora.
 * Todas as anteriores são sempre confirmadas.
 */
export function ultimaVelaFechada(velas: Vela[], tfSeg: number, agoraMs = Date.now()): boolean {
  if (!velas.length) return true
  return (velas[velas.length - 1].t + tfSeg) * 1000 <= agoraMs
}

/**
 * color.new(cor, transp) do Pine: transparência 0-100 (0 = opaco). Devolve rgba() para o canvas.
 */
export function corPine(hex: string, transp = 0): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const a = Math.max(0, Math.min(1, 1 - transp / 100))
  return `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`
}
