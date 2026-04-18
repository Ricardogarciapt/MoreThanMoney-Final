import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

function buildUsername(userId: string, email?: string | null, user_metadata?: Record<string, unknown> | null) {
  const meta = user_metadata || {}
  const name = typeof meta.name === "string" ? meta.name.replace(/\s+/g, "").toLowerCase() : ""
  const fromMeta = typeof meta.username === "string" ? meta.username.trim() : ""
  const prefix =
    fromMeta ||
    (name.length > 0 ? name : (email?.split("@")[0] || "user").replace(/[^a-z0-9_]/gi, ""))

  return `${prefix}_${userId.replace(/-/g, "").slice(0, 10)}`
}

function buildFullName(user_metadata?: Record<string, unknown> | null) {
  const meta = user_metadata || {}
  return (
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "Utilizador"
  )
}

export async function GET(_request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      },
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("mtm_auto_requested, mtm_auto_requested_at, mtm_auto_enabled, mtm_auto_enabled_at, mtm_auto_admin")
      .eq("id", user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: "Erro ao consultar acesso MTM Auto", details: error.message }, { status: 500 })
    }

    return NextResponse.json({
      requested: Boolean(profile?.mtm_auto_requested),
      requested_at: profile?.mtm_auto_requested_at || null,
      enabled: Boolean(profile?.mtm_auto_enabled),
      enabled_at: profile?.mtm_auto_enabled_at || null,
      is_admin: Boolean(profile?.mtm_auto_admin),
    })
  } catch (error: any) {
    return NextResponse.json({ error: "Erro interno", details: error?.message }, { status: 500 })
  }
}

export async function POST(_request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      },
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const now = new Date().toISOString()
    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update({
        mtm_auto_requested: true,
        mtm_auto_requested_at: now,
      })
      .eq("id", user.id)
      .select("id, email, username, full_name, mtm_auto_enabled, mtm_auto_requested_at")
      .maybeSingle()

    if (updateError) {
      return NextResponse.json({ error: "Erro ao registar pedido de acesso", details: updateError.message }, { status: 500 })
    }

    // Se não existe profile (RLS/gaps de trigger), criamos agora para evitar "pedido" invisível no admin.
    let profile = updatedProfile
    if (!profile) {
      const supabaseAdmin = getSupabaseAdmin()
      const meta = (user.user_metadata || {}) as Record<string, unknown>
      const fullName = buildFullName(meta)
      const username = buildUsername(user.id, user.email, meta)
      const avatarUrl =
        (typeof meta.avatar_url === "string" && meta.avatar_url) ||
        (typeof meta.picture === "string" && meta.picture) ||
        null

      const autoRow = {
        id: user.id,
        email: (user.email || "").trim(),
        username,
        full_name: fullName,
        avatar_url: avatarUrl,
        user_type: "member",
        member_category: "standard",
        is_active: true,
        mtm_auto_requested: true,
        mtm_auto_requested_at: now,
        mtm_auto_enabled: false,
        mtm_auto_enabled_at: null,
        mtm_auto_admin: false,
        created_at: new Date().toISOString(),
        updated_at: now,
      }

      const { data: upserted, error: upsertErr } = await supabaseAdmin
        .from("profiles")
        .upsert([autoRow], { onConflict: "id" })
        .select("id,email,username,full_name,mtm_auto_requested_at,mtm_auto_enabled")
        .maybeSingle()

      if (upsertErr) {
        return NextResponse.json(
          { error: "Erro ao criar profile para pedido MTM Auto", details: upsertErr.message },
          { status: 500 }
        )
      }

      profile = upserted
    }

    // Notificar todos os admins ativos (push + registo em notifications).
    const supabaseAdmin = getSupabaseAdmin()
    const { data: admins } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_type", "admin")
      .eq("is_active", true)

    const adminIds = (admins || []).map((a) => a.id)

    const requestedBy = profile?.full_name || profile?.username || "um utilizador"
    const title = "Pedido MTM Auto"
    const message = `${requestedBy} solicitou acesso ao MTM Auto.`
    const url = "/admin?tab=mtmauto"

    if (adminIds.length > 0) {
      // 1) Guardar para aparecer na área do utilizador/feeds (e permitir toast via realtime)
      await supabaseAdmin.from("notifications").insert(
        adminIds.map((id) => ({
          user_id: id,
          type: "admin_notification",
          title,
          message,
          data: {
            event: "mtm_auto_request",
            requested_user_id: user.id,
            url,
          },
          read: false,
        }))
      )

      // 2) Push (apenas para admins que tenham FCM token)
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.morethanmoney.pt"
      await fetch(`${siteUrl}/api/notifications/send-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: adminIds,
          title,
          body: message,
          data: {
            url,
            event: "mtm_auto_request",
            requested_user_id: user.id,
          },
          // Não enviar `data.type` para evitar duplicar inserts na tabela notifications.
        }),
      })
    }

    return NextResponse.json({ success: true, requested: true, requested_at: now })
  } catch (error: any) {
    return NextResponse.json({ error: "Erro interno", details: error?.message }, { status: 500 })
  }
}
