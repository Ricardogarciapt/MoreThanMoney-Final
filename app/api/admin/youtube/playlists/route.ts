import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'

/**
 * Token do YouTube para esta rota. Lê YOUTUBE_CLIENT_ID/SECRET e, na falta deles, GOOGLE_CLIENT_ID/SECRET
 * (o par que existe em produção). O refresh token é o YOUTUBE_REFRESH_TOKEN. Não toca no helper partilhado
 * do videocliper, para não mudar a publicação que já corre.
 */
async function tokenDoYoutube(): Promise<string> {
  const cid = (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim()
  const secret = (process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim()
  const refresh = (process.env.YOUTUBE_REFRESH_TOKEN || '').trim()
  if (!cid || !secret || !refresh) throw new Error('credenciais do YouTube em falta (client id, client secret, refresh token)')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
  })
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error?: string }
  if (!j.access_token) throw new Error(`token do YouTube recusado: ${j.error ?? 'sem access_token'}`)
  return j.access_token
}

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Limpeza de playlists do YouTube (só admin).
 *
 * GET  ?playlist=PL…            lista os itens da playlist (posição, id do item, id do vídeo, título).
 * POST { playlist, remover?: [itemId…], mover?: [{ itemId, videoId, posicao }…], confirmar: true }
 *      remover → tira o vídeo DA PLAYLIST (playlistItems.delete). Não apaga vídeos do canal.
 *      mover   → muda a posição de um item (playlistItems.update).
 *      Sem confirmar: true não escreve nada e só devolve o que faria (dry-run).
 */

const API = 'https://www.googleapis.com/youtube/v3'
const ID_PLAYLIST = /^PL[A-Za-z0-9_-]{10,}$/
const ID_ITEM = /^[A-Za-z0-9_-]{5,}$/
const ID_VIDEO = /^[A-Za-z0-9_-]{11}$/

type Item = { itemId: string; videoId: string; titulo: string; posicao: number; publicadoEm: string }

async function listar(token: string, playlist: string): Promise<Item[]> {
  const itens: Item[] = []
  let pagina = ''
  do {
    const url = new URL(`${API}/playlistItems`)
    url.searchParams.set('part', 'snippet,status')
    url.searchParams.set('playlistId', playlist)
    url.searchParams.set('maxResults', '50')
    if (pagina) url.searchParams.set('pageToken', pagina)
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    const j = (await r.json().catch(() => ({}))) as {
      items?: Array<{ id: string; snippet: { title: string; position: number; publishedAt: string; resourceId: { videoId: string } } }>
      nextPageToken?: string
      error?: { message?: string }
    }
    if (!r.ok) throw new Error(`playlistItems.list ${r.status}: ${j.error?.message ?? ''}`)
    for (const it of j.items ?? []) {
      itens.push({
        itemId: it.id,
        videoId: it.snippet.resourceId.videoId,
        titulo: it.snippet.title,
        posicao: it.snippet.position,
        publicadoEm: it.snippet.publishedAt,
      })
    }
    pagina = j.nextPageToken ?? ''
  } while (pagina)
  return itens
}

export async function GET(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado
  const playlist = req.nextUrl.searchParams.get('playlist') ?? ''
  if (!ID_PLAYLIST.test(playlist)) return NextResponse.json({ erro: 'playlist inválida' }, { status: 400 })
  try {
    const token = await tokenDoYoutube()
    const itens = await listar(token, playlist)
    return NextResponse.json({ playlist, total: itens.length, itens })
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'erro no YouTube' }, { status: 502 })
  }
}

type Corpo = {
  playlist?: string
  remover?: string[]
  mover?: Array<{ itemId: string; videoId: string; posicao: number }>
  confirmar?: boolean
}

export async function POST(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado
  const corpo = (await req.json().catch(() => null)) as Corpo | null
  const playlist = corpo?.playlist ?? ''
  if (!ID_PLAYLIST.test(playlist)) return NextResponse.json({ erro: 'playlist inválida' }, { status: 400 })
  const remover = (corpo?.remover ?? []).filter(i => ID_ITEM.test(i))
  const mover = (corpo?.mover ?? []).filter(m => ID_ITEM.test(m.itemId) && ID_VIDEO.test(m.videoId) && Number.isInteger(m.posicao) && m.posicao >= 0)
  if (remover.length + mover.length === 0) return NextResponse.json({ erro: 'nada a fazer' }, { status: 400 })

  if (corpo?.confirmar !== true) {
    return NextResponse.json({ dryRun: true, playlist, removeria: remover.length, moveria: mover.length, remover, mover })
  }

  try {
    const token = await tokenDoYoutube()
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const feitos = { removidos: [] as string[], movidos: [] as string[], falhas: [] as Array<{ itemId: string; erro: string }> }

    for (const itemId of remover) {
      const r = await fetch(`${API}/playlistItems?id=${encodeURIComponent(itemId)}`, { method: 'DELETE', headers })
      if (r.ok) feitos.removidos.push(itemId)
      else feitos.falhas.push({ itemId, erro: `DELETE ${r.status}: ${(await r.text()).slice(0, 200)}` })
    }
    for (const m of mover) {
      const r = await fetch(`${API}/playlistItems?part=snippet`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          id: m.itemId,
          snippet: { playlistId: playlist, resourceId: { kind: 'youtube#video', videoId: m.videoId }, position: m.posicao },
        }),
      })
      if (r.ok) feitos.movidos.push(m.itemId)
      else feitos.falhas.push({ itemId: m.itemId, erro: `PUT ${r.status}: ${(await r.text()).slice(0, 200)}` })
    }
    return NextResponse.json({ playlist, ...feitos })
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'erro no YouTube' }, { status: 502 })
  }
}
