import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { safeInternalRedirectPath } from '@/lib/role-redirect'
import { verifyAppleIdentityToken } from '@/lib/apple-iap'

const supabase = getSupabaseAdmin()

// POST /api/auth/apple-signin
// Valida o identity token do Sign in with Apple e autentica/cria o utilizador no Supabase.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      identityToken,
      nonce,
      appleUserId,
      email:      providedEmail,
      fullName:   providedName = '',
      givenName:  providedGivenName = '',
      familyName: providedFamilyName = '',
      redirect:   redirectPath = '',
    } = body

    if (!identityToken || !nonce) {
      return NextResponse.json({ error: 'identityToken e nonce obrigatórios' }, { status: 400 })
    }

    // Verificar token com Apple JWKS
    const appleUser = await verifyAppleIdentityToken(identityToken, nonce)
    if (!appleUser) {
      return NextResponse.json({ error: 'Token Apple inválido' }, { status: 401 })
    }

    const resolvedEmail = appleUser.email || providedEmail
    const resolvedName  = providedName || `${providedGivenName} ${providedFamilyName}`.trim() || resolvedEmail?.split('@')[0] || 'Utilizador MTM'

    if (!resolvedEmail) {
      return NextResponse.json({
        error: 'Email não disponível. O utilizador escolheu ocultar o email — pedimos o email directamente.',
        requiresEmail: true,
        appleUserId: appleUser.appleUserId,
      }, { status: 422 })
    }

    // Verificar se já existe conta Supabase
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, email, user_type, subscription_status, is_active, member_category')
      .eq('email', resolvedEmail.toLowerCase())
      .maybeSingle()

    if (existingProfile) {
      const siteBase = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.morethanmoney.pt').replace(/\/$/, '')
      const safeRedirect = safeInternalRedirectPath(redirectPath) || '/app-mobile'
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type:  'magiclink',
        email: resolvedEmail.toLowerCase(),
        options: { redirectTo: `${siteBase}${safeRedirect}` },
      })

      if (linkError) {
        console.error('[SIWA] Erro ao gerar magic link:', linkError)
        return NextResponse.json({ error: 'Erro ao autenticar' }, { status: 500 })
      }

      return NextResponse.json({
        success:  true,
        action:   'login',
        userId:   existingProfile.id,
        email:    resolvedEmail,
        magicLink: linkData?.properties?.action_link,
        profile:  {
          id:                  existingProfile.id,
          subscription_status: existingProfile.subscription_status,
          member_category:     existingProfile.member_category,
          is_active:           existingProfile.is_active,
        },
      })
    }

    // Novo utilizador — retornar dados para o cliente continuar com o fluxo IAP → registo
    return NextResponse.json({
      success:        true,
      action:         'register',
      appleUserId:    appleUser.appleUserId,
      email:          resolvedEmail,
      fullName:       resolvedName,
      emailVerified:  appleUser.emailVerified,
      requiresSubscription: true,
    })
  } catch (err) {
    console.error('[SIWA] Erro:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
