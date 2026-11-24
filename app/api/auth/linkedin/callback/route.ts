import { NextRequest, NextResponse } from 'next/server'
import { guardarContaRede } from '@/lib/redes/contas'

// GET /api/auth/linkedin/callback
// Redirect do OAuth do LinkedIn. Troca o código no servidor, lê o perfil (sub) e guarda
// o token em redes_contas. Nunca devolve tokens ao browser.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/admin?linkedin=erro', req.url))
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'LinkedIn não configurado' }, { status: 503 })
  }

  try {
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://morethanmoney.pt/api/auth/linkedin/callback',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })
    const token = await tokenRes.json().catch(() => null)
    if (!tokenRes.ok || !token?.access_token) {
      return NextResponse.json({ error: 'Falha na troca do código LinkedIn' }, { status: 502 })
    }

    const perfilRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
    const perfil = await perfilRes.json().catch(() => null)
    if (!perfilRes.ok || !perfil?.sub) {
      return NextResponse.json({ error: 'Falha ao ler o perfil LinkedIn' }, { status: 502 })
    }

    await guardarContaRede({
      rede: 'linkedin',
      externalId: String(perfil.sub),
      handle: typeof perfil.name === 'string' ? perfil.name : null,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresInSeg: Number(token.expires_in) || null,
      refreshExpiresInSeg: Number(token.refresh_token_expires_in) || null,
      scopes: typeof token.scope === 'string' ? token.scope.split(' ') : [],
    })
    return NextResponse.json({ ok: true, sub: perfil.sub })
  } catch {
    return NextResponse.json({ error: 'Erro ao ligar a conta LinkedIn' }, { status: 502 })
  }
}
