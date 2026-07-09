import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

/**
 * Interruptores por-execução do MTM Copy (runtime, sem redeploy).
 * Guardados em site_settings.value (jsonb) na key 'mtmcopy_exec_switches'.
 * Cada provider pode ser ligado/desligado de forma independente.
 */
export interface ExecSwitches {
  sensei: boolean // Ouro/BTC (conta Sensei)
  forex: boolean // MTM Auto Forex (conta 5IHE)
  premium: boolean // MTM Auto Premium
}

const KEY = "mtmcopy_exec_switches"

export async function getExecSwitches(): Promise<ExecSwitches> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle()
    const v = (data?.value ?? {}) as Partial<ExecSwitches>
    // Default = ligado (não altera o comportamento existente enquanto não for tocado)
    return {
      sensei: v.sensei !== false,
      forex: v.forex !== false,
      premium: v.premium !== false,
    }
  } catch {
    return { sensei: true, forex: true, premium: true }
  }
}

export async function setExecSwitches(patch: Partial<ExecSwitches>): Promise<ExecSwitches> {
  const current = await getExecSwitches()
  const next: ExecSwitches = { ...current, ...patch }
  await getSupabaseAdmin()
    .from("site_settings")
    .upsert(
      { key: KEY, value: next, description: "Interruptores por-execução MTM Copy", updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
  return next
}
