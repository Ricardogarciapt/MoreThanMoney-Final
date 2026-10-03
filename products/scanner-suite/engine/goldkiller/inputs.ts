/**
 * MTM GoldKiller — defaults dos inputs e cores do Pine v5.
 *
 * Defaults = os do Pine (docs/pine/mtm-goldkiller-alertas.pine). A linha de estado do script
 * publicado mostra exatamente: HLCC4 -4 80 0 3 10 Disabled 75
 *   source=HLCC4 · show=-4 · scale=80 · window=0 · mult=3 · atr=10 · average=Disabled · rank=75
 * (stop, unique e alertsOn são bool — o TradingView não os mostra na linha de estado).
 */
import type { InputsGoldKiller } from './tipos'

export const INPUTS_GOLDKILLER_DEFAULT: InputsGoldKiller = {
  source: 'HLCC4',
  stop: true,
  show: -4,
  scale: 80,
  window: 0,
  unique: false,
  mult: 3,
  atr: 10,
  average: 'Disabled',
  rank: 75,
  alertsOn: true,
  simbolo: 'XAUUSD',
}

/**
 * Cores nomeadas do Pine **v5** (o script é //@version=5 — no v6 o red/green mudaram de tom).
 * Transparências usadas no script: níveis 100→70, 90→60, 75→50, 50→40, 25→30; fills 98; médias 25/70.
 */
export const PINE5 = {
  green: '#4CAF50',
  red: '#FF5252',
  gray: '#787B86',
  blue: '#2196F3',
  purple: '#9C27B0',
  white: '#FFFFFF',
} as const

/** Transparência de cada nível no plot() do Pine. */
export const TRANSP_NIVEL: Record<25 | 50 | 75 | 90 | 100, number> = { 100: 70, 90: 60, 75: 50, 50: 40, 25: 30 }

/** A linha de estado do TradingView para estes inputs (título + valores não-bool). */
export function linhaDeEstadoGK(i: InputsGoldKiller): string {
  return `MTM Gold Killer - ${i.source} ${i.show} ${i.scale} ${i.window} ${i.mult} ${i.atr} ${i.average} ${i.rank}`
}
