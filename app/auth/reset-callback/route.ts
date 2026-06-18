import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

/**
 * Troca o código de recuperação de password no servidor (PKCE).
 * Evita falhas quando o utilizador abre o link noutro browser.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone()
  const code = url.searchParams.get('code')
  const origin = url.origin

  if (!code) {
    return NextResponse.redirect(new URL('/forgot-password?error=missing_code', origin))
  }

  let response = NextResponse.redirect(new URL('/reset-password?recovered=1', origin))

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

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[auth/reset-callback] exchangeCodeForSession:', error.message)
    return NextResponse.redirect(
      new URL('/forgot-password?error=invalid_or_expired', origin),
    )
  }

  return response
}
