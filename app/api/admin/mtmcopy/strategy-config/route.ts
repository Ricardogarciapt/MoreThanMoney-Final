import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getExecSwitches, setExecSwitches, type ExecSwitches } from "@/lib/mtmcopy/exec-switches"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Config unificada de estratégias para o /admin (MTM Copy → Controlo de Estratégias).
 * Junta num só sítio os controlos que hoje vivem espalhados por várias keys de site_settings
 * + o estado (só-leitura) das flags que são env vars da Vercel. Reutiliza o padrão
 * requireAdmin + upsert em site_settings. NÃO substitui o painel de senders/rotas (esse fica).
 */

type Setting = Record<string, unknown>

async function readSetting(key: string): Promise<Setting> {
  try {
    const { data } = await getSupabaseAdmin().from("site_settings").select("value").eq("key", key).maybeSingle()
    const v = data?.value
    if (v && typeof v === "object") return v as Setting
    if (typeof v === "string") {
      try { return JSON.parse(v) as Setting } catch { return {} }
    }
    return {}
  } catch {
    return {}
  }
}

async function writeSetting(key: string, value: Setting, description: string): Promise<void> {
  await getSupabaseAdmin().from("site_settings").upsert(
    { key, value, description, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  )
}

/** Estado (só-leitura) das flags que são env vars da Vercel — não toggláveis daqui. */
function envFlags(): Record<string, boolean> {
  const on = (v: string | undefined, defOn = false) =>
    v == null || v === "" ? defOn : v.toLowerCase() === "true" || v.toLowerCase() === "on"
  return {
    // gates que estão OFF por defeito (precisam de valor explícito p/ ligar)
    bybit_perps_exec: (process.env.BYBIT_PERPS_EXEC_ENABLED ?? "").toLowerCase() === "true",
    sensei_provider_exec:
      (process.env.SENSEI_PROVIDER_EXEC_ENABLED ?? process.env.PROVIDER_EXEC_ENABLED ?? "").toLowerCase() === "true",
    runner_mode: (process.env.MTMCOPY_RUNNER_MODE ?? "").toLowerCase() === "on",
    // gates ON por defeito (só desligam com 'false')
    premium_fast_exec: on(process.env.MTMCOPY_PREMIUM_FAST_EXEC, true),
    quick_win: on(process.env.BYBIT_QUICK_WIN_ENABLED, true),
    trend_guard: (process.env.BYBIT_PERPS_TREND_GUARD ?? "").toLowerCase() !== "false",
  }
}

type ShadowRow = {
  side: "buy" | "sell"
  status: string
  entry: number
  target_dist: number
  max_favorable: number | null
}

/** Resumo do shadow do Sensei (#57/#59): win rate por lado + upside do "deixa correr". */
function shadowSummary(rows: ShadowRow[]) {
  const bucket = (side: "buy" | "sell" | null) => {
    const r = side ? rows.filter((x) => x.side === side) : rows
    const tgt = r.filter((x) => x.status === "hit_target").length
    const sl = r.filter((x) => x.status === "hit_sl").length
    const open = r.filter((x) => x.status === "open").length
    const expired = r.filter((x) => x.status === "expired").length
    const dec = tgt + sl
    // upside: p/ os winners, quantos "R" (múltiplos do alvo) correu além da entrada
    const wins = r.filter((x) => x.status === "hit_target" && x.max_favorable != null && x.target_dist > 0)
    const avgRunR = wins.length
      ? wins.reduce((a, x) => a + Math.abs((x.max_favorable as number) - x.entry) / x.target_dist, 0) / wins.length
      : null
    return {
      n: r.length,
      hit_target: tgt,
      hit_sl: sl,
      open,
      expired,
      winRate: dec ? Math.round((100 * tgt) / dec) : null,
      avgRunR: avgRunR != null ? Number(avgRunR.toFixed(2)) : null,
    }
  }
  return { all: bucket(null), buy: bucket("buy"), sell: bucket("sell") }
}

/** Do scorecard por-moeda dos perps, deriva as sugestões manter/remover (netR). */
function perpsSuggestions(scorecard: Setting): { keep: unknown[]; cut: unknown[] } {
  const rows = Array.isArray(scorecard.scorecard) ? (scorecard.scorecard as Array<Record<string, unknown>>) : []
  const withNet = rows
    .filter((r) => typeof r.netR === "number")
    .sort((a, b) => (b.netR as number) - (a.netR as number))
  return {
    keep: withNet.filter((r) => (r.netR as number) > 0),
    cut: withNet.filter((r) => (r.netR as number) <= 0),
  }
}

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const [switches, primeverse, forexSwings, perpsRules, perpsScore, shadowCfg] = await Promise.all([
    getExecSwitches(),
    readSetting("primeverse_execution"),
    readSetting("forex_swings_execution"),
    readSetting("perps_gate_rules"),
    readSetting("perps_coin_scorecard"),
    readSetting("sensei_shadow_config"),
  ])

  // Resultados do shadow do Sensei (#57/#59) — últimas 1000 trades-sombra
  let senseiShadow: { config: Record<string, unknown>; summary: ReturnType<typeof shadowSummary> } | null = null
  try {
    const { data: shadowRows } = await getSupabaseAdmin()
      .from("sensei_shadow_trades")
      .select("side,status,entry,target_dist,max_favorable")
      .order("created_at", { ascending: false })
      .limit(1000)
    senseiShadow = {
      config: {
        enabled: shadowCfg.enabled === true,
        allowSell: shadowCfg.allowSell !== false,
        goldTargetDistance: typeof shadowCfg.goldTargetDistance === "number" ? shadowCfg.goldTargetDistance : 10,
      },
      summary: shadowSummary((shadowRows ?? []) as ShadowRow[]),
    }
  } catch {
    /* tabela pode ainda não ter dados */
  }

  return NextResponse.json({
    ok: true,
    switches,
    primeverse: { mode: (primeverse.mode as string) ?? "off", ...primeverse },
    forexSwings: { mode: (forexSwings.mode as string) ?? "off", ...forexSwings },
    perpsRules: {
      enabled: perpsRules.enabled === true,
      blacklist: Array.isArray(perpsRules.blacklist) ? perpsRules.blacklist : [],
      slMaxPct: typeof perpsRules.slMaxPct === "number" ? perpsRules.slMaxPct : 0,
      cooldownMinutes: typeof perpsRules.cooldownMinutes === "number" ? perpsRules.cooldownMinutes : 0,
      funding: perpsRules.funding ?? { enabled: false },
    },
    perpsSuggestions: perpsSuggestions(perpsScore),
    senseiShadow,
    envFlags: envFlags(),
  })
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const applied: string[] = []

  // 1) Interruptores por estratégia (mtmcopy_exec_switches)
  if (body.switches && typeof body.switches === "object") {
    const patch: Partial<ExecSwitches> = {}
    for (const k of [
      "sensei",
      "forex",
      "premium",
      "goldkiller",
      "premium_price_monitor",
      "premium_subscriber_exits",
    ] as const) {
      const v = (body.switches as Record<string, unknown>)[k]
      if (typeof v === "boolean") patch[k] = v
    }
    if (Object.keys(patch).length) {
      await setExecSwitches(patch)
      applied.push("switches")
    }
  }

  // 2) Modo de execução PrimeVerse / Forex Swings (off | shadow | live)
  const validMode = (m: unknown): m is string => m === "off" || m === "shadow" || m === "live"
  if (validMode(body.primeverse_mode)) {
    const cur = await readSetting("primeverse_execution")
    await writeSetting("primeverse_execution", { ...cur, mode: body.primeverse_mode }, "Execução PrimeVerse")
    applied.push("primeverse_mode")
  }
  if (validMode(body.forex_swings_mode)) {
    const cur = await readSetting("forex_swings_execution")
    await writeSetting("forex_swings_execution", { ...cur, mode: body.forex_swings_mode }, "Execução Forex Swings")
    applied.push("forex_swings_mode")
  }

  // 3) Regras do gate de perps (cap SL, cooldown, funding, blacklist) — afináveis sem redeploy
  if (body.perps_rules && typeof body.perps_rules === "object") {
    const cur = await readSetting("perps_gate_rules")
    const pr = body.perps_rules as Record<string, unknown>
    const next: Setting = { ...cur }
    if (typeof pr.enabled === "boolean") next.enabled = pr.enabled
    if (typeof pr.slMaxPct === "number" && pr.slMaxPct >= 0) next.slMaxPct = pr.slMaxPct
    if (typeof pr.cooldownMinutes === "number" && pr.cooldownMinutes >= 0) next.cooldownMinutes = pr.cooldownMinutes
    if (Array.isArray(pr.blacklist)) next.blacklist = pr.blacklist.map((s) => String(s).toUpperCase())
    if (pr.funding && typeof pr.funding === "object") next.funding = pr.funding
    await writeSetting("perps_gate_rules", next, "Regras do gate de perps (afinável sem redeploy)")
    applied.push("perps_rules")
  }

  // 4) Config do shadow do Sensei (#57/#59)
  if (body.sensei_shadow && typeof body.sensei_shadow === "object") {
    const cur = await readSetting("sensei_shadow_config")
    const s = body.sensei_shadow as Record<string, unknown>
    const next: Setting = { ...cur }
    if (typeof s.enabled === "boolean") next.enabled = s.enabled
    if (typeof s.allowSell === "boolean") next.allowSell = s.allowSell
    if (typeof s.goldTargetDistance === "number" && s.goldTargetDistance > 0) next.goldTargetDistance = s.goldTargetDistance
    await writeSetting("sensei_shadow_config", next, "Shadow do Sensei (#57/#59)")
    applied.push("sensei_shadow")
  }

  if (!applied.length) return NextResponse.json({ ok: false, error: "nada para aplicar" }, { status: 400 })
  return NextResponse.json({ ok: true, applied })
}
