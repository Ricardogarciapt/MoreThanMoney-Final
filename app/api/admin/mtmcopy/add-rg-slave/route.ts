import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { subscribeToStrategies } from "@/lib/mtmcopy/copyfactory"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SU0A = "su0a" // estratégia "Copy Trader Ricardo Garcia"
const PROV = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai"

/**
 * Adiciona uma conta como SLAVE do "Copy Trader Ricardo Garcia" (estratégia su0a).
 * Ativa o role SUBSCRIBER se preciso, subscreve com lote fixo (default 0.01) e sincroniza a BD.
 *   POST { metaapi_account_id, user_id?, lot_value?=0.01, mt5_login?, mt5_server?, label? }
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const accountId = typeof body.metaapi_account_id === "string" ? body.metaapi_account_id.trim() : ""
  if (!accountId) return NextResponse.json({ ok: false, error: "metaapi_account_id obrigatório" }, { status: 400 })
  const lot = typeof body.lot_value === "number" && body.lot_value > 0 ? body.lot_value : 0.01
  const scaling = { mode: "fixedVolume" as const, tradeVolume: lot, forceTinyTrades: true }

  const supabase = getSupabaseAdmin()
  const token = process.env.METAAPI_TOKEN

  // 1) subscrever à su0a (tenta; se faltar o role, ativa e pede retry)
  let sub = await subscribeToStrategies({
    accountId,
    strategyIds: [SU0A],
    name: "Copia Copy Trader Ricardo Garcia",
    tradeSizeScaling: scaling,
    freshSubscribe: true,
  })
  if (!sub.ok && /not marked as .*subscriber/i.test(sub.error ?? "") && token) {
    await fetch(`${PROV}/users/current/accounts/${accountId}/enable-copy-factory-api`, {
      method: "POST",
      headers: { "auth-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ copyFactoryRoles: ["SUBSCRIBER"], copyFactoryResourceSlots: 1 }),
    }).catch(() => {})
    return NextResponse.json({
      ok: false,
      pendingRole: true,
      error: "Role SUBSCRIBER ativado — repete em ~1 min para a MetaApi propagar.",
    })
  }
  if (!sub.ok) return NextResponse.json({ ok: false, error: sub.error }, { status: 400 })

  // 2) sincronizar a BD (upsert por metaapi_account_id)
  const userId =
    (typeof body.user_id === "string" && body.user_id) ||
    (await supabase
      .from("mtmcopy_connections")
      .select("user_id")
      .eq("metaapi_account_id", "6de59846-40e3-48d8-b908-1a8bda54d19a")
      .maybeSingle()
      .then((r) => (r.data?.user_id as string | undefined) ?? null))

  const { data: existing } = await supabase
    .from("mtmcopy_connections")
    .select("id")
    .eq("metaapi_account_id", accountId)
    .maybeSingle()

  const patch = {
    copy_method: "strategy",
    copyfactory_strategy_pick: SU0A,
    copyfactory_subscribed: true,
    is_active: true,
    is_audited: true,
    lot_mode: "fixed",
    lot_value: lot,
    mt5_status: "connected",
    account_role: "slave",
    purpose: "mtmcopy",
    updated_at: new Date().toISOString(),
    ...(typeof body.mt5_login === "string" ? { mt5_login: body.mt5_login } : {}),
    ...(typeof body.mt5_server === "string" ? { mt5_server: body.mt5_server } : {}),
    ...(typeof body.label === "string" ? { account_label: body.label } : {}),
  }

  if (existing?.id) {
    await supabase.from("mtmcopy_connections").update(patch).eq("id", existing.id)
  } else if (userId) {
    await supabase.from("mtmcopy_connections").insert({ user_id: userId, metaapi_account_id: accountId, ...patch })
  } else {
    return NextResponse.json({ ok: true, subscribed: true, warning: "subscrito na CopyFactory mas sem user_id p/ criar a linha na BD" })
  }

  return NextResponse.json({ ok: true, subscribed: true })
}
