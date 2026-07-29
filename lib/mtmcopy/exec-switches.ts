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
  goldkiller: boolean // MTM Auto GoldKiller (conta SDNb / 181271197)
  /** Monitor de preço Premium: fecha parciais/BE/trailing por PREÇO (não por mensagem).
   *  Default FALSE — ligar só depois de validar em demo. */
  premium_price_monitor: boolean
  /** Espelha os exits Premium (parcial/BE/trailing/fecho) DIRETAMENTE em cada conta de
   *  subscritor via MetaAPI — o CopyFactory não replica fechos PARCIAIS. Default FALSE
   *  (kill-switch: dinheiro real de subscritores). Ligar quando validado. */
  premium_subscriber_exits: boolean
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
      goldkiller: v.goldkiller !== false, // default ON
      premium_price_monitor: v.premium_price_monitor === true, // default OFF
      premium_subscriber_exits: v.premium_subscriber_exits === true, // default OFF (dinheiro real)
    }
  } catch {
    return {
      sensei: true,
      forex: true,
      premium: true,
      goldkiller: true,
      premium_price_monitor: false,
      premium_subscriber_exits: false,
    }
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
