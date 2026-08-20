import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { pipSizeForSymbol } from './trade-outcome'

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
  /** Janela (pips) além da ponta da zona onde ainda se ESPERA reação (limite). Fora dela entra a mercado. */
  flee_pips: number
  /** Espaço mínimo (pips) até ao TP1 para entrar a mercado (evita entrar colado ao TP). */
  min_room_pips: number
  /**
   * Nº de CAMADAS de entrada por sinal (position building na zona). 1 = comportamento clássico
   * (1 perna com o lote total). 2 = divide o MESMO lote/risco em 2 pernas: a 1ª na metade da zona
   * mais perto do preço (entra na reação inicial), a 2ª na metade mais funda (entra se o preço
   * aprofundar). Mantém o risco total; só faz média na zona. Requer mode='live' + zona no sinal.
   */
  layers: number
}

const KEY = "mtmcopy_premium_zone"

export const DEFAULT_PREMIUM_ZONE_CONFIG: PremiumZoneConfig = {
  mode: "off", // seguro por defeito — não muda nada até ser ligado
  trig_tv: true,
  trig_reconfirm: true,
  trig_touch: false,
  expiry_min: 30,
  cancel_on_sl_break: true,
  flee_pips: 50,
  min_room_pips: 30,
  layers: 1,
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
      flee_pips: Number.isFinite(Number(v.flee_pips)) && Number(v.flee_pips) > 0 ? Number(v.flee_pips) : 50,
      min_room_pips: Number.isFinite(Number(v.min_room_pips)) && Number(v.min_room_pips) >= 0 ? Number(v.min_room_pips) : 30,
      layers: Number.isFinite(Number(v.layers)) && Number(v.layers) >= 1 ? Math.min(Math.floor(Number(v.layers)), 3) : 1,
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

/**
 * Decisão de entrada por zona (MESMA regra do zone-monitor, para ser expedito já no sinal):
 *  - 'market'  → preço FAVORÁVEL (dentro/além da zona no bom sentido) OU já FUGIU além da ponta (>flee) → entra a mercado.
 *  - 'pending' → preço na PONTA da zona (janela ±flee além da aresta) → espera reação (o limite).
 *  - 'skip'    → ia entrar a mercado mas já não há espaço até ao TP1 (evita entrar colado ao alvo).
 */
export function zoneEntryDecision(opts: {
  direction: "buy" | "sell"
  price: number
  zoneLow: number
  zoneHigh: number
  tp1?: number | null
  symbol: string
  fleePips?: number
  minRoomPips?: number
}): "market" | "pending" | "skip" {
  const { direction, price, zoneLow, zoneHigh, tp1, symbol } = opts
  if (!(price > 0)) return "pending"
  const pip = pipSizeForSymbol(symbol)
  const fleeDist = (opts.fleePips ?? 50) * pip
  let marketNow = false
  if (direction === "buy") marketNow = price <= zoneHigh || price - zoneHigh > fleeDist
  else marketNow = price >= zoneLow || zoneLow - price > fleeDist
  if (!marketNow) return "pending"
  if (tp1 != null && tp1 > 0) {
    const minRoom = (opts.minRoomPips ?? 30) * pip
    const room = direction === "buy" ? tp1 - price : price - tp1
    if (!(room >= minRoom)) return "skip"
  }
  return "market"
}
