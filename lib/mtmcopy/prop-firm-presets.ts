/**
 * Presets de risco para contas financiadas (prop firms).
 * Objectivo: passar contas e mantê-las — risco conservador + parciais + trades manuais.
 */

export type PropFirmType = 'ftmo' | 'fundednext' | 'equity_edge'

export interface PropFirmPreset {
  id: PropFirmType
  label: string
  description: string
  /** Risco máximo por trade (% equity) */
  maxRiskPercent: number
  lotMode: 'risk_percent' | 'multiplier' | 'fixed'
  lotValue: number
  exitPctTp1: number
  exitPctTp2: number
  exitPctTp3: number
  copySl: boolean
  copyTp: boolean
  copyAsManual: boolean
  /** CopyFactory: não copiar ordens pendentes → entradas a mercado (aspecto manual) */
  skipPendingOrders: boolean
  /** Limites CopyFactory (fracção do saldo, ex. 0.05 = 5% DD diário) */
  riskLimits: Array<{
    type: 'day' | 'week' | 'month'
    applyTo: 'balance-difference' | 'equity-difference'
    closePositions: boolean
    maxRelativeRisk: number
  }>
  consistencyHint: string
}

export const PROP_FIRM_PRESETS: Record<PropFirmType, PropFirmPreset> = {
  ftmo: {
    id: 'ftmo',
    label: 'FTMO',
    description: 'Challenge FTMO — risco diário ~5%, total ~10%, 1 posição com parciais.',
    maxRiskPercent: 0.25,
    lotMode: 'risk_percent',
    lotValue: 0.25,
    exitPctTp1: 33,
    exitPctTp2: 33,
    exitPctTp3: 34,
    copySl: true,
    copyTp: false,
    copyAsManual: true,
    skipPendingOrders: true,
    riskLimits: [
      {
        type: 'day',
        applyTo: 'balance-difference',
        closePositions: true,
        maxRelativeRisk: 0.05,
      },
      {
        type: 'month',
        applyTo: 'balance-difference',
        closePositions: true,
        maxRelativeRisk: 0.1,
      },
    ],
    consistencyHint:
      'Evita dias de lucro desproporcionais; mantém risco ≤0,25% por trade e parciais 33/33/34.',
  },
  fundednext: {
    id: 'fundednext',
    label: 'FundedNext',
    description: 'Challenge FundedNext — risco diário ~5%, consistência, parciais progressivas.',
    maxRiskPercent: 0.3,
    lotMode: 'risk_percent',
    lotValue: 0.3,
    exitPctTp1: 40,
    exitPctTp2: 35,
    exitPctTp3: 25,
    copySl: true,
    copyTp: false,
    copyAsManual: true,
    skipPendingOrders: true,
    riskLimits: [
      {
        type: 'day',
        applyTo: 'balance-difference',
        closePositions: true,
        maxRelativeRisk: 0.05,
      },
      {
        type: 'week',
        applyTo: 'balance-difference',
        closePositions: true,
        maxRelativeRisk: 0.08,
      },
    ],
    consistencyHint:
      'Regra de consistência: evita concentrar >40% do lucro num único dia; usa parciais 40/35/25.',
  },
  equity_edge: {
    id: 'equity_edge',
    label: 'Equity Edge',
    description:
      'Conta financiada Equity Edge — drawdown medido sobre EQUITY (o flutuante conta), por isso os limites aplicam-se a equity-difference e fecham posições.',
    maxRiskPercent: 0.25,
    lotMode: 'risk_percent',
    lotValue: 0.25,
    exitPctTp1: 33,
    exitPctTp2: 33,
    exitPctTp3: 34,
    copySl: true,
    copyTp: true,
    copyAsManual: true,
    skipPendingOrders: true,
    riskLimits: [
      {
        type: 'day',
        applyTo: 'equity-difference',
        closePositions: true,
        maxRelativeRisk: 0.03,
      },
      {
        type: 'month',
        applyTo: 'equity-difference',
        closePositions: true,
        maxRelativeRisk: 0.06,
      },
    ],
    consistencyHint:
      'Drawdown por equity: o flutuante conta para o limite. Risco ≤0,25%/trade, SL sempre copiado, sem ordens pendentes, parciais 33/33/34.',
  },
}

export function getPropFirmPreset(type: string | null | undefined): PropFirmPreset | null {
  if (type === 'ftmo' || type === 'fundednext' || type === 'equity_edge') return PROP_FIRM_PRESETS[type]
  return null
}

/** Aplica preset aos campos editáveis da ligação. */
export function applyPropFirmToConnectionPatch(
  type: PropFirmType,
): Record<string, unknown> {
  const p = PROP_FIRM_PRESETS[type]
  return {
    prop_firm_type: type,
    copy_as_manual: p.copyAsManual,
    max_risk_percent: p.maxRiskPercent,
    lot_mode: p.lotMode,
    lot_value: p.lotValue,
    exit_pct_tp1: p.exitPctTp1,
    exit_pct_tp2: p.exitPctTp2,
    exit_pct_tp3: p.exitPctTp3,
    copy_sl: p.copySl,
    copy_tp: p.copyTp,
    is_audited: true,
    audit_label: `${p.label} · conta financiada`,
  }
}

export const MANUAL_TRADE_COMMENT_PREFIX = 'MTM-M'
