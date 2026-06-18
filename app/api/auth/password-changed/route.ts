import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendPasswordChangedEmail } from '@/lib/email-service'

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

export async function POST(request: NextRequest) {
  let response = NextResponse.json({ ok: true })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user?.email) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
  }

  const email = user.email.trim().toLowerCase()
  const admin = getSupabaseAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, username')
    .eq('email', email)
    .maybeSingle()

  const userName = profile?.full_name?.trim() || user.user_metadata?.full_name || email.split('@')[0]
  const username = profile?.username?.trim() || user.user_metadata?.username || email.split('@')[0]

  await sendPasswordChangedEmail(email, userName, username)

  return response
}
