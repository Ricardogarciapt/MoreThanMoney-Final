/**
 * REGRAS DO TICKET QUE NÃO SÃO CONTAS — puras, testadas em lib/webtrader/__tests__/ticket.check.ts.
 *
 * Volume pelo RISCO ($ ou % do saldo): o lote sai de risco ÷ (distância ao SL × valor por unidade de
 * preço). O SL tem então de vir em DISTÂNCIA — preço ou pips. Com o SL em «$» ou «%» a conta ficava
 * circular (o dinheiro do SL É o risco, e o lote é que o transformaria em preço): o ticket mostrava
 * «Define o SL para calcular o lote» e o campo do SL ficava só de leitura — nunca saía lote e o
 * BUY/SELL não passava ao resumo (pedido do dono, 18/09, XAUUSD no Simple).
 *
 * Por isso, no modo risco, SL/TP escrevem-se em Preço ou Pips: ao entrar no modo risco com «$»/«%»
 * escolhido passa-se a Pips, e esses dois segmentos ficam desactivados até voltar ao Lote.
 */

export type ModoVolumeTicket = 'lote' | 'risco_usd' | 'risco_pct'
export type ModoNiveisTicket = 'preco' | 'pips' | 'usd' | 'pct'

export const emModoRisco = (m: ModoVolumeTicket) => m !== 'lote'

/** O modo dos níveis que vale com este modo de volume (no risco, «$»/«%» passam a Pips). */
export function modoNiveisEfectivo(volume: ModoVolumeTicket, niveis: ModoNiveisTicket): ModoNiveisTicket {
  return emModoRisco(volume) && (niveis === 'usd' || niveis === 'pct') ? 'pips' : niveis
}

/** Este segmento do SL/TP pode ser escolhido com este modo de volume? */
export function modoNiveisPermitido(volume: ModoVolumeTicket, niveis: ModoNiveisTicket): boolean {
  return modoNiveisEfectivo(volume, niveis) === niveis
}
