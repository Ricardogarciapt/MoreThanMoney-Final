/**
 * GOLDEN MOVES — a estratégia em camadas (layering).
 *
 * A fonte escreve assim:
 *
 *     I'm selling XAUUSD
 *     4411-4415
 *     TP1 4408 / TP2 4406 / TP3 4404 / TP4 4400
 *     SL 4419
 *
 * Daqui saem DUAS entradas, não uma:
 *
 *  1. **Mercado** no primeiro número da zona (4411) — o preço a que o mercado já está, ou está
 *     quase. É a entrada que garante que se apanha o movimento.
 *  2. **Limite** na ponta da zona (4415) — o preço melhor, que só enche se o mercado vier
 *     buscá-lo. Pode nunca encher, e isso é aceitável: é a camada de bónus.
 *
 * Qual é qual não se decide pela ordem em que vêm escritos, decide-se pela DIREÇÃO. Numa venda,
 * o preço melhor é o mais alto; numa compra, o mais baixo. A fonte costuma escrever o mais
 * próximo primeiro, mas basta um sinal escrito ao contrário para a ordem-limite ficar do lado
 * errado — e uma "limite" do lado errado é uma ordem stop, que entra a perder em vez de entrar
 * melhor. Por isso aqui olha-se para os números, não para a ordem deles.
 *
 * Gestão (pedido do Ricardo): garantir SEMPRE o primeiro alvo e deixar o resto a correr com
 * trailing. Nada de fechar tudo num alvo intermédio.
 */

import type { ParsedSignal } from './signal-parser'

/** Lote de cada camada. Duas camadas de 0,02 dão parciais de 0,01 — o mínimo do broker. */
export const GOLDENMOVES_LOTE = 0.02

/**
 * Saídas: metade no primeiro alvo, o resto corre.
 *
 * `tp2`/`tp3` a zero é deliberado e não é o mesmo que "sem alvo": a posição não fecha no segundo
 * nem no terceiro alvo, fica entregue ao trailing. É isso o *runner*. Fechar no TP2 era o que a
 * perna Gold Did fazia e é precisamente o que aqui se não quer.
 */
export const GOLDENMOVES_SAIDAS = { tp1: 50, tp2: 0, tp3: 0 } as const

export type CamadaTipo = 'mercado' | 'limite'

export interface Camada {
  tipo: CamadaTipo
  preco: number
  lote: number
}

export interface PlanoGoldenMoves {
  symbol: string
  direction: 'buy' | 'sell'
  camadas: [Camada, Camada]
  sl: number
  tp: number[]
}

/** O preço `a` é melhor do que `b` para quem abre nesta direção? */
function melhorPreco(direction: 'buy' | 'sell', a: number, b: number): boolean {
  return direction === 'sell' ? a > b : a < b
}

/**
 * As duas camadas de um sinal da Golden Moves, ou null se o sinal não serve.
 *
 * Devolve null — em vez de improvisar — quando falta a zona, quando os dois extremos são o mesmo
 * preço (não há duas camadas para abrir) ou quando o stop está do lado errado da entrada. Um
 * stop do lado errado não é um sinal mal formatado, é um sinal impossível: já nasce fechado.
 */
export function planoGoldenMoves(
  s: Pick<ParsedSignal, 'symbol' | 'direction' | 'entry' | 'zone' | 'zoneFirst' | 'sl' | 'tp'>,
  lote: number = GOLDENMOVES_LOTE,
): PlanoGoldenMoves | null {
  const { symbol, direction, sl } = s
  if (!symbol || !direction || sl == null) return null

  const extremos = s.zone ?? (s.zoneFirst != null && s.entry != null ? [s.zoneFirst, s.entry] : null)
  if (!extremos) return null
  const [x, y] = [Number(extremos[0]), Number(extremos[1])]
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === y) return null

  // A limite fica no preço melhor para a direção; a de mercado no outro extremo.
  const precoLimite = melhorPreco(direction, x, y) ? x : y
  const precoMercado = precoLimite === x ? y : x

  // O stop tem de estar do lado de lá das DUAS entradas. Numa venda, acima da mais alta.
  const piorEntrada = direction === 'sell' ? Math.max(precoMercado, precoLimite) : Math.min(precoMercado, precoLimite)
  const stopValido = direction === 'sell' ? sl > piorEntrada : sl < piorEntrada
  if (!stopValido) return null

  return {
    symbol,
    direction,
    camadas: [
      { tipo: 'mercado', preco: precoMercado, lote },
      { tipo: 'limite', preco: precoLimite, lote },
    ],
    sl,
    tp: s.tp ?? [],
  }
}

/**
 * A mensagem que manda fechar as primeiras entradas e deixar as de cima a correr.
 *
 * Exemplo vivo: «Close first entries now and keep highest entries risk free or secure profit».
 * A fonte não escreve sempre igual — o que se procura é a intenção: fechar as primeiras E
 * proteger/deixar correr as restantes. Exigir a frase exata era garantir que um dia não casava.
 */
export function ehFecharPrimeirasEntradas(texto: string): boolean {
  const t = (texto ?? '').toLowerCase()
  if (!t) return false
  const fecharPrimeiras = /\bclose\b[^.\n]{0,40}\bfirst\b[^.\n]{0,20}\bentr/.test(t)
  const protegerResto =
    /\brisk\s*free\b/.test(t) || /\bsecure\s+profit\b/.test(t) || /\bbreak\s*-?\s*even\b/.test(t)
  return fecharPrimeiras && protegerResto
}

/**
 * A camada de mercado passa a break-even quando a limite enche.
 *
 * Reparar no que isto NÃO é: não é fechar a primeira entrada no momento em que a segunda abre.
 * Numa venda, a limite enche mais alto — nesse instante a entrada de mercado está a perder, e
 * fechá-la aí seria realizar prejuízo e chamar-lhe break-even. O que se faz é mover-lhe o stop
 * para o próprio preço de entrada: deixa de poder perder, e fecha em zero se o mercado voltar
 * lá. Break-even é o sítio onde ela fecha, não o instante em que se mexe nela.
 */
export function stopDeBreakEven(camadaMercado: Camada): number {
  return camadaMercado.preco
}
