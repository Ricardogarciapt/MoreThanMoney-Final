import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { undeployMetaApiAccount } from "@/lib/mtmcopy/metaapi-provision"
import { ensureMetaApiAccountOnline } from "@/lib/mtmcopy/metaapi"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Undeploy / (re)deploy de uma conta MetaApi a partir do modal do terminal de métricas RG.
 * Undeploy pára de faturar o essencial e suspende a cópia (mantém conta+config); deploy volta
 * a ligar. Aceita connection_id (resolve o metaapi_account_id) ou metaapi_account_id direto.
 *   POST { connection_id? , metaapi_account_id? , action: 'undeploy' | 'deploy' }
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const action = String(body.action ?? "")
  if (action !== "undeploy" && action !== "deploy") {
    return NextResponse.json({ ok: false, error: "action inválida (undeploy|deploy)" }, { status: 400 })
  }

  let accountId = typeof body.metaapi_account_id === "string" ? body.metaapi_account_id.trim() : ""
  const connectionId = typeof body.connection_id === "string" ? body.connection_id.trim() : ""

  if (!accountId && connectionId) {
    const { data } = await getSupabaseAdmin()
      .from("mtmcopy_connections")
      .select("metaapi_account_id")
      .eq("id", connectionId)
      .maybeSingle()
    accountId = (data?.metaapi_account_id as string | null) ?? ""
  }
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "conta MetaApi não resolvida" }, { status: 400 })
  }

  try {
    if (action === "undeploy") {
      await undeployMetaApiAccount(accountId)
      // marca a conexão pausada (não bloqueia se falhar)
      if (connectionId) {
        await getSupabaseAdmin()
          .from("mtmcopy_connections")
          .update({ mt5_status: "undeployed", updated_at: new Date().toISOString() })
          .eq("id", connectionId)
          .then(undefined, () => {})
      }
      return NextResponse.json({ ok: true, action, accountId })
    }
    // deploy
    const r = await ensureMetaApiAccountOnline(accountId)
    if (connectionId && r.ok) {
      await getSupabaseAdmin()
        .from("mtmcopy_connections")
        .update({ mt5_status: "connected", updated_at: new Date().toISOString() })
        .eq("id", connectionId)
        .then(undefined, () => {})
    }
    return NextResponse.json({ ok: r.ok, action, accountId, error: r.ok ? undefined : r.error })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "erro" }, { status: 500 })
  }
}
