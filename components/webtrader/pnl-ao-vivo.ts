/**
 * O P&L DE UMA POSIÇÃO REAL, ENTRE SONDAGENS — para o WebTrader deixar de andar aos degraus.
 *
 * 25/09, queixa do Ricardo: «há uma diferença enorme de tempo entre a TradeLocker e o WebTrader».
 * Medido, a razão não era lentidão da rota. Era o ecrã à espera da corretora para saber uma coisa
 * que já tinha: as posições vêm de 3 em 3 s (mais 2 s de cache no servidor) e o saldo de 10 em 10,
 * por isso o lucro flutuante saltava em degraus de 3 a 5 s — enquanto os PREÇOS já chegam ao ecrã
 * a 135 ms pela WebSocket do motor. A plataforma da corretora move o número continuamente porque o
 * calcula; nós tínhamos tudo para o fazer e não o fazíamos (`precoAtual` vinha mesmo a `null`).
 *
 * COMO SE CALCULA SEM ADIVINHAR O CONTRATO
 *
 * A tentação era multiplicar por um valor de ponto nosso — e aí é preciso saber o contrato, a
 * moeda de lucro e a conversão de cada símbolo em cada corretora. Errar isso é mostrar um lucro
 * falso numa conta real, que é pior do que mostrar um lucro atrasado.
 *
 * Por isso NÃO se adivinha: em cada sondagem a corretora diz-nos o lucro dela e nós sabemos o preço
 * daquele instante, logo dá-se o factor por divisão — quanto vale, em dinheiro, um ponto de
 * movimento naquela posição. Entre sondagens aplica-se esse factor ao preço novo. De 3 em 3 s a
 * verdade da corretora volta e recalibra; se derivarmos, a deriva dura no máximo uma sondagem.
 *
 * REGRAS DE SEGURANÇA (isto é dinheiro real)
 *  · É SÓ PARA MOSTRAR. Nada do que sai daqui pode decidir uma ordem, um risco ou um fecho — quem
 *    executa usa os números da corretora, não estes.
 *  · Sem calibração fiável (preço igual ao de entrada, lucro ausente, factor absurdo) devolve-se o
 *    valor da corretora tal e qual. Na dúvida mostra-se o número atrasado, nunca um inventado.
 *  · Um preço que não é fresco não serve para nada disto: devolve-se o da corretora.
 */

export interface PosicaoParaPnl {
  symbol: string
  direcao: 'buy' | 'sell'
  volume: number
  precoEntrada: number
  /** O lucro que a corretora deu na última sondagem. É ele que manda quando não dá para calibrar. */
  lucro: number | null
}

export interface PrecoParaPnl { bid: number; ask: number; fresco: boolean }

/** Quanto vale, em dinheiro, UM ponto de movimento nesta posição. */
export interface Calibracao { porPonto: number; em: number }

/** O preço a que a posição FECHA agora: uma compra sai ao bid, uma venda ao ask. */
export function precoDeSaida(direcao: 'buy' | 'sell', p: PrecoParaPnl): number {
  return direcao === 'buy' ? p.bid : p.ask
}

/** Movimento a favor, em pontos de preço (negativo quando está contra). */
export function movimento(pos: PosicaoParaPnl, preco: number): number {
  return pos.direcao === 'buy' ? preco - pos.precoEntrada : pos.precoEntrada - preco
}

/**
 * Tira o factor da resposta da corretora. Devolve `null` quando não há como o tirar com confiança —
 * e aí o chamador fica-se pelo número dela.
 */
export function calibrar(pos: PosicaoParaPnl, preco: PrecoParaPnl | null | undefined, agora = Date.now()): Calibracao | null {
  if (!preco?.fresco || pos.lucro == null || !Number.isFinite(pos.lucro)) return null
  const mov = movimento(pos, precoDeSaida(pos.direcao, preco))
  // Perto da entrada o divisor é ruído: 0,02 pontos de movimento com 1 € de lucro dariam 50 €/ponto.
  // Exige-se movimento suficiente para o factor significar alguma coisa.
  if (!Number.isFinite(mov) || Math.abs(mov) < 1e-9) return null
  const porPonto = pos.lucro / mov
  // Um factor tem de ser positivo e finito: negativo significaria que ganhar dinheiro dá prejuízo,
  // o que só acontece se a corretora ainda não tinha actualizado o lucro para este preço.
  if (!Number.isFinite(porPonto) || porPonto <= 0) return null
  return { porPonto, em: agora }
}

/** Quanto tempo é que uma calibração serve. Passado isto volta-se ao número da corretora. */
export const CALIBRACAO_VALIDA_MS = 30_000

/**
 * O lucro a MOSTRAR agora. Cai sempre para o valor da corretora quando não há como fazer melhor.
 */
export function lucroAoVivo(
  pos: PosicaoParaPnl,
  preco: PrecoParaPnl | null | undefined,
  cal: Calibracao | null | undefined,
  agora = Date.now(),
): { valor: number | null; aoVivo: boolean } {
  if (!preco?.fresco || !cal || agora - cal.em > CALIBRACAO_VALIDA_MS) {
    return { valor: pos.lucro, aoVivo: false }
  }
  const v = movimento(pos, precoDeSaida(pos.direcao, preco)) * cal.porPonto
  if (!Number.isFinite(v)) return { valor: pos.lucro, aoVivo: false }
  return { valor: v, aoVivo: true }
}

/**
 * Equity entre sondagens do saldo: é o saldo (que só muda quando uma posição FECHA, e aí a
 * sondagem trá-lo) mais o flutuante de agora. Sem saldo não se inventa nada.
 */
export function equityAoVivo(saldo: number | null | undefined, flutuanteAgora: number | null): number | null {
  if (saldo == null || !Number.isFinite(saldo) || flutuanteAgora == null || !Number.isFinite(flutuanteAgora)) return null
  return saldo + flutuanteAgora
}
