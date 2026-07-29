import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * CRON — Scorecard por moeda dos perpétuos (auto-afinável).
 *
 * Lê os perps JÁ RESOLVIDOS (path-based) dos últimos N dias, calcula o netR por moeda
 * (win = +R do TP1, loss = −1R) e reescreve a lista `blocked` em site_settings.perps_coin_scorecard
 * (moedas com netR < minNetR E amostra >= minSample). NÃO altera a flag `enabled` — o bloqueio
 * só passa a atuar quando o Ricardo ligar `enabled:true` (evita agir às cegas com pouca amostra).
 *
 * Agendado 1x/dia. Idempotente.
 */
const KEY = "perps_coin_scorecard"

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const admin = getSupabaseAdmin()
  const days = Number(process.env.PERPS_SCORECARD_DAYS || 30)
  const since = new Date(Date.now() - days * 86400_000).toISOString()

  // Config atual (preserva enabled + limiares)
  const { data: cfgRow } = await admin.from("site_settings").select("value").eq("key", KEY).maybeSingle()
  const cfg = (cfgRow?.value ?? {}) as { enabled?: boolean; minNetR?: number; minSample?: number }
  const minNetR = typeof cfg.minNetR === "number" ? cfg.minNetR : -3
  const minSample = typeof cfg.minSample === "number" ? cfg.minSample : 12

  const { data: rows } = await admin
    .from("tradingview_signals")
    .select("ticker, sl, tp, raw_payload, trade_status")
    .ilike("alert_name", "%perp%")
    .eq("signal_kind", "entry")
    .in("trade_status", ["exit_1", "exit_2", "exit_3", "exit_4", "loss"])
    .gte("received_at", since)
    .limit(5000)

  const agg = new Map<string, { w: number; l: number; netR: number }>()
  for (const r of rows ?? []) {
    const sym = String(r.ticker ?? "").toUpperCase().replace(/\.P$/i, "").replace(/[^A-Z0-9]/g, "")
    if (!sym) continue
    const raw = (r.raw_payload && typeof r.raw_payload === "object" ? r.raw_payload : {}) as Record<string, unknown>
    const entry = Number(raw.entry ?? raw.entry_price)
    const sl = Number(r.sl)
    const tp = Number(r.tp)
    const a = agg.get(sym) ?? { w: 0, l: 0, netR: 0 }
    const st = String(r.trade_status)
    if (st.startsWith("exit_")) {
      a.w++
      const risk = Math.abs(entry - sl)
      const rr = risk > 0 && Number.isFinite(tp) ? Math.abs(tp - entry) / risk : 1
      a.netR += Number.isFinite(rr) ? rr : 1
    } else if (st === "loss") {
      a.l++
      a.netR -= 1
    }
    agg.set(sym, a)
  }

  const scorecard = [...agg.entries()]
    .map(([sym, a]) => ({ sym, sample: a.w + a.l, netR: Math.round(a.netR * 10) / 10, wr: a.w + a.l ? Math.round((100 * a.w) / (a.w + a.l)) : 0 }))
    .sort((x, y) => x.netR - y.netR)
  const blocked = scorecard.filter((s) => s.sample >= minSample && s.netR < minNetR).map((s) => s.sym)

  const next = { enabled: cfg.enabled === true, blocked, minNetR, minSample, scorecard, updated_at: new Date().toISOString() }
  await admin.from("site_settings").upsert(
    { key: KEY, value: next, description: "Scorecard por moeda dos perps (auto)", updated_at: new Date().toISOString() },
    { onConflict: "key" },
  )
  console.log(`📊 [perps-scorecard] ${scorecard.length} moedas, ${blocked.length} bloqueadas (enabled=${next.enabled})`, blocked)
  return NextResponse.json({ ok: true, enabled: next.enabled, blocked, scorecard })
}
