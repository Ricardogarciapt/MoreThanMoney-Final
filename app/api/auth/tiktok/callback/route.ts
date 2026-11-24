import { NextRequest, NextResponse } from 'next/server'

// GET /api/auth/tiktok/callback
// Redirect do Login Kit do TikTok. Troca o código por token no servidor.
// Nunca devolve tokens ao browser: só confirma a ligação e o open_id.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/admin?tiktok=erro', req.url))
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET
  if (!clientKey || !clientSecret) {
    return NextResponse.json({ error: 'TikTok não configurado' }, { status: 503 })
  }

  try {
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: 'https://morethanmoney.pt/api/auth/tiktok/callback',
    })
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.open_id) {
      return NextResponse.json({ error: 'Falha na troca do código TikTok' }, { status: 502 })
    }
    // Guardar access/refresh tokens: a tabela de contas sociais ainda não existe neste repo.
    return NextResponse.json({ ok: true, open_id: data.open_id })
  } catch {
    return NextResponse.json({ error: 'Erro de rede com o TikTok' }, { status: 502 })
  }
}
