import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
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
      }
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Se já existir e for admin, não alteramos o user_type/is_active.
    const { data: existing } = await supabaseAdmin.from("profiles").select("id,user_type,is_active").eq("id", user.id).maybeSingle()
    if (existing?.user_type === "admin") {
      return NextResponse.json({ success: true, profile: existing })
    }

    const meta = (user.user_metadata || {}) as Record<string, unknown>
    const fullName =
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      "Utilizador"
    const avatarUrl =
      (typeof meta.avatar_url === "string" && meta.avatar_url) ||
      (typeof meta.picture === "string" && meta.picture) ||
      null

    // Fallback: se não for possível obter setting de aprovações, assume-se auto-aprovação.
    const autoApprove = true

    const row = {
      id: user.id,
      email: (user.email || "").trim(),
      full_name: fullName,
      username: buildUsername(user.id, user.email, meta),
      avatar_url: avatarUrl,
      user_type: autoApprove ? "member" : "pending",
      member_category: "standard",
      is_active: autoApprove,
      created_at: existing ? existing.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Serviço role bypassa RLS e garante inserção mesmo quando o client anon falha.
    const { data: upserted, error: upsertErr } = await supabaseAdmin
      .from("profiles")
      .upsert([row], { onConflict: "id" })
      .select()
      .maybeSingle()

    if (upsertErr) {
      return NextResponse.json({ error: "Erro ao harmonizar perfil", details: upsertErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, profile: upserted })
  } catch (error: any) {
    return NextResponse.json({ error: "Erro interno", details: error?.message }, { status: 500 })
  }
}

