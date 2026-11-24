import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { refreshTokenYoutube } from '@/lib/youtube/ligacao'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Sobe para o canal um vídeo que JÁ está publicado no próprio site (ex.: /skool/videos/*.mp4).
 * Só admin. POST { caminho: '/skool/videos/x.mp4', titulo, descricao?, privacidade?: 'unlisted'|'private'|'public' }
 * Por omissão fica NÃO LISTADO. Só aceita caminhos do próprio site, para não servir de proxy a nada de fora.
 */
async function token(): Promise<string> {
  const cid = (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim()
  const secret = (process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim()
  const refresh = await refreshTokenYoutube()
  if (!cid || !secret || !refresh) throw new Error('credenciais do YouTube em falta')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
  })
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error?: string }
  if (!j.access_token) throw new Error(`token do YouTube recusado: ${j.error ?? 'sem access_token'}`)
  return j.access_token
}

export async function POST(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado
  const b = (await req.json().catch(() => ({}))) as { caminho?: string; titulo?: string; descricao?: string; privacidade?: string }
  const caminho = String(b.caminho || '')
  if (!/^\/[a-z0-9/_-]+\.mp4$/i.test(caminho) || caminho.includes('..')) {
    return NextResponse.json({ ok: false, erro: 'caminho inválido (só .mp4 do próprio site)' }, { status: 400 })
  }
  const titulo = String(b.titulo || '').slice(0, 100)
  if (!titulo) return NextResponse.json({ ok: false, erro: 'falta o título' }, { status: 400 })
  const privacidade = ['unlisted', 'private', 'public'].includes(String(b.privacidade)) ? String(b.privacidade) : 'unlisted'
  try {
    const video = Buffer.from(await (await fetch(new URL(caminho, req.nextUrl.origin))).arrayBuffer())
    if (video.length < 10_000) throw new Error('vídeo não encontrado no site')
    const t = await token()
    const abrir = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'content-type': 'application/json', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(video.length) },
      body: JSON.stringify({
        snippet: { title: titulo, description: String(b.descricao || '').slice(0, 5000), categoryId: '27', defaultLanguage: 'pt-PT', defaultAudioLanguage: 'pt-PT' },
        status: { privacyStatus: privacidade, selfDeclaredMadeForKids: false },
      }),
    })
    if (!abrir.ok) throw new Error(`YouTube ${abrir.status}: ${(await abrir.text()).slice(0, 200)}`)
    const destino = abrir.headers.get('location')
    if (!destino) throw new Error('o YouTube não devolveu destino de upload')
    const enviar = await fetch(destino, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: new Uint8Array(video) })
    if (!enviar.ok) throw new Error(`upload ${enviar.status}: ${(await enviar.text()).slice(0, 200)}`)
    const j = (await enviar.json()) as { id?: string }
    if (!j.id) throw new Error('o upload não devolveu id')
    return NextResponse.json({ ok: true, videoId: j.id, url: `https://www.youtube.com/watch?v=${j.id}` })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
