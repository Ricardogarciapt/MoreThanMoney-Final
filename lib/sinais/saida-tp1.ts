/**
 * A SAÍDA DO SENSEI X CRIPTO (decisão do dono, 26/10/2026): a de melhor desempenho medido, com
 * recompensa mínima de 1,5× o risco.
 *
 * Medido nas 11 trades BTC de 17–25/10 (/mnt/project-files/aurum/backtest-cripto-2026-10-26.md):
 * tudo no TP1 (1,5R) +5,33R · 50/50 TP1/TP2 +3,33R · 25/25/25/25 −0,17R. Só 2 de 11 passaram do
 * TP1, por isso a mestre fecha a posição INTEIRA no primeiro alvo que pague pelo menos 1,5R.
 *
 * Puro: sem base, sem rede.
 */
export const RR_MINIMO = 1.5

/** O primeiro alvo do lado certo que paga ≥ `minRR` × risco; null = nenhum (não se abre). */
export function alvoComRRMinimo(
  direcao: 'buy' | 'sell',
  entrada: number | null | undefined,
  sl: number | null | undefined,
  tps: number[],
  minRR: number = RR_MINIMO,
): number | null {
  if (entrada == null || sl == null || !(entrada > 0) || !(sl > 0)) return null
  const sentido = direcao === 'buy' ? 1 : -1
  const risco = (entrada - sl) * sentido
  if (!(risco > 0)) return null
  const alvos = tps
    .filter((t) => Number.isFinite(t) && t > 0 && (t - entrada) * sentido > 0)
    .sort((a, b) => (a - b) * sentido)
  // Pequena folga de arredondamento: o Pine põe o TP1 a 1,5R com as casas do instrumento.
  return alvos.find((t) => ((t - entrada) * sentido) / risco >= minRR - 1e-3) ?? null
}
