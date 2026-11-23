/**
 * Ligar a conta Threads (@ricardogarciapt). Só admin.
 *  GET sem `code` → manda para o ecrã de autorização do Threads.
 *  GET com `code` → troca por token de longa duração (60 dias) e guarda em site_settings.threads_token.
 * Precisa de THREADS_APP_ID e THREADS_APP_SECRET (app Meta com o caso de uso «Threads API»), e do
 * redirect https://www.morethanmoney.pt/api/threads/oauth na lista de URIs de redirecionamento da app.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAccess } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ESCOPOS, THREADS_GRAPH, guardarToken } from '@/lib/threads/cliente'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt').replace(/\/$/, '')
const REDIRECT = `${SITE}/api/threads/oauth`

export async function GET(req: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 })

  const appId = process.env.THREADS_APP_ID?.trim()
  const segredo = process.env.THREADS_APP_SECRET?.trim()
  if (!appId || !segredo) {
    return NextResponse.json({ error: 'Faltam THREADS_APP_ID e THREADS_APP_SECRET na Vercel.' }, { status: 500 })
  }

  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    const url = new URL('https://threads.net/oauth/authorize')
    url.searchParams.set('client_id', appId)
    url.searchParams.set('redirect_uri', REDIRECT)
    url.searchParams.set('scope', ESCOPOS)
    url.searchParams.set('response_type', 'code')
    return NextResponse.redirect(url.toString())
  }

  try {
    const curto = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: appId,
        client_secret: segredo,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT,
        code: code.replace(/#_$/, ''),
      }),
    }).then((r) => r.json() as Promise<{ access_token?: string; user_id?: string | number; error_message?: string }>)
    if (!curto.access_token) throw new Error(curto.error_message || 'sem token curto')

    const longo = await fetch(
      `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(segredo)}&access_token=${encodeURIComponent(curto.access_token)}`,
    ).then((r) => r.json() as Promise<{ access_token?: string; expires_in?: number }>)
    if (!longo.access_token) throw new Error('sem token longo')

    const eu = await fetch(`${THREADS_GRAPH}/me?fields=id,username&access_token=${encodeURIComponent(longo.access_token)}`)
      .then((r) => r.json() as Promise<{ id?: string; username?: string }>)

    await guardarToken(getSupabaseAdmin(), {
      access_token: longo.access_token,
      user_id: String(eu.id ?? curto.user_id ?? ''),
      username: eu.username,
      expira_em: new Date(Date.now() + (longo.expires_in ?? 5_184_000) * 1000).toISOString(),
    })
    return NextResponse.json({ ok: true, conta: eu.username ?? null })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
