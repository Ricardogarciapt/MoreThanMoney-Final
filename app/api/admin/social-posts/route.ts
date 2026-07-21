/**
 * API admin — fila de agendamento/publicação IG (social_scheduled_posts).
 * GET: lista posts (filtros opcionais status/account). POST: cria rascunho.
 * Aprovação/edição/cancelamento em [id]/route.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin, verifyAdminAccess } from "@/lib/admin-api-helpers"
import { usernameForAccount, rehostMedia, IG_ACCOUNTS } from "@/lib/instagram/publish"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const account = searchParams.get("account")

    let query = supabase
      .from("social_scheduled_posts")
      .select("*")
      .order("scheduled_at", { ascending: false })
      .limit(200)

    if (status) query = query.eq("status", status)
    if (account) query = query.eq("ig_account_id", account)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message, data: [] }, { status: 500 })
    }
    return NextResponse.json({ data: data || [], accounts: IG_ACCOUNTS })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, data: [] }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const { email } = await verifyAdminAccess()
    const body = await request.json()

    const igAccountId: string = body.ig_account_id
    if (!igAccountId || !usernameForAccount(igAccountId)) {
      return NextResponse.json({ error: "ig_account_id inválido" }, { status: 400 })
    }
    const mediaType: string = (body.media_type || "IMAGE").toUpperCase()
    if (!["IMAGE", "CAROUSEL", "STORIES", "REELS"].includes(mediaType)) {
      return NextResponse.json({ error: "media_type inválido" }, { status: 400 })
    }

    let mediaUrls: string[] = Array.isArray(body.media_urls)
      ? body.media_urls.filter((u: unknown) => typeof u === "string" && u)
      : []

    // Opcional: re-hospedar as media (ex.: exports do Canva) no bucket público estável.
    if (body.rehost && mediaUrls.length) {
      mediaUrls = await Promise.all(mediaUrls.map((u) => rehostMedia(u, { prefix: "social" })))
    }

    const row = {
      channel: "instagram",
      ig_account_id: igAccountId,
      ig_username: usernameForAccount(igAccountId),
      pillar: body.pillar || null,
      media_type: mediaType,
      media_urls: mediaUrls,
      caption: body.caption || "",
      canva_design_id: body.canva_design_id || null,
      scheduled_at: body.scheduled_at || new Date().toISOString(),
      status: "draft",
      created_by: email || null,
    }

    const { data, error } = await supabase
      .from("social_scheduled_posts")
      .insert(row)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
