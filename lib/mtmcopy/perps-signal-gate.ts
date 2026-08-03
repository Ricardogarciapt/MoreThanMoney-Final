import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { perpsTrendGuard } from "@/lib/bybit-trend-guard"
import { getBybitFunding, fundingGate } from "@/lib/bybit"

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

/**
 * Regras extra do gate de perps (research + auditoria Bybit 2026-08). Config em
 * site_settings.perps_gate_rules — afinável sem redeploy. Tudo fail-open.
 *  • slMaxPct  — rejeita sinais com SL demasiado largo → CAPA a perda por trade
 *    (a auditoria mostrou 78% win mas PF<1 por 1 perda gigante em ETH/SOL/HYPE…).
 *  • cooldownMinutes — 1 sinal por par a cada N min → mata o overtrading (KAS 18 trades/60d).
 *  • funding — bloqueia abrir CONTRA funding adverso iminente (o "imposto silencioso" dos perps;
 *    a investigação é unânime: segurar contra o funding vira estratégia lucrativa em perdedora).
 */
export interface PerpsGateRules {
  enabled: boolean
  /** Blacklist manual (auditoria) — separada do scorecard que o cron gere. */
  blacklist: string[]
  slMaxPct: number
  cooldownMinutes: number
  funding: { enabled: boolean; maxAdverse: number; windowMin: number }
}

const RULES_KEY = "perps_gate_rules"

export async function getPerpsGateRules(): Promise<PerpsGateRules> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", RULES_KEY)
      .maybeSingle()
    const v = (data?.value ?? {}) as Partial<PerpsGateRules> & { funding?: Partial<PerpsGateRules["funding"]> }
    return {
      enabled: v.enabled === true,
      blacklist: Array.isArray(v.blacklist) ? v.blacklist.map((s) => String(s).toUpperCase()) : [],
      slMaxPct: typeof v.slMaxPct === "number" ? v.slMaxPct : 0,
      cooldownMinutes: typeof v.cooldownMinutes === "number" ? v.cooldownMinutes : 0,
      funding: {
        enabled: v.funding?.enabled === true,
        maxAdverse: typeof v.funding?.maxAdverse === "number" ? v.funding.maxAdverse : 0.0005,
        windowMin: typeof v.funding?.windowMin === "number" ? v.funding.windowMin : 30,
      },
    }
  } catch {
    return { enabled: false, blacklist: [], slMaxPct: 0, cooldownMinutes: 0, funding: { enabled: false, maxAdverse: 0.0005, windowMin: 30 } }
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
 * @param opts entry/sl do sinal (para o cap de SL)
 */
export async function evaluatePerpsSignalGate(
  symbol: string,
  direction: "buy" | "sell",
  opts?: { entry?: number | null; sl?: number | null },
): Promise<PerpsGateResult> {
  const norm = normPerpSymbol(symbol)

  // 1) Scorecard por moeda / blacklist (rápido, local)
  const sc = await getPerpsCoinScorecard()
  if (sc.enabled && sc.blocked.includes(norm)) {
    return { allow: false, reason: `moeda bloqueada pelo scorecard (${norm})` }
  }

  // 2) Regras extra (cap SL + cooldown + funding) — config-driven, fail-open
  const rules = await getPerpsGateRules()
  if (rules.enabled) {
    // 2·0) Blacklist manual da auditoria (pares net-negativos / overtraded)
    if (rules.blacklist.includes(norm)) {
      return { allow: false, reason: `par na blacklist da auditoria (${norm})` }
    }
    // 2a) CAP de SL — perda por trade limitada
    if (rules.slMaxPct > 0 && opts?.entry && opts?.sl && opts.entry > 0) {
      const slPct = (Math.abs(opts.entry - opts.sl) / opts.entry) * 100
      if (slPct > rules.slMaxPct) {
        return { allow: false, reason: `SL ${slPct.toFixed(2)}% > máx ${rules.slMaxPct}% (perda/trade)` }
      }
    }
    // 2b) COOLDOWN por par — anti-overtrading (conta entradas recentes do mesmo símbolo)
    if (rules.cooldownMinutes > 0) {
      try {
        const sinceIso = new Date(Date.now() - rules.cooldownMinutes * 60000).toISOString()
        const { count } = await getSupabaseAdmin()
          .from("tradingview_signals")
          .select("id", { count: "exact", head: true })
          .eq("signal_kind", "entry")
          .ilike("ticker", `%${norm}%`)
          .not("trade_status", "in", '("filtered","discarded")')
          .gte("received_at", sinceIso)
        if ((count ?? 0) > 0) {
          return { allow: false, reason: `cooldown ${rules.cooldownMinutes}min (${norm}) — anti-overtrading` }
        }
      } catch {
        /* fail-open */
      }
    }
    // 2c) FUNDING — não abrir contra funding adverso iminente
    if (rules.funding.enabled) {
      try {
        const f = await getBybitFunding(norm)
        const fg = fundingGate(direction, f, Date.now(), {
          maxAdverse: rules.funding.maxAdverse,
          windowMin: rules.funding.windowMin,
        })
        if (fg.block) return { allow: false, reason: `funding adverso: ${fg.reason}` }
      } catch {
        /* fail-open */
      }
    }
  }

  // 3) Trend-guard macro (rede; fail-open dentro da própria função)
  const side = direction === "sell" ? "Sell" : "Buy"
  const tg = await perpsTrendGuard(side)
  if (!tg.allow) return { allow: false, reason: tg.reason }

  return { allow: true, reason: tg.reason }
}
