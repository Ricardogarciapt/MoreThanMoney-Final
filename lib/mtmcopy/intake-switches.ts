import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { INTAKE_CHANNELS, type IntakeKey } from "@/lib/mtmcopy/intake-channels"

export { INTAKE_CHANNELS, intakeKeyForChannelSlug, type IntakeKey } from "@/lib/mtmcopy/intake-channels"

/**
 * RECEÇÃO POR CANAL — corta a entrada de sinais de uma fonte, sem desligar a estratégia.
 * Diferente dos exec-switches: estes travam **a montante** (nada entra no chat, nem executa, nem
 * notifica), incluindo o que chega pelos RELAYS do VPS (Premium/Gold Did, Forex Swings/James, PrimeVerse).
 *
 * Guardado em site_settings.mtmcopy_channel_intake. Default: TUDO LIGADO (só desliga quem for
 * explicitamente posto a false) — para nunca cortar receção por omissão.
 */
const KEY = "mtmcopy_channel_intake"

export type IntakeSwitches = Record<IntakeKey, boolean>


const ALL: IntakeKey[] = INTAKE_CHANNELS.map((c) => c.key)

export async function getIntakeSwitches(): Promise<IntakeSwitches> {
  const out = Object.fromEntries(ALL.map((k) => [k, true])) as IntakeSwitches
  try {
    const { data } = await getSupabaseAdmin().from("site_settings").select("value").eq("key", KEY).maybeSingle()
    const v = (data?.value ?? {}) as Partial<Record<IntakeKey, unknown>>
    for (const k of ALL) if (v[k] === false) out[k] = false
  } catch {
    /* fail-open: em erro mantém tudo ligado (não corta receção por acidente) */
  }
  return out
}

/** Atalho: esta fonte pode entrar? (fail-open) */
export async function isIntakeEnabled(key: IntakeKey): Promise<boolean> {
  try {
    const s = await getIntakeSwitches()
    return s[key] !== false
  } catch {
    return true
  }
}

export async function setIntakeSwitches(patch: Partial<IntakeSwitches>): Promise<IntakeSwitches> {
  const current = await getIntakeSwitches()
  const next = { ...current, ...patch }
  await getSupabaseAdmin().from("site_settings").upsert(
    { key: KEY, value: next, description: "Receção de sinais por canal (corta a montante, inclui relays do VPS)", updated_at: new Date().toISOString() },
    { onConflict: "key" },
  )
  return next
}

