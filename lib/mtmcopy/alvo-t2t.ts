/**
 * QUE LIGAÇÕES RECEBEM O TAP TO TRADE (fan-out) — a regra num só sítio, sem base nem rede.
 *
 * Uma ligação entra no T2T quando:
 *   · foi marcada (`t2t_enabled = true`) — uma conta de cópia com o T2T por cima; ou
 *   · é a conta dedicada (`purpose = 'tap_to_trade'`) e NINGUÉM o desligou (`t2t_enabled` ≠ false).
 *
 * O `t2t_enabled = false` numa conta dedicada já era o «desligado nesta conta» do ligador
 * (lib/contas/ligador.ts) e do interruptor por conta no T2T (tap-to-trade-feed), mas a aceitação
 * ignorava-o e abria na mesma. E é assim que nascem as contas TradeLocker ligadas A PARTIR DO
 * WEBTRADER (lib/webtrader/entrar.ts, 2026-09): ligadas para negociar à mão, sem ordens automáticas
 * até a pessoa ligar o T2T no ligador ou no T2T. As do ligador continuam a nascer sem a bandeira
 * (null) — para elas nada muda.
 */
export interface LigacaoT2T {
  purpose?: string | null
  t2t_enabled?: boolean | null
}

export function recebeT2T(c: LigacaoT2T | null | undefined): boolean {
  if (!c) return false
  if (c.t2t_enabled === true) return true
  return c.purpose === 'tap_to_trade' && c.t2t_enabled !== false
}

/** A conta é do T2T mas foi desligada nesta conta (mostra-se, não executa). */
export function t2tDesligadoNaConta(c: LigacaoT2T | null | undefined): boolean {
  return Boolean(c && c.purpose === 'tap_to_trade' && c.t2t_enabled === false)
}
