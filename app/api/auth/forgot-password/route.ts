import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendPasswordRecoveryEmail } from '@/lib/email-service'
import { getSiteUrl } from '@/lib/mail-transport'

export const dynamic = 'force-dynamic'

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function resolveProfile(email: string) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('profiles')
    .select('full_name, username, email')
    .eq('email', email)
    .maybeSingle()

  return {
    userName: data?.full_name?.trim() || email.split('@')[0] || 'Membro MTM',
    username: data?.username?.trim() || email.split('@')[0] || '—',
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = normalizeEmail(String(body.email ?? ''))

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
    }

    const siteUrl = getSiteUrl()
    const redirectTo = `${siteUrl}/auth/reset-callback`
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })

    if (error) {
      // Não revelar se o email existe — resposta genérica
      console.warn('[forgot-password] generateLink:', error.message)
      return NextResponse.json({
        ok: true,
        message: 'Se existir uma conta com este email, receberás instruções em breve.',
      })
    }

    const tokenHash =
      data.properties?.hashed_token ||
      (() => {
        const actionLink = data.properties?.action_link ?? ''
        const match = actionLink.match(/[?&]token=([^&]+)/)
        return match?.[1] ?? null
      })()

    if (!tokenHash) {
      console.error('[forgot-password] token_hash em falta no generateLink')
      return NextResponse.json({
        ok: true,
        message: 'Se existir uma conta com este email, receberás instruções em breve.',
      })
    }

    const resetLink = `${siteUrl}/auth/reset-callback?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`
    const { userName, username } = await resolveProfile(email)

    await sendPasswordRecoveryEmail(email, userName, username, resetLink)

    return NextResponse.json({
      ok: true,
      message: 'Se existir uma conta com este email, receberás instruções em breve.',
    })
  } catch (err) {
    console.error('[forgot-password]', err)
    return NextResponse.json({ error: 'Erro ao processar pedido.' }, { status: 500 })
  }
}
