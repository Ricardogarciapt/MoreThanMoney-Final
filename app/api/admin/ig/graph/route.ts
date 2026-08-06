import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy da Instagram Graph API — fala com graph.facebook.com usando o INSTAGRAM_TOKEN do
 * servidor (nunca exposto ao cliente). Autenticado por Bearer CRON_SECRET. Permite ler
 * media/comentários/conversas/insights e responder a comentários / enviar DMs pela via OFICIAL
 * (sem risco de bloqueio como a automação de browser).
 *
 * body: { method?: 'GET'|'POST'|'DELETE', path: string, params?: Record<string,string|number> }
 *   path = caminho da Graph API sem a versão (ex.: "17841405656956716/media", "<comment-id>/replies")
 */
export const dynamic = 'force-dynamic'

const GRAPH = 'https://graph.facebook.com/v21.0'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || (req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as {
    method?: string
    path?: string
    params?: Record<string, string | number>
    account?: string
  }
  // account='ricardo' → token pessoal (@ricardogarciapt); senão o da marca (@morethanmoney.pt).
  const acc = (body.account || '').toLowerCase()
  const token =
    acc === 'ricardo' || acc === 'personal' || acc === 'ricardogarciapt'
      ? process.env.INSTAGRAM_TOKEN_RICARDO || process.env.INSTAGRAM_TOKEN
      : process.env.INSTAGRAM_TOKEN || process.env.IG_TOKEN || process.env.META_IG_TOKEN
  if (!token) return NextResponse.json({ ok: false, error: 'token IG em falta no servidor' }, { status: 500 })
  const method = (body.method || 'GET').toUpperCase()
  const path = (body.path || '').replace(/^\/+/, '')
  if (!path) return NextResponse.json({ ok: false, error: 'path obrigatório' }, { status: 400 })

  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body.params || {})) params.set(k, String(v))
  params.set('access_token', token)

  try {
    let url = `${GRAPH}/${path}`
    const init: RequestInit = { method }
    if (method === 'GET' || method === 'DELETE') {
      url += `?${params.toString()}`
    } else {
      init.body = params
    }
    const res = await fetch(url, init)
    const data = await res.json().catch(() => ({}))
    return NextResponse.json({ ok: res.ok, status: res.status, data })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
