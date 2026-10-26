/**
 * OS SÍMBOLOS DO SENSEI (pedido do dono, 26/10/2026): só BTCUSD e XAUUSD.
 *
 * O Sensei X mandava também outros perpétuos cripto; passa a ficar só com o Bitcoin (qualquer
 * forma do ticker — BTCUSD, BTCUSDT, BTCUSDT.P, com ou sem bolsa à frente) e o ouro (XAUUSD/GOLD).
 * Uma ENTRADA noutro símbolo é recusada; os seguimentos não passam por aqui (ligam-se à entrada).
 *
 * Puro: sem base, sem rede.
 */
const BASES_SENSEI = new Set(['BTCUSD', 'XAUUSD'])

/** BINANCE:BTCUSDT.P → BTCUSD · OANDA:XAUUSD → XAUUSD · GOLD → XAUUSD. */
export function simboloCanonico(simbolo: string | null | undefined): string {
  let s = String(simbolo ?? '').trim().toUpperCase()
  s = s.replace(/^[A-Z0-9_]+:/, '').replace(/\.P$/, '').replace(/PERP$/, '')
  if (s === 'GOLD') return 'XAUUSD'
  if (s.endsWith('USDT') || s.endsWith('USDC')) s = s.slice(0, -1)
  return s
}

function eSensei(estrategia: string | null | undefined): boolean {
  return String(estrategia ?? '').toLowerCase().includes('sensei')
}

/** O símbolo é aceite para esta estratégia? Só o Sensei tem lista; sem símbolo, aceita-se. */
export function simboloAceite(estrategia: string | null | undefined, simbolo: string | null | undefined): boolean {
  if (!eSensei(estrategia)) return true
  if (!String(simbolo ?? '').trim()) return true
  return BASES_SENSEI.has(simboloCanonico(simbolo))
}
