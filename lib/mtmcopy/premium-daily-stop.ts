import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Limite diário de STOP-LOSS do MTM Auto Premium — regra "salva-conta" do guia GMI:
 * "max 2–3 SL por dia, depois PARA. Sem revenge trading."
 * A 03/08 continuámos a operar depois de SLs grandes → pilha de −625€. Este gate corta isso.
 *
 * Config (site_settings.premium_daily_stop):  { enabled, maxSl }
 * Estado (site_settings.premium_daily_stop_state): { date: 'YYYY-MM-DD', count }  (contador do dia)
 * Tudo afinável sem redeploy; default DESLIGADO (não muda nada até ligares).
 */
export interface PremiumDailyStopConfig {
  enabled: boolean
  maxSl: number
}

const CFG_KEY = 'premium_daily_stop'
const STATE_KEY = 'premium_daily_stop_state'

function todayLisbon(): string {
  // dia de trading em Europe/Lisbon (o mercado do ouro / sessões London+NY)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())
}

export async function getPremiumDailyStopConfig(): Promise<PremiumDailyStopConfig> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_settings').select('value').eq('key', CFG_KEY).maybeSingle()
    const v = (data?.value ?? {}) as Partial<PremiumDailyStopConfig>
    return {
      enabled: v.enabled === true,
      maxSl: typeof v.maxSl === 'number' && v.maxSl > 0 ? v.maxSl : 3,
    }
  } catch {
    return { enabled: false, maxSl: 3 }
  }
}

async function getState(): Promise<{ date: string; count: number }> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_settings').select('value').eq('key', STATE_KEY).maybeSingle()
    const v = (data?.value ?? {}) as { date?: string; count?: number }
    return { date: String(v.date ?? ''), count: Number(v.count) || 0 }
  } catch {
    return { date: '', count: 0 }
  }
}

async function putState(s: { date: string; count: number }): Promise<void> {
  await getSupabaseAdmin()
    .from('site_settings')
    .upsert({ key: STATE_KEY, value: s }, { onConflict: 'key' })
}

/** +1 ao contador de SL do dia (chamar quando o Premium leva um HIT SL). Reinicia por dia. */
export async function incrementPremiumSlToday(): Promise<number> {
  const today = todayLisbon()
  const st = await getState()
  const count = st.date === today ? st.count + 1 : 1
  await putState({ date: today, count })
  return count
}

/** true = já atingiu o limite diário → NÃO abrir novas entradas Premium hoje. */
export async function isPremiumPausedToday(): Promise<{ paused: boolean; count: number; maxSl: number }> {
  const cfg = await getPremiumDailyStopConfig()
  if (!cfg.enabled) return { paused: false, count: 0, maxSl: cfg.maxSl }
  const st = await getState()
  const count = st.date === todayLisbon() ? st.count : 0
  return { paused: count >= cfg.maxSl, count, maxSl: cfg.maxSl }
}
