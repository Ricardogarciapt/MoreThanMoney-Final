/**
 * O «SL» DO PINE QUE NÃO FOI STOP — puro.
 *
 * O MTM Sensei X (perpétuos BTCUSDT.P) manda `state: "SL"` também quando só MEXE no stop. Nas 11
 * trades de 17 a 25/10/2026, seis «SL» chegaram com o preço do lado do LUCRO, longe do stop, e
 * minutos depois vieram o TP1 (e às vezes o TP2) da mesma trade. Exemplo, 20/10: compra a 82120.9,
 * stop original 81817.3, «SL» com o preço a 82444.9 e stop 82075.6. Impossível ter sido tocado.
 *
 * Como eram tratados como stop, a entrada ficava «loss» (as 11 ficaram assim, com 6 ganhas), as
 * ordens T2T pendentes dos seguidores eram apagadas, e os TP seguintes já não encontravam a entrada
 * aberta («sem_entrada») — saíam no chat como «Novo sinal».
 *
 * Um stop só foi tocado quando o preço do alerta está no stop ou já o passou. Margem: metade do
 * risco ORIGINAL (entrada → stop da entrada). Nas trades medidas, os stops verdadeiros chegaram a
 * menos de 12% do risco do stop, e os falsos a mais de 110%: a fronteira dos 50% não confunde.
 */
export function stopNaoFoiTocado(a: {
  direcao?: 'buy' | 'sell' | null
  entrada?: number | null
  slOriginal?: number | null
  /** O stop que o alerta diz ter sido tocado. */
  sl?: number | null
  /** O preço no momento do alerta. */
  preco?: number | null
}): boolean {
  const { direcao, entrada, slOriginal, sl, preco } = a
  if (!direcao || entrada == null || slOriginal == null || sl == null || preco == null) return false
  if (!(entrada > 0) || !(slOriginal > 0) || !(sl > 0) || !(preco > 0)) return false
  const risco = Math.abs(entrada - slOriginal)
  if (!(risco > 0)) return false
  // Distância do preço ao stop, a favor da trade. Positiva = o preço ainda não chegou ao stop.
  const folga = direcao === 'buy' ? preco - sl : sl - preco
  return folga > risco * 0.5
}
