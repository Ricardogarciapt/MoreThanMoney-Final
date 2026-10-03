/**
 * LOTES NO ECRÃ — o que não está já em lib/mtmfunded/simulado/matematica (normalizarVolume) e
 * niveis-financeiros (volumePorRisco). Puro; testado em lib/webtrader/__tests__/lote.check.ts.
 */

interface Passos { volume_min: number; volume_step: number }

/**
 * O volume de um fecho parcial de `pct` % da posição, arredondado PARA BAIXO ao passo — com a
 * mesma margem ε de volumePorRisco. Sem ela, 1,16 × 50 % = 0,58 dava 0,57 (0,58 / 0,01 =
 * 57,99999…). `null` quando o que fica ou o que fecha ficaria abaixo do mínimo.
 */
export function volumeParcial(volume: number, pct: number, s: Passos): number | null {
  const passo = s.volume_step > 0 ? s.volume_step : 0.01
  if (!(volume > 0) || !(pct > 0) || !(pct < 100)) return null
  const casas = Math.max(0, Math.min(8, Math.ceil(-Math.log10(passo) - 1e-9)))
  const x = Number((Math.floor((volume * pct) / 100 / passo + 1e-9) * passo).toFixed(casas))
  if (x < s.volume_min - 1e-9) return null
  if (volume - x < s.volume_min - 1e-9) return null
  return x
}

/** Flutuante de uma lista de posições como o da conta (estadoDaConta): lucro ao preço + swap. */
export function flutuanteDasPosicoes(linhas: Array<{ lucro: number | null; swap?: number | null }>): number {
  return Math.round(linhas.reduce((a, l) => a + (l.lucro ?? 0) + (Number(l.swap) || 0), 0) * 100) / 100
}
