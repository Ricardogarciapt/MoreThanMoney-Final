/**
 * Corre `fn` sobre os itens com no máximo `n` ao mesmo tempo e devolve os resultados NA ORDEM dos
 * itens. Serve para a passagem do agente caber no minuto sem martelar as APIs grátis (Bybit,
 * RugCheck, RPC Solana): 4 em paralelo em vez de tudo de seguida ou tudo de uma vez.
 */
export async function emParalelo<T, R>(itens: readonly T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(itens.length)
  let proximo = 0
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++
      out[i] = await fn(itens[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, itens.length)) }, trabalhador))
  return out
}
