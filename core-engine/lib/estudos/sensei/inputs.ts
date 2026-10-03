/**
 * MTM Sensei — defaults dos inputs e paleta de tema.
 *
 * Os defaults são os do Pine (docs/pine/MTM-Sensei-X-ajustado.txt). A linha de estado do script
 * publicado mostra exatamente estes valores: 12 14 240 0000-2400 15 200 3 Momentum 9 13 1 0,25 89
 * Active ATR 14 1,5 0,5 1,5 25 2,5 25 4 25 6 25 Off 1,5 Exit 1 10 50 3 MARKET — e o título
 * «Light Scalp» é o tema + estilo por defeito.
 */
import type { InputsSensei, Tema } from './tipos'
import { corPine } from '../comum/velas'

export const INPUTS_SENSEI_DEFAULT: InputsSensei = {
  themeMode: 'Light',
  autoOpt: true,
  tradeStyle: 'Scalp',
  signalDisplay: 'Mostrar Ativo',
  minScore: 12,
  lengthPOC: 14,
  showDEMA: true,
  showPOC: true,
  useHTF: true,
  htfTF: 240,
  useSession: false,
  sessStr: '0000-2400',
  useChop: true,
  adxChopMin: 15,
  confirmClose: true,
  htfEmaLen: 200,
  allowBuy: true,
  allowSell: false,
  sellExtra: 3,
  strictAuto: false,
  phaseModeInput: 'Momentum',
  momCount: 9,
  exhCount: 13,
  showPhaseLbls: true,
  useLTFOF: true,
  ltfRes: 1,
  ofImbThr: 0.25,
  senseiLen: 89,
  senseiType: 'Active',
  showBands: true,
  showCloud: true,
  senseiBullCol: '#7C3AED',
  senseiBearCol: '#374151',
  riskMode: 'ATR',
  atrPer: 14,
  slMult: 1.5,
  slPct: 0.5,
  tp1RR: 1.5,
  pct1: 25,
  tp2RR: 2.5,
  pct2: 25,
  tp3RR: 4.0,
  pct3: 25,
  tp4RR: 6.0,
  pct4: 25,
  showTP1: true,
  showTP2: true,
  showTP3: true,
  showTP4: true,
  trailMode: 'Off',
  trailMult: 1.5,
  beMoveMode: 'Exit 1',
  bePoints: 10,
  beCompletes: false,
  dynLevels: false,
  showConfPanel: true,
  showSetupRules: true,
  showTradePanel: true,
  showStats: true,
  smcLen: 50,
  smcShortLen: 3,
  bullCss: '#089981',
  bearCss: '#ff5252',
  showChoch: true,
  showBos: true,
  showIdm: true,
  idmCss: '#787B86', // color.gray do Pine v6
  showSweeps: true,
  sweepsCss: '#787B86',
  showCircles: true,
  showOB: true,
  alert_watchlist: true,
  order_type: 'MARKET',
  simbolo: 'XAUUSD',
  fusoSessao: 'UTC',
}

/** Cores nomeadas do Pine v6 que o script usa. */
export const PINE = {
  red: '#F23645',
  orange: '#FF9800',
  gray: '#787B86',
  white: '#FFFFFF',
} as const

/** color.new(cor, transp) do Pine — vive em ../comum/velas (partilhado); reexportado aqui. */
export { corPine } from '../comum/velas'

/** Paleta th_* do Pine, por tema. Cores já com a transparência que o Pine lhes aplica. */
export interface PaletaSensei {
  bg: string
  bg2: string
  text: string
  text2: string
  bull: string
  bear: string
  accent: string
  gold: string
  ok: string
  fail: string
  entryLine: string
  buyBadge: string
  sellBadge: string
  slLine: string
  beLine: string
  tp1Line: string
  tp2Line: string
  tp3Line: string
  tp4Line: string
  /** hex puros (sem transparência) para quem precisar de derivar com corPine */
  hex: Record<'bull' | 'bear' | 'accent' | 'entryLine' | 'slLine' | 'beLine' | 'tp1Line' | 'tp2Line' | 'tp3Line' | 'tp4Line', string>
}

export function paletaSensei(tema: Tema): PaletaSensei {
  const pop = tema === 'Pop'
  const light = tema === 'Light'
  const hex = {
    bull: pop ? '#00FF88' : light ? '#166534' : '#22C55E',
    bear: pop ? '#FF0055' : light ? '#991B1B' : '#EF4444',
    accent: tema === 'Dark' ? '#7C3AED' : tema === 'Classic' ? '#4F46E5' : light ? '#7C3AED' : '#CC00FF',
    entryLine: tema === 'Classic' ? '#4F46E5' : pop ? '#CC00FF' : '#7C3AED',
    slLine: pop ? '#FF0055' : PINE.red,
    beLine: pop ? '#FF8800' : PINE.orange,
    tp1Line: pop ? '#00FF88' : '#22C55E',
    tp2Line: pop ? '#00CC66' : '#16A34A',
    tp3Line: pop ? '#009944' : '#15803D',
    tp4Line: pop ? '#007733' : '#0F766E',
  }
  return {
    bg: tema === 'Dark' ? corPine('#0D0D1A', 5) : tema === 'Classic' ? corPine('#0F172A', 5) : light ? corPine('#F0F4FF', 8) : corPine('#1A0030', 5),
    bg2: tema === 'Dark' ? corPine('#131325', 10) : tema === 'Classic' ? corPine('#1E1B4B', 10) : light ? corPine('#E0EAFF', 10) : corPine('#2D0047', 10),
    text: light ? '#1E1B4B' : '#FFFFFF',
    text2: light ? '#374151' : '#94A3B8',
    bull: hex.bull,
    bear: hex.bear,
    accent: hex.accent,
    gold: pop ? '#FFD700' : '#F59E0B',
    ok: pop ? '#00FF88' : light ? '#166534' : '#4ADE80',
    fail: pop ? '#FF0055' : light ? '#991B1B' : '#F87171',
    entryLine: hex.entryLine,
    buyBadge: pop ? corPine('#00FF88', 15) : light ? corPine('#166534', 15) : corPine('#7C3AED', 15),
    sellBadge: pop ? corPine('#FF0055', 15) : light ? corPine('#991B1B', 15) : corPine('#DC2626', 15),
    slLine: hex.slLine,
    beLine: hex.beLine,
    tp1Line: hex.tp1Line,
    tp2Line: hex.tp2Line,
    tp3Line: hex.tp3Line,
    tp4Line: hex.tp4Line,
    hex,
  }
}
