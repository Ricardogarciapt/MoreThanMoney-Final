import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'
import { mergeAccessMigration } from '@/lib/access-migration'

const supabase = getSupabaseAdmin()

async function getEducatorEmails(): Promise<Set<string>> {
  const { data } = await supabase.from('lms_educators').select('email')
  const set = new Set<string>()
  for (const row of data ?? []) {
    const e = (row.email as string | undefined)?.trim().toLowerCase()
    if (e) set.add(e)
  }
  return set
}

/**
 * Desloga globalmente todos os utilizadores excepto admin e educadores LMS.
 * Marca access_revalidation_required em profile_data.
 */
export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const dryRun = body.dry_run === true

  const educatorEmails = await getEducatorEmails()

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, user_type, profile_data')
    .neq('user_type', 'admin')

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const targets = (profiles ?? []).filter((p) => {
    const email = (p.email as string | undefined)?.trim().toLowerCase()
    if (email && educatorEmails.has(email)) return false
    return true
  })

  if (dryRun) {
    return NextResponse.json({
      success: true,
      dry_run: true,
      would_affect: targets.length,
      exempt_educators: educatorEmails.size,
    })
  }

  let signedOut = 0
  let updated = 0
  const errors: string[] = []

  for (const profile of targets) {
    const profileData = mergeAccessMigration(profile, {
      access_revalidation_required: true,
      access_migration_completed_at: null,
      access_validation_status: null,
      access_payment_channel: null,
    })

    const { error: upErr } = await supabase
      .from('profiles')
      .update({
        profile_data: profileData,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id)

    if (upErr) {
      errors.push(`${profile.id}: ${upErr.message}`)
      continue
    }
    updated++

    try {
      await supabase.auth.admin.signOut(profile.id as string, 'global')
      signedOut++
    } catch (signErr) {
      const msg = signErr instanceof Error ? signErr.message : 'signOut failed'
      errors.push(`signOut ${profile.id}: ${msg}`)
    }
  }

  return NextResponse.json({
    success: true,
    updated,
    signed_out: signedOut,
    total_targets: targets.length,
    errors: errors.slice(0, 20),
    message: `${signedOut} sessão(ões) terminada(s). ${updated} perfil(is) marcados para revalidação.`,
  })
}
