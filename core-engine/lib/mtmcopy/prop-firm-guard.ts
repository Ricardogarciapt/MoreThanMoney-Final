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
  /**
   * A que horas — e em que fuso — começa o dia de negociação da prop firm.
   *
   * Sem isto o dia era o dia UTC. A FXIFY conta o dia das 17:00 EST às 17:00 EST: com o
   * contador a reiniciar à meia-noite UTC, dava para perder 8% antes da meia-noite e outros
   * 8% depois — dois dias para nós, um só para eles, e a conta rebentava com a guarda a dizer
   * que estava tudo bem. Ausente = dia UTC, como sempre foi.
   */
  diaComeca?: { hora: number; fuso: string }
}

/** Regras reais da Equity Edge, confirmadas pelo Ricardo: 6% de drawdown total, 4% diário,
 *  consistência a 50% (nenhum dia pode valer mais de metade do lucro total). */
export const EQUITY_EDGE_RULES: PropFirmRules = {
  maxDrawdownPct: 0.06,
  dailyDrawdownPct: 0.04,
  consistencyMaxDayShare: 0.5,
  cushionRiskShare: 0.25,
}

/**
 * FXIFY, tal como o Ricardo as leu do painel deles:
 *  · perda diária 8% — sobre a EQUITY, contra o saldo de FECHO do dia anterior (17:00 EST);
 *  · drawdown máximo 8% — ARRASTA o saldo fechado até a conta ganhar 8% e trava aí (ou quando
 *    sai um pagamento). É a mecânica que a guarda já fazia: o chão segue os máximos até
 *    `maxDrawdownPct` de lucro e depois fixa-se no saldo inicial.
 *
 * A consistência fica a 1 (sem limite) de propósito: a FXIFY pode ter regra de consistência,
 * mas não me foi dada. Inventar uma percentagem era bloquear trades por uma regra imaginada.
 */
export const FXIFY_RULES: PropFirmRules = {
  maxDrawdownPct: 0.08,
  dailyDrawdownPct: 0.08,
  consistencyMaxDayShare: 1,
  cushionRiskShare: 0.25,
  diaComeca: { hora: 17, fuso: 'America/New_York' },
}

const RULES_BY_TYPE: Record<string, PropFirmRules> = {
  fxify: FXIFY_RULES,
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

/**
 * O dia de negociação segundo as regras da prop firm.
 *
 * Sem `diaComeca` é o dia UTC. Com ele, o dia vira à hora indicada no fuso indicado: passada
 * essa hora já se está no dia seguinte, que é como a FXIFY conta a partir das 17:00 EST.
 */
export function diaDeNegociacao(rules: PropFirmRules | null, quando: Date = new Date()): string {
  if (!rules?.diaComeca) return quando.toISOString().slice(0, 10)
  const { hora, fuso } = rules.diaComeca
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(quando)
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? '00'
  const dataLocal = `${get('year')}-${get('month')}-${get('day')}`
  // `hour12:false` devolve 24 à meia-noite nalgumas plataformas.
  const horaLocal = Number(get('hour')) % 24
  if (horaLocal < hora) return dataLocal
  const d = new Date(`${dataLocal}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
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
  // O dia é o da PROP FIRM, não o dia UTC — a FXIFY vira às 17:00 EST.
  const dia = diaDeNegociacao(rules)
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
