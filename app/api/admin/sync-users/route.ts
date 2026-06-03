import { NextRequest, NextResponse } from "next/server"
import type { User } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { requireAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

const ADMIN_EMAILS = new Set(
  ["ricardogarciapt@proton.me", "morethanmoneypt@gmail.com"].map((e) => e.toLowerCase())
)

const ALLOWED_USER_TYPES = new Set([
  "member",
  "admin",
  "pending",
  "guest",
  "presentation",
  "affiliate",
])

const ALLOWED_MEMBER_CATEGORY = new Set(["iq", "skool", "vip", "standard", "premium"])

function syncSecretAuthorized(request: NextRequest): boolean {
  const secret = process.env.SYNC_USERS_SECRET?.trim()
  if (!secret) return false
  const header = request.headers.get("x-sync-users-secret")
  return header === secret
}

async function authorizeSync(request: NextRequest): Promise<NextResponse | null> {
  if (syncSecretAuthorized(request)) return null
  return requireAdmin(request)
}

/** Lista todos os utilizadores em auth.users (paginado). */
async function listAllAuthUsers(): Promise<{ users: User[]; error?: string }> {
  const perPage = 1000
  const users: User[] = []
  let page = 1

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) return { users: [], error: error.message }
    users.push(...data.users)
    if (data.users.length < perPage) break
    page += 1
  }

  return { users }
}

function displayNameFromAuth(user: User): string {
  const m = user.user_metadata || {}
  const full =
    (typeof m.full_name === "string" && m.full_name.trim()) ||
    (typeof m.name === "string" && m.name.trim()) ||
    ""
  if (full) return full
  const local = user.email?.split("@")[0]
  return local?.trim() || "Utilizador"
}

function usernameFromAuth(user: User): string {
  const m = user.user_metadata || {}
  const fromMeta = typeof m.username === "string" ? m.username.trim() : ""
  if (fromMeta) return fromMeta
  const name = typeof m.name === "string" ? m.name.replace(/\s+/g, "").toLowerCase() : ""
  const prefix =
    name.length > 0
      ? name
      : (user.email?.split("@")[0] || "user").replace(/[^a-z0-9_]/gi, "")
  return `${prefix}_${user.id.replace(/-/g, "").slice(0, 10)}`
}

function avatarFromAuth(user: User): string | null {
  const m = user.user_metadata || {}
  const a =
    (typeof m.avatar_url === "string" && m.avatar_url) ||
    (typeof m.picture === "string" && m.picture) ||
    ""
  return a.trim() || null
}

function resolveUserType(user: User, existing: { user_type?: string | null } | null): string {
  const email = user.email?.toLowerCase()
  if (email && ADMIN_EMAILS.has(email)) return "admin"

  const fromMeta = user.user_metadata?.user_type
  if (typeof fromMeta === "string" && ALLOWED_USER_TYPES.has(fromMeta)) return fromMeta

  const existingType = existing?.user_type
  if (typeof existingType === "string" && ALLOWED_USER_TYPES.has(existingType)) return existingType

  return "member"
}

function resolveMemberCategory(
  user: User,
  existing: { member_category?: string | null } | null
): string | undefined {
  const fromMeta = user.user_metadata?.member_category
  if (typeof fromMeta === "string" && ALLOWED_MEMBER_CATEGORY.has(fromMeta)) return fromMeta
  return undefined
}

export async function POST(request: NextRequest) {
  const denied = await authorizeSync(request)
  if (denied) return denied

  try {
    const { users: authUsers, error: listErr } = await listAllAuthUsers()
    if (listErr) {
      return NextResponse.json({ error: listErr }, { status: 500 })
    }

    const { data: existingProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 })
    }

    const profileById = new Map((existingProfiles || []).map((p) => [p.id, p]))

    let created = 0
    let updated = 0
    let unchanged = 0
    const errors: { id: string; email?: string; message: string }[] = []

    for (const user of authUsers) {
      const existing = profileById.get(user.id) || null
      const userType = resolveUserType(user, existing)
      const email = (user.email || "").trim()
      const fullName = displayNameFromAuth(user)
      const username = usernameFromAuth(user)
      const avatarUrl = avatarFromAuth(user)
      const memberCat = resolveMemberCategory(user, existing)

      if (!existing) {
        const row: Record<string, unknown> = {
          id: user.id,
          email: email || `pending-${user.id}@users.invalid`,
          full_name: fullName,
          username,
          user_type: userType,
          member_category: memberCat ?? "standard",
          is_active: true,
          created_at: user.created_at,
          updated_at: new Date().toISOString(),
        }
        if (avatarUrl) row.avatar_url = avatarUrl

        const { error: insertError } = await supabase.from("profiles").insert(row)
        if (insertError) {
          errors.push({ id: user.id, email: user.email, message: insertError.message })
        } else {
          created += 1
          profileById.set(user.id, row as (typeof existingProfiles)[0])
        }
        continue
      }

      const nextEmail = email || existing.email
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (nextEmail && nextEmail !== existing.email) patch.email = nextEmail
      if (userType !== existing.user_type) patch.user_type = userType
      if (fullName && fullName !== (existing.full_name || "")) patch.full_name = fullName
      if (memberCat !== undefined && memberCat !== (existing.member_category || "standard")) {
        patch.member_category = memberCat
      }
      if (avatarUrl && avatarUrl !== (existing.avatar_url || "")) patch.avatar_url = avatarUrl

      const dataKeys = Object.keys(patch).filter((k) => k !== "updated_at")
      if (dataKeys.length === 0) {
        unchanged += 1
        continue
      }

      const { error: upErr } = await supabase.from("profiles").update(patch).eq("id", user.id)
      if (upErr) {
        errors.push({ id: user.id, email: user.email, message: upErr.message })
      } else {
        updated += 1
      }
    }

    const authIds = new Set(authUsers.map((u) => u.id))
    const orphanProfiles = (existingProfiles || []).filter((p) => !authIds.has(p.id)).length

    const { data: allAdmins } = await supabase.from("profiles").select("id,email").eq("user_type", "admin")

    return NextResponse.json({
      success: true,
      summary: {
        totalAuthUsers: authUsers.length,
        profilesBefore: existingProfiles?.length || 0,
        profilesCreated: created,
        profilesUpdated: updated,
        profilesUnchanged: unchanged,
        orphanProfiles,
        totalAdmins: allAdmins?.length || 0,
      },
      admins: allAdmins || [],
      errors: errors.length ? errors : undefined,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido"
    console.error("❌ [sync-users]", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const denied = await authorizeSync(request)
  if (denied) return denied

  try {
    const { users: authUsers, error: listErr } = await listAllAuthUsers()
    if (listErr) {
      return NextResponse.json({ error: listErr }, { status: 500 })
    }

    const { data: profiles, error: profilesError } = await supabase.from("profiles").select("*")

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 })
    }

    const authIds = new Set(authUsers.map((u) => u.id))
    const orphanProfiles = (profiles || []).filter((p) => !authIds.has(p.id))

    const admins = profiles?.filter((p) => p.user_type === "admin") || []
    const pendingUsers = profiles?.filter((p) => p.user_type === "pending") || []
    const activeUsers = profiles?.filter((p) => p.is_active) || []

    return NextResponse.json({
      summary: {
        totalAuthUsers: authUsers.length,
        totalProfiles: profiles?.length || 0,
        missingProfiles: authUsers.filter((u) => !profiles?.some((p) => p.id === u.id)).length,
        orphanProfiles: orphanProfiles.length,
        admins: admins.length,
        pendingUsers: pendingUsers.length,
        activeUsers: activeUsers.length,
      },
      admins: admins.map((admin) => ({
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        username: admin.username,
        is_active: admin.is_active,
        created_at: admin.created_at,
      })),
      recentUsers:
        profiles
          ?.slice()
          .sort(
            (a, b) =>
              new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          )
          .slice(0, 10)
          .map((user) => ({
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            username: user.username,
            user_type: user.user_type,
            member_category: user.member_category,
            is_active: user.is_active,
            created_at: user.created_at,
          })) || [],
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    console.error("❌ [sync-users GET]", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
