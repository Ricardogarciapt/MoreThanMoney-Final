import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

/**
 * Callback de recuperação de password.
 * Suporta token_hash (email custom MTM), code PKCE e redirect com hash (client).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone()
  const origin = url.origin
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const authError = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  if (authError) {
    console.error('[auth/reset-callback]', authError, errorDescription)
    return NextResponse.redirect(
      new URL(
        `/reset-password?error=${encodeURIComponent(errorDescription || authError)}`,
        origin,
      ),
    )
  }

  // Sem parâmetros — Supabase pode redirecionar com tokens no hash (#access_token)
  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL('/reset-password', origin))
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

  if (tokenHash && type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    })
    if (error) {
      console.error('[auth/reset-callback] verifyOtp:', error.message)
      return NextResponse.redirect(
        new URL('/reset-password?error=invalid_or_expired', origin),
      )
    }
    return response
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth/reset-callback] exchangeCodeForSession:', error.message)
      return NextResponse.redirect(
        new URL('/reset-password?error=invalid_or_expired', origin),
      )
    }
    return response
  }

  return NextResponse.redirect(new URL('/reset-password', origin))
}
