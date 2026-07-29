import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { perpsTrendGuard } from "@/lib/bybit-trend-guard"

/**
 * Gate dos SINAIS de perpétuos (antes de publicar no chat / executar na Bybit).
 * Combina DUAS proteções, ambas afináveis sem redeploy:
 *   1) Trend-guard macro (BTC 4h + breadth Cripto30): BUY só com macro a favor, SELL idem.
 *      Backtest (5d): passar de sinais crus → trend-guarded triplica o R/trade e sobe o winrate.
 *   2) Scorecard por moeda (site_settings.perps_coin_scorecard): bloqueia/reduz moedas
 *      persistentemente negativas. Auto-preenchido pelo cron perps-scorecard à medida que o
 *      avaliador acumula resultados reais (path-based). Default: não bloqueia nada.
 */

export interface PerpsCoinScorecard {
  enabled: boolean
  /** Símbolos normalizados (ex.: "TIAUSDT") a bloquear. */
  blocked: string[]
  /** netR mínimo (30d) para NÃO bloquear; usado pelo cron ao recalcular. */
  minNetR?: number
  /** nº mínimo de trades resolvidos para o bloqueio contar (evita agir em amostra pequena). */
  minSample?: number
  updated_at?: string
}

const KEY = "perps_coin_scorecard"

export function normPerpSymbol(ticker: string): string {
  return ticker.toUpperCase().replace(/\.P$/i, "").replace(/[^A-Z0-9]/g, "")
}

export async function getPerpsCoinScorecard(): Promise<PerpsCoinScorecard> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle()
    const v = (data?.value ?? {}) as Partial<PerpsCoinScorecard>
    return {
      enabled: v.enabled === true,
      blocked: Array.isArray(v.blocked) ? v.blocked.map((s) => String(s).toUpperCase()) : [],
      minNetR: typeof v.minNetR === "number" ? v.minNetR : -3,
      minSample: typeof v.minSample === "number" ? v.minSample : 12,
    }
  } catch {
    return { enabled: false, blocked: [], minNetR: -3, minSample: 12 }
  }
}

export interface PerpsGateResult {
  allow: boolean
  reason: string
}

/**
 * Decide se um sinal de perp pode publicar/executar.
 * @param symbol ticker do webhook (ex.: "TIAUSDT.P")
 * @param direction "buy" | "sell"
 */
export async function evaluatePerpsSignalGate(
  symbol: string,
  direction: "buy" | "sell",
): Promise<PerpsGateResult> {
  const norm = normPerpSymbol(symbol)

  // 1) Scorecard por moeda (rápido, local)
  const sc = await getPerpsCoinScorecard()
  if (sc.enabled && sc.blocked.includes(norm)) {
    return { allow: false, reason: `moeda bloqueada pelo scorecard (${norm})` }
  }

  // 2) Trend-guard macro (rede; fail-open dentro da própria função)
  const side = direction === "sell" ? "Sell" : "Buy"
  const tg = await perpsTrendGuard(side)
  if (!tg.allow) return { allow: false, reason: tg.reason }

  return { allow: true, reason: tg.reason }
}
