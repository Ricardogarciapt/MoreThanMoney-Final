import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { resolveCurrentPrice } from "@/lib/mtm-alerts/evaluate"

/**
 * SHADOW do Sensei (#57 + #59) — NÃO executa, NÃO posta. Regista o que a nova política
 * FARIA para validar com dados reais antes de ir a dinheiro real:
 *   #57 — entrar NO SINAL (sem esperar o gatilho) com alvo mínimo de ~100 pips e deixar correr;
 *   #59 — permitir SELLs (que o gate live bloqueia por BUY-bias).
 * As trades vão para `sensei_shadow_trades` e o cron `sensei-shadow-eval` avalia por preço
 * (entra-no-mercado: SL conta como loss real, ao contrário do avaliador live baseado em gatilho).
 *
 * Convenção de pips: XAUUSD no MT5 → 1 pip = 0.10 de preço, logo 100 pips = 10.0. BTC usa %.
 */

export interface SenseiShadowConfig {
  enabled: boolean
  /** Distância do alvo em OURO (preço). 100 pips (pip=0.1) = 10.0. */
  goldTargetDistance: number
  /** Alvo BTC como % da entrada. */
  btcTargetPct: number
  /** #59 — registar também SELLs no shadow. */
  allowSell: boolean
  /** Janela de vida da trade shadow antes de expirar (horas). */
  horizonHours: number
}

const KEY = "sensei_shadow_config"

export async function getSenseiShadowConfig(): Promise<SenseiShadowConfig> {
  try {
    const { data } = await getSupabaseAdmin().from("site_settings").select("value").eq("key", KEY).maybeSingle()
    const v = (data?.value ?? {}) as Partial<SenseiShadowConfig>
    return {
      enabled: v.enabled === true,
      goldTargetDistance: typeof v.goldTargetDistance === "number" && v.goldTargetDistance > 0 ? v.goldTargetDistance : 10.0,
      btcTargetPct: typeof v.btcTargetPct === "number" && v.btcTargetPct > 0 ? v.btcTargetPct : 1.0,
      allowSell: v.allowSell !== false,
      horizonHours: typeof v.horizonHours === "number" && v.horizonHours > 0 ? v.horizonHours : 48,
    }
  } catch {
    return { enabled: false, goldTargetDistance: 10, btcTargetPct: 1, allowSell: true, horizonHours: 48 }
  }
}

export interface ShadowSignalInput {
  ticker: string
  side: "buy" | "sell"
  entry: number
  sl?: number | null
  timeframe?: string | null
}

export function shadowAssetClass(ticker: string): "btc" | "gold" {
  return /btc|xbt|eth/i.test(ticker) ? "btc" : "gold"
}

/**
 * Regista uma trade SHADOW. Idempotente por (ticker, side, hora) para não duplicar em relays
 * repetidos. Devolve {recorded} — nunca lança (best-effort, não deve afetar o fluxo live).
 */
export async function recordSenseiShadow(sig: ShadowSignalInput): Promise<{ recorded: boolean; reason?: string }> {
  try {
    const cfg = await getSenseiShadowConfig()
    if (!cfg.enabled) return { recorded: false, reason: "shadow off" }
    if (sig.side === "sell" && !cfg.allowSell) return { recorded: false, reason: "sell off no shadow" }
    if (!sig.entry || !(sig.entry > 0)) return { recorded: false, reason: "entry inválido" }

    const cls = shadowAssetClass(sig.ticker)
    // Entrar-no-sinal = entrar ao PREÇO DE MERCADO agora, na MESMA fonte que o avaliador usa
    // (evaluate.resolveCurrentPrice — ouro=GC=F). Assim entrada e avaliação batem certo (sem
    // basis spot-vs-futuros). Fallback ao nível do sinal se a cotação falhar.
    const mkt = await resolveCurrentPrice(sig.ticker).catch(() => null)
    const entry = mkt != null && mkt > 0 ? mkt : sig.entry
    const dist = cls === "btc" ? entry * (cfg.btcTargetPct / 100) : cfg.goldTargetDistance
    if (!(dist > 0)) return { recorded: false, reason: "distância inválida" }
    const dir = sig.side === "sell" ? -1 : 1
    const tp = entry + dir * dist
    // SL simétrico ao alvo (1R) — para o shadow, entrar-no-sinal com risco = alvo (100 pips).
    const sl = entry - dir * dist

    const supabase = getSupabaseAdmin()
    // dedup: mesma ticker+side na última hora
    const sinceIso = new Date(Date.now() - 60 * 60000).toISOString()
    const { count } = await supabase
      .from("sensei_shadow_trades")
      .select("id", { count: "exact", head: true })
      .eq("ticker", sig.ticker)
      .eq("side", sig.side)
      .gte("created_at", sinceIso)
    if ((count ?? 0) > 0) return { recorded: false, reason: "duplicado recente" }

    const { error } = await supabase.from("sensei_shadow_trades").insert({
      ticker: sig.ticker,
      side: sig.side,
      entry,
      sl,
      tp,
      target_dist: dist,
      asset_class: cls,
      timeframe: sig.timeframe ?? null,
      status: "open",
      notes: mkt != null ? `entry@mercado ${entry} (sinal dizia ${sig.entry})` : "entry=nível do sinal (sem cotação)",
    })
    if (error) return { recorded: false, reason: error.message }
    return { recorded: true }
  } catch (e) {
    return { recorded: false, reason: e instanceof Error ? e.message : "erro" }
  }
}
