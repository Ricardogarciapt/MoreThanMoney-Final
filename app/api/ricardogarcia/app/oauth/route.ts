import { NextRequest, NextResponse } from 'next/server'
import { clienteSessao } from '@/lib/ricardogarcia/app'
import { buildOAuthCallbackUrl } from '@/lib/oauth-flow'

export const dynamic = 'force-dynamic'

// Entrar na app do Ricardo com Google ou Apple: os mesmos métodos do /login da MoreThanMoney.
// O PKCE fica nos cookies do site (cliente de servidor), e /auth/callback troca o código como sempre.
// No regresso, /auth/post-oauth vê o destino /ricardogarcia/app e cria o perfil gratuito se faltar.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get('p')
  if (p !== 'google' && p !== 'apple') return NextResponse.redirect(new URL('/ricardogarcia/app', req.nextUrl.origin))
  const sb = await clienteSessao()
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: p,
    options: {
      redirectTo: buildOAuthCallbackUrl(req.nextUrl.origin, { flow: 'login', redirect: '/ricardogarcia/app' }),
      skipBrowserRedirect: true,
      ...(p === 'google' ? { queryParams: { access_type: 'offline', prompt: 'select_account' } } : {}),
    },
  })
  if (error || !data?.url) return NextResponse.redirect(new URL('/ricardogarcia/app?erro=oauth', req.nextUrl.origin))
  return NextResponse.redirect(data.url)
}
