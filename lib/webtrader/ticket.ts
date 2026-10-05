import { normalizarVolumeRegra } from './regras-ordem'
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

// ── o ticket das contas REAIS (TradeLocker/MT5) ───────────────────────────────────────────────

/** Texto do utilizador → número (vírgula ou ponto). '' → null; lixo → NaN (é erro, não «vazio»). */
export function numeroDoCampo(texto: string): number | null {
  const t = String(texto ?? '').trim()
  if (!t) return null
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return Number.NaN
  return Number(t.replace(',', '.'))
}

export type TicketReal =
  | { ok: true; volume: number; preco: number | null; sl: number | null; tp: number | null }
  | { ok: false; erro: string }

/**
 * Valida o ticket de uma conta real antes de ir para a corretora. O preço do ecrã é indicativo
 * (feed MTM), por isso o lado do SL/TP fica para a corretora validar; aqui só o que é inequívoco:
 * números a sério, lote positivo, no passo e acima do mínimo, e o preço da pendente.
 */
export function validarTicketReal(c: {
  tipo: 'mercado' | 'limit' | 'stop'
  volume: string; preco: string; sl: string; tp: string
  volumeMin: number; passo: number
}): TicketReal {
  const volume = numeroDoCampo(c.volume)
  if (volume == null || !Number.isFinite(volume) || !(volume > 0)) return { ok: false, erro: 'Volume inválido.' }
  // A regra do lote é a partilhada (regras-ordem.ts), em modo estrito: aqui o trader escreveu o
  // lote à mão e um 0,015 que saísse 0,02 era uma surpresa com dinheiro real.
  const v = normalizarVolumeRegra(volume, { min: c.volumeMin, max: 0, passo: c.passo }, { estrito: true })
  if (!v.ok) return { ok: false, erro: `${v.erro.charAt(0).toUpperCase()}${v.erro.slice(1)}.` }
  const volumeNoPasso = v.volume
  let preco: number | null = null
  if (c.tipo !== 'mercado') {
    preco = numeroDoCampo(c.preco)
    if (preco == null || !Number.isFinite(preco) || !(preco > 0)) return { ok: false, erro: 'Indica o preço da ordem pendente.' }
  }
  const sl = numeroDoCampo(c.sl)
  if (sl != null && !(Number.isFinite(sl) && sl > 0)) return { ok: false, erro: 'O SL não é um preço válido (deixa em branco para não pôr).' }
  const tp = numeroDoCampo(c.tp)
  if (tp != null && !(Number.isFinite(tp) && tp > 0)) return { ok: false, erro: 'O TP não é um preço válido (deixa em branco para não pôr).' }
  return { ok: true, volume: volumeNoPasso, preco, sl, tp }
}
