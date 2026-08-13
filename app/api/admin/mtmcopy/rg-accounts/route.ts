import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, getSupabaseAdmin } from "@/lib/admin-api-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Contas do cascade "Copy Trader Ricardo Garcia" (para o modal do terminal de métricas):
 * a intermédia 0f38257a (copia Premium 9gsL) + os slaves da estratégia su0a. Devolve a config
 * (lote/risco/trailing/estado) + saldo/equidade ao vivo + P&L desde o baseline (métricas do zero).
 */

const INTERMEDIATE = "0f38257a-ba12-4f6c-b20c-9139693b3674"
const STRATEGY_NAMES: Record<string, string> = {
  su0a: "Copy Trader Ricardo Garcia",
  "9gsL": "MTM Auto Premium",
  "5IHE": "MTM Auto Trade Ideas",
  mADd: "MTM Auto Sensei",
  SDNb: "MTM Auto GoldKiller",
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("mtmcopy_connections")
    .select(
      "id, metaapi_account_id, mt5_login, mt5_server, mt5_status, account_label, copy_method, copyfactory_strategy_pick, copyfactory_subscribed, lot_mode, lot_value, max_risk_percent, auto_trailing_stop, trailing_stop_points, is_active, baseline_balance, user_id",
    )
    .or(`copyfactory_strategy_pick.eq.su0a,metaapi_account_id.eq.${INTERMEDIATE}`)
    .order("copyfactory_strategy_pick", { ascending: true })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  let rows = (data ?? []) as Record<string, unknown>[]

  // saldos/equidade ao vivo (best-effort — não bloqueia o modal se a MetaApi estiver lenta)
  try {
    const { attachConnectionBalances } = await import("@/lib/mtmcopy/connection-balances")
    rows = (await attachConnectionBalances(rows as never)) as unknown as Record<string, unknown>[]
  } catch {
    /* sem saldos ao vivo */
  }

  const accounts = rows.map((r) => {
    const balance = (r.account_balance as number | undefined) ?? null
    const equity = (r.account_equity as number | undefined) ?? null
    const baseline = r.baseline_balance != null ? Number(r.baseline_balance) : null
    const pnl = balance != null && baseline != null ? Number((balance - baseline).toFixed(2)) : null
    const pnlPct = pnl != null && baseline ? Number(((pnl / baseline) * 100).toFixed(2)) : null
    const pick = (r.copyfactory_strategy_pick as string | null) ?? null
    return {
      id: r.id,
      metaapi_account_id: r.metaapi_account_id,
      login: r.mt5_login,
      server: r.mt5_server,
      status: r.mt5_status,
      label: r.account_label,
      is_intermediate: r.metaapi_account_id === INTERMEDIATE,
      strategy_pick: pick,
      strategy_name: pick ? (STRATEGY_NAMES[pick] ?? pick) : null,
      copy_method: r.copy_method,
      lot_mode: r.lot_mode,
      lot_value: r.lot_value != null ? Number(r.lot_value) : null,
      max_risk_percent: r.max_risk_percent != null ? Number(r.max_risk_percent) : null,
      auto_trailing_stop: r.auto_trailing_stop === true,
      trailing_stop_points: r.trailing_stop_points != null ? Number(r.trailing_stop_points) : null,
      is_active: r.is_active === true,
      baseline_balance: baseline,
      balance,
      equity,
      pnl,
      pnl_pct: pnlPct,
    }
  })

  return NextResponse.json({ ok: true, accounts, strategy: { su0a: STRATEGY_NAMES.su0a, "9gsL": STRATEGY_NAMES["9gsL"] } })
}
