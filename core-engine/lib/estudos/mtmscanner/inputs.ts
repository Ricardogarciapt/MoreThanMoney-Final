/**
 * MTM Scanner — defaults dos inputs e cores do Pine v5 (docs/pine/mtm-scanner-v3.5.pine).
 */
import type { InputsMTMScanner } from './tipos'

export const INPUTS_MTMSCANNER_DEFAULT: InputsMTMScanner = {
  lengthPOC: 14,
  bSh: 'Nenhum',
  mostrarReversao: true,

  useATR: true,
  atrPeriod: 14,
  atrMultiplierSL: 1.0,
  tp1RR: 2.0,
  tp2RR: 4.0,
  tp3RR: 6.0,
  showTP1: true,
  showTP2: true,
  showTP3: true,

  entry_source: 'close',
  box_length: 4,
  box_length2: 1,
  use_cstm_entry: false,
  custom_entry: 0,

  use_RR: false,

  use_TPs: true,
  useTp1: true,
  useTp2: true,
  useTp3: true,
  slx: 0.3,
  tp1x: 0.4,
  tp2x: 0.8,
  tp3x: 1.2,
  tp4x: 0,
  tp5x: 0,

  long_alert: true,
  short_alert: true,
  order_type: 'MARKET',
  alertsOn: true,

  len: 50,
  shortLen: 3,
  bullCss: '#089981',
  bearCss: '#ff5252',
  showChoch: true,
  showBos: true,
  showIdm: true,
  idmCss: '#787B86',
  showSweeps: true,
  sweepsCss: '#787B86',
  showCircles: true,

  simbolo: 'XAUUSD',
}

/** Cores nomeadas do Pine **v5** usadas no script. */
export const PINE5_MS = {
  blue: '#2196F3',
  green: '#4CAF50',
  red: '#FF5252',
  orange: '#FF9800',
  purple: '#9C27B0',
  gray: '#787B86',
  white: '#FFFFFF',
  /** plot(dema238, color=#ffce2b) */
  dema238: '#ffce2b',
  /** gnC / rdC das fases */
  gnC: '#089981',
  rdC: '#f23645',
} as const

/** A linha de estado do TradingView (título + inputs não-bool mais visíveis). */
export function linhaDeEstadoMS(i: InputsMTMScanner): string {
  return `MoreThanMoney - Scanner V3.5 · POC ${i.lengthPOC} · ${i.useATR ? `ATR ${i.atrPeriod}×${i.atrMultiplierSL} 1:${i.tp1RR}/${i.tp2RR}/${i.tp3RR}` : `% SL ${i.slx} TP ${i.tp1x}/${i.tp2x}/${i.tp3x}`} · ${i.len}/${i.shortLen}`
}
