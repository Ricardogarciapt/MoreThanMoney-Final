import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  type AccessPaymentChannel,
  mergeAccessMigration,
  needsAccessRevalidation,
} from '@/lib/access-migration'

const supabase = getSupabaseAdmin()

const VALID_CHANNELS: AccessPaymentChannel[] = ['stripe', 'skool', 'iqonic']

async function authUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)
  return user
}

export async function POST(request: NextRequest) {
  const user = await authUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const channel = body.channel as AccessPaymentChannel

  if (!VALID_CHANNELS.includes(channel)) {
    return NextResponse.json({ error: 'Canal inválido' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
  }

  const educatorEmails = new Set<string>()
  const { data: educators } = await supabase.from('lms_educators').select('email')
  for (const e of educators ?? []) {
    const em = (e.email as string | undefined)?.trim().toLowerCase()
    if (em) educatorEmails.add(em)
  }

  if (!needsAccessRevalidation(profile, educatorEmails)) {
    return NextResponse.json({ success: true, already_complete: true })
  }

  const profileData = mergeAccessMigration(profile, {
    access_payment_channel: channel,
  })

  const patch: Record<string, unknown> = {
    profile_data: profileData,
    updated_at: new Date().toISOString(),
  }

  if (channel === 'skool') {
    patch.member_category = 'skool'
    patch.subscription_platform = 'skool'
    patch.onboarding_platform = 'skool'
  }

  if (channel === 'iqonic') {
    patch.member_category = 'iq'
    patch.onboarding_platform = 'iqonic'
  }

  await supabase.from('profiles').update(patch).eq('id', user.id)

  return NextResponse.json({
    success: true,
    channel,
    next_step: channel === 'stripe' ? 'checkout' : channel === 'iqonic' ? 'iqonic_form' : 'skool_instructions',
  })
}
