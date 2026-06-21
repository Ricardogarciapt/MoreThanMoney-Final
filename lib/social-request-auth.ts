import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export type SocialSession = {
  userId: string
  fullName: string
  email: string | null
}

export async function getSocialSession(request: NextRequest): Promise<SocialSession | null> {
  const supabase = getSupabaseAdmin()
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, username, email')
    .eq('id', data.user.id)
    .maybeSingle()

  const fullName =
    profile?.full_name ||
    profile?.username ||
    data.user.user_metadata?.full_name ||
    data.user.email?.split('@')[0] ||
    'Membro'

  return {
    userId: data.user.id,
    fullName,
    email: profile?.email ?? data.user.email ?? null,
  }
}
