import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizeNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notification-preferences'

const supabase = getSupabaseAdmin()

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user.id
}

export async function GET(request: NextRequest) {
  const userId = await resolveUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('notification_preferences')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    preferences: normalizeNotificationPreferences(data?.notification_preferences),
  })
}

export async function PATCH(request: NextRequest) {
  const userId = await resolveUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const patch = body.preferences ?? body

  const { data: current, error: readError } = await supabase
    .from('profiles')
    .select('notification_preferences')
    .eq('id', userId)
    .maybeSingle()

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 })
  }

  const merged = normalizeNotificationPreferences(current?.notification_preferences)
  for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES) as (keyof NotificationPreferences)[]) {
    if (typeof patch[key] === 'boolean') merged[key] = patch[key]
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ notification_preferences: merged })
    .eq('id', userId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ preferences: merged as NotificationPreferences })
}
