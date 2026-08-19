import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getPropFirmPreset } from './prop-firm-presets'

/**
 * Guarda de conta financiada — corre ANTES de abrir qualquer trade.
 *
 * Três regras, todas medidas sobre EQUITY (o flutuante conta, é o que distingue
 * uma conta Equity Edge de um challenge clássico medido a saldo):
 *
 *  1. Almofada (cushion) — a distância entre a equity e o chão de drawdown. O risco
 *     de cada trade nunca passa uma fatia da almofada, e a zero fecha-se a torneira.
 *     O chão arrasta com os máximos até a conta ganhar `maxDrawdownPct`; a partir daí
 *     trava no saldo inicial e o lucro acumulado deixa de estar em risco.
 *
 *  2. Consistência — nenhum dia pode valer mais do que `consistencyMaxDayShare` do
 *     lucro total. Passado esse limite não se abrem mais entradas nesse dia: um dia
 *     desproporcional invalida o payout, mesmo com a conta em lucro.
 *
 *  3. Drawdown diário — perder mais do que `dailyDrawdownPct` da equity com que o
 *     dia abriu fecha o dia.
 *
 * Estado (equity de abertura do dia e máximo histórico) em `site_settings`, chave
 * `prop_firm_guard_state`, por conta MetaApi.
 */

export interface PropFirmRules {
  /** Drawdown total máximo, fração do saldo inicial. */
  maxDrawdownPct: number
  /** Drawdown diário máximo, fração da equity de abertura do dia. */
  dailyDrawdownPct: number
  /** Fatia máxima do lucro total que um único dia pode representar. */
  consistencyMaxDayShare: number
  /** Fatia máxima da almofada que uma trade pode arriscar. */
  cushionRiskShare: number
}

/** Regras reais da Equity Edge: 6% de drawdown total, 4% diário (confirmadas pelo Ricardo). */
export const EQUITY_EDGE_RULES: PropFirmRules = {
  maxDrawdownPct: 0.06,
  dailyDrawdownPct: 0.04,
  consistencyMaxDayShare: 0.3,
  cushionRiskShare: 0.25,
}

const RULES_BY_TYPE: Record<string, PropFirmRules> = {
  equity_edge: EQUITY_EDGE_RULES,
  ftmo: { maxDrawdownPct: 0.1, dailyDrawdownPct: 0.05, consistencyMaxDayShare: 0.4, cushionRiskShare: 0.25 },
  fundednext: { maxDrawdownPct: 0.1, dailyDrawdownPct: 0.05, consistencyMaxDayShare: 0.4, cushionRiskShare: 0.25 },
}

export function propFirmRules(type: string | null | undefined): PropFirmRules | null {
  if (!type) return null
  return RULES_BY_TYPE[type] ?? null
}

const STATE_KEY = 'prop_firm_guard_state'

interface AccountState {
  day: string
  day_start_equity: number
  high_water: number
  /** Lucro fechado por dia (YYYY-MM-DD → lucro), para a regra de consistência. */
  day_profit: Record<string, number>
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function readState(): Promise<Record<string, AccountState>> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_settings')
      .select('value')
      .eq('key', STATE_KEY)
      .maybeSingle()
    const v = data?.value
    if (v && typeof v === 'object') return v as Record<string, AccountState>
  } catch {
    /* fail-open: sem estado, a guarda usa só o que consegue medir agora */
  }
  return {}
}

async function writeState(state: Record<string, AccountState>): Promise<void> {
  try {
    await getSupabaseAdmin().from('site_settings').upsert(
      {
        key: STATE_KEY,
        value: state,
        description: 'Estado das guardas de conta financiada (almofada, consistência, DD diário)',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
  } catch {
    /* não bloqueia a execução */
  }
}

export interface PropFirmVerdict {
  /** Pode abrir? */
  allow: boolean
  /** Motivo do bloqueio (para log e para o chat). */
  reason?: string
  /** Tecto de risco em moeda da conta — a trade é encolhida até caber. */
  maxRiskAmount: number
  almofada: number
  lucroTotal: number
  lucroHoje: number
}

export interface PropFirmInput {
  accountId: string
  propFirmType: string | null | undefined
  /** Saldo inicial da conta financiada (baseline_balance). */
  baseline: number | null | undefined
  equity: number
  balance: number
}

/**
 * Avalia as três regras e devolve o veredicto + o tecto de risco.
 * Fail-open: sem tipo de prop firm ou sem baseline, deixa passar sem tecto.
 */
export async function evaluatePropFirmGuard(input: PropFirmInput): Promise<PropFirmVerdict> {
  const rules = propFirmRules(input.propFirmType)
  const baseline = input.baseline && input.baseline > 0 ? input.baseline : null
  if (!rules || !baseline) {
    return { allow: true, maxRiskAmount: Infinity, almofada: Infinity, lucroTotal: 0, lucroHoje: 0 }
  }

  const equity = input.equity
  const dia = today()
  const state = await readState()
  const prev = state[input.accountId]

  const highWater = Math.max(prev?.high_water ?? baseline, equity)
  const novoDia = prev?.day !== dia
  const dayStartEquity = novoDia ? equity : prev.day_start_equity
  const dayProfitMap = prev?.day_profit ?? {}

  const lucroTotal = equity - baseline
  const lucroHoje = equity - dayStartEquity

  state[input.accountId] = {
    day: dia,
    day_start_equity: dayStartEquity,
    high_water: highWater,
    day_profit: { ...dayProfitMap, [dia]: lucroHoje },
  }
  await writeState(state)

  // ── 1. Almofada ─────────────────────────────────────────────────────────
  // O chão arrasta com os máximos até a conta ganhar maxDrawdownPct; depois trava
  // no saldo inicial, e o lucro acumulado deixa de estar exposto.
  const travado = highWater >= baseline * (1 + rules.maxDrawdownPct)
  const chao = travado ? baseline : Math.max(baseline * (1 - rules.maxDrawdownPct), highWater - baseline * rules.maxDrawdownPct)
  const almofada = equity - chao
  const maxRiskAmount = Math.max(0, almofada * rules.cushionRiskShare)

  const base = { almofada, lucroTotal, lucroHoje, maxRiskAmount }

  if (almofada <= 0) {
    return { ...base, allow: false, reason: `almofada esgotada (equity ${equity.toFixed(2)} ≤ chão ${chao.toFixed(2)})` }
  }

  // ── 2. Drawdown diário ──────────────────────────────────────────────────
  if (lucroHoje < 0 && Math.abs(lucroHoje) >= dayStartEquity * rules.dailyDrawdownPct) {
    return {
      ...base,
      allow: false,
      reason: `limite diário atingido (${lucroHoje.toFixed(2)} de ${(dayStartEquity * rules.dailyDrawdownPct).toFixed(2)})`,
    }
  }

  // ── 3. Consistência ─────────────────────────────────────────────────────
  // Só morde com lucro total positivo: sem lucro não há payout a proteger.
  if (lucroTotal > 0 && lucroHoje > 0 && lucroHoje >= lucroTotal * rules.consistencyMaxDayShare) {
    return {
      ...base,
      allow: false,
      reason: `regra de consistência: hoje já vale ${((100 * lucroHoje) / lucroTotal).toFixed(0)}% do lucro total (máx. ${(100 * rules.consistencyMaxDayShare).toFixed(0)}%)`,
    }
  }

  return { ...base, allow: true }
}

/** Etiqueta legível da conta financiada, para logs e para o chat. */
export function propFirmLabel(type: string | null | undefined): string {
  return getPropFirmPreset(type)?.label ?? 'conta financiada'
}
