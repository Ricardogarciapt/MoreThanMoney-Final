/**
 * API admin — ações sobre um post agendado.
 * PATCH: aprovar / cancelar / voltar a rascunho / editar campos.
 * DELETE: apagar da fila.
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin, verifyAdminAccess } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const { id } = await params
    const { email } = await verifyAdminAccess()
    const body = await request.json()
    const action: string | undefined = body.action

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (action === "approve") {
      update.status = "approved"
      update.approved_by = email || null
      update.approved_at = new Date().toISOString()
      update.error = null
    } else if (action === "cancel") {
      update.status = "canceled"
    } else if (action === "draft") {
      update.status = "draft"
      update.approved_by = null
      update.approved_at = null
    } else if (action === "retry") {
      // Repõe um post falhado para nova tentativa.
      update.status = "approved"
      update.attempts = 0
      update.creation_id = null
      update.child_creation_ids = null
      update.error = null
    }

    // Edição de campos (permitida enquanto não publicado).
    for (const f of ["caption", "scheduled_at", "media_type", "pillar"] as const) {
      if (f in body && body[f] !== undefined) update[f] = body[f]
    }
    if (Array.isArray(body.media_urls)) {
      update.media_urls = body.media_urls.filter((u: unknown) => typeof u === "string" && u)
    }

    const { data, error } = await supabase
      .from("social_scheduled_posts")
      .update(update)
      .eq("id", id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const { id } = await params
    const { error } = await supabase.from("social_scheduled_posts").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
