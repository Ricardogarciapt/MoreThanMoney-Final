import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  ACCESS_MIGRATION_COPY,
  isAccessMigrationExempt,
  isIqonicValidationPending,
  needsAccessRevalidation,
  readAccessMigration,
} from '@/lib/access-migration'

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

async function authUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)
  return user
}

export async function GET(request: NextRequest) {
  const user = await authUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
  }

  const educatorEmails = await getEducatorEmails()
  const migration = readAccessMigration(profile)
  const required = needsAccessRevalidation(profile, educatorEmails)
  const iqonicPending = isIqonicValidationPending(profile)

  return NextResponse.json({
    required,
    exempt: isAccessMigrationExempt(profile, educatorEmails),
    iqonic_pending: iqonicPending,
    migration,
    copy: ACCESS_MIGRATION_COPY,
    profile: {
      full_name: profile.full_name,
      email: profile.email,
      member_category: profile.member_category,
      subscription_plan: profile.subscription_plan,
    },
  })
}
