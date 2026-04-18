import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserProfile } from "@/lib/role-redirect"

type SessionLike = {
  user: {
    id: string
    email?: string | null
    user_metadata?: Record<string, unknown> | null
  }
}

export async function loadAutoApproveSetting(): Promise<boolean> {
  try {
    const r = await fetch("/api/admin/settings")
    if (!r.ok) return true
    const j = await r.json()
    return j?.data?.auto_approve_users ?? true
  } catch {
    return true
  }
}

function buildUsername(session: SessionLike): string {
  const u = session.user
  const meta = (u.user_metadata || {}) as Record<string, unknown>
  const name = typeof meta.name === "string" ? meta.name.replace(/\s+/g, "").toLowerCase() : ""
  const prefix =
    name.length > 0 ? name : (u.email?.split("@")[0] || "user").replace(/[^a-z0-9_]/gi, "")
  return `${prefix}_${u.id.replace(/-/g, "").slice(0, 10)}`
}

/**
 * Garante que existe uma linha em public.profiles para o utilizador autenticado.
 * Alinha com auth.users (OAuth, email/password) e evita colisões de username.
 */
export async function ensureMemberProfile(
  supabase: SupabaseClient,
  session: SessionLike,
  options?: { respectAutoApprove?: boolean }
): Promise<UserProfile | null> {
  const userId = session.user.id

  const { data: existing, error: fetchErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle()

  if (existing) return existing as UserProfile

  if (fetchErr) {
    console.warn("[ensureMemberProfile] leitura:", fetchErr.message)
  }

  let autoApprove = true
  if (options?.respectAutoApprove !== false) {
    autoApprove = await loadAutoApproveSetting()
  }

  const meta = (session.user.user_metadata || {}) as Record<string, unknown>
  const fullName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "Utilizador"
  const avatar =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    null

  const row: Record<string, unknown> = {
    id: userId,
    email: session.user.email,
    full_name: fullName,
    username: buildUsername(session),
    avatar_url: avatar,
    user_type: autoApprove ? "member" : "pending",
    member_category: "standard",
    is_active: autoApprove,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data: upserted, error: upsertError } = await supabase
    .from("profiles")
    .upsert([row], { onConflict: "id" })
    .select()
    .single()

  if (!upsertError && upserted) return upserted as UserProfile

  if (upsertError?.code === "23505") {
    const { data: again } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
    if (again) return again as UserProfile
  }

  // Fallback: alguns fluxos OAuth podem falhar no insert/upsert via RLS.
  // Neste caso, chamamos um endpoint server-side que faz o upsert com service-role.
  try {
    const res = await fetch("/api/profile/harmonize", { method: "POST" })
    if (res.ok) {
      const data = await res.json()
      if (data?.profile) return data.profile as UserProfile
    }
  } catch (e) {
    // Ignorar, vamos devolver null abaixo.
  }

  console.error("[ensureMemberProfile] falha ao sincronizar perfil:", upsertError)
  return null
}
