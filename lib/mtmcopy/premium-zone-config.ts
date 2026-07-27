import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

/**
 * Configuração da ENTRADA POR ZONA + REAÇÃO do Premium (runtime, sem redeploy).
 * Guardada em site_settings.value (jsonb) na key 'mtmcopy_premium_zone'.
 *
 * Em vez de entrar a mercado no instante do sinal, o Premium guarda o sinal como PENDENTE
 * (mtmcopy_premium_pending) com a zona [low,high] e só entra quando um GATILHO dispara:
 *   A) trig_tv        — alerta TradingView (Pine) de reação dentro da zona (o mais forte)
 *   C) trig_reconfirm — servidor: preço entra na zona e reconfirma na direção
 *   B) trig_touch     — servidor: preço só toca na zona (rede final, mais permissivo)
 * Prioridade A → C → B.
 *
 * mode:
 *   'off'    — comportamento atual (entra a mercado no sinal). NADA muda.
 *   'shadow' — entra a mercado no sinal COMO HOJE (trades reais iguais) E regista em paralelo
 *              o que a entrada-por-zona TERIA feito (para comparar sem risco).
 *   'live'   — NÃO entra no sinal; cria pendente e entra só no gatilho.
 */
export interface PremiumZoneConfig {
  mode: "off" | "shadow" | "live"
  trig_tv: boolean
  trig_reconfirm: boolean
  trig_touch: boolean
  expiry_min: number
  cancel_on_sl_break: boolean
}

const KEY = "mtmcopy_premium_zone"

export const DEFAULT_PREMIUM_ZONE_CONFIG: PremiumZoneConfig = {
  mode: "off", // seguro por defeito — não muda nada até ser ligado
  trig_tv: true,
  trig_reconfirm: true,
  trig_touch: false,
  expiry_min: 30,
  cancel_on_sl_break: true,
}

export async function getPremiumZoneConfig(): Promise<PremiumZoneConfig> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle()
    const v = (data?.value ?? {}) as Partial<PremiumZoneConfig>
    const mode = v.mode === "shadow" || v.mode === "live" ? v.mode : "off"
    const expiry = Number(v.expiry_min)
    return {
      mode,
      trig_tv: v.trig_tv !== false,
      trig_reconfirm: v.trig_reconfirm !== false,
      trig_touch: v.trig_touch === true,
      expiry_min: Number.isFinite(expiry) && expiry > 0 ? Math.min(expiry, 720) : 30,
      cancel_on_sl_break: v.cancel_on_sl_break !== false,
    }
  } catch {
    return { ...DEFAULT_PREMIUM_ZONE_CONFIG }
  }
}

export async function setPremiumZoneConfig(patch: Partial<PremiumZoneConfig>): Promise<PremiumZoneConfig> {
  const current = await getPremiumZoneConfig()
  const next: PremiumZoneConfig = { ...current, ...patch }
  await getSupabaseAdmin()
    .from("site_settings")
    .upsert(
      { key: KEY, value: next, description: "Config entrada por zona+reação (Premium)", updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
  return next
}

/** Direção-aware: o preço está dentro da zona [low,high]? (com pequena folga). */
export function priceInZone(price: number, low: number, high: number, tolFrac = 0.0002): boolean {
  if (!(price > 0) || !(low > 0) || !(high > 0)) return false
  const lo = Math.min(low, high)
  const hi = Math.max(low, high)
  const tol = ((lo + hi) / 2) * tolFrac
  return price >= lo - tol && price <= hi + tol
}
