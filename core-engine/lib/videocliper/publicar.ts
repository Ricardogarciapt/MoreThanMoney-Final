import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * PUBLICAR UM CLIPE — Shorts e Reels a partir do mesmo ficheiro.
 *
 * O mesmo MP4 vertical serve os dois: 9:16, menos de 60 segundos. O que muda é o caminho.
 *
 * ── Instagram ────────────────────────────────────────────────────────────────
 * Entra na fila de sempre (`social_scheduled_posts`, `media_type: REELS`), já aprovado e marcado
 * para agora. Publicar por fora da fila perdia a repetição em caso de falha, a contagem de
 * tentativas e o registo — e o Reels falha mais do que a imagem, porque o Instagram tem de
 * transcodificar o vídeo antes de o aceitar.
 *
 * ── YouTube ──────────────────────────────────────────────────────────────────
 * Vai directo, daqui, e não pela fila. A fila do `/social` é do Instagram e ensiná-la a falar
 * YouTube duplicava a máquina toda; o upload são três chamadas REST com o refresh token, que é
 * o que o worker do DVR já faz há meses.
 *
 * Um Short reconhece-se por ser vertical e curto — não há campo para o declarar. O que o marca
 * é o `#Shorts` no título, e é por isso que ele lá está.
 */

const YT_OAUTH = 'https://oauth2.googleapis.com/token'
const YT_API = 'https://www.googleapis.com/youtube/v3'
const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3'

/** A playlist onde os cortes se juntam — para quem chega por um encontrar os outros. */
const PLAYLIST_SHORTS = 'MTM · Cortes'

export interface ResultadoPublicacao {
  ok: boolean
  erro?: string
  instagram?: { postId?: string; erro?: string }
  youtube?: { videoId?: string; url?: string; erro?: string }
}

async function tokenDoYoutube(): Promise<string> {
  const cid = process.env.YOUTUBE_CLIENT_ID?.trim()
  const secret = process.env.YOUTUBE_CLIENT_SECRET?.trim()
  const refresh = process.env.YOUTUBE_REFRESH_TOKEN?.trim()
  if (!cid || !secret || !refresh) throw new Error('credenciais YOUTUBE_* em falta')

  const r = await fetch(YT_OAUTH, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cid, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token',
    }),
  })
  const j = (await r.json().catch(() => ({}))) as { access_token?: string }
  if (!j.access_token) throw new Error('não foi possível renovar o token do YouTube')
  return j.access_token
}

/** A playlist dos cortes, procurada pelo título para não se criarem dez iguais. */
async function garantirPlaylist(token: string): Promise<string | null> {
  try {
    let pagina = ''
    do {
      const r = await fetch(
        `${YT_API}/playlists?part=snippet&mine=true&maxResults=50${pagina ? `&pageToken=${pagina}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!r.ok) return null
      const j = (await r.json()) as { items?: Array<{ id: string; snippet?: { title?: string } }>; nextPageToken?: string }
      const achada = (j.items ?? []).find((p) => p.snippet?.title === PLAYLIST_SHORTS)
      if (achada) return achada.id
      pagina = j.nextPageToken ?? ''
    } while (pagina)

    const r = await fetch(`${YT_API}/playlists?part=snippet,status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        snippet: {
          title: PLAYLIST_SHORTS,
          description: 'Momentos das sessões ao vivo da More Than Money.',
        },
        status: { privacyStatus: 'public' },
      }),
    })
    if (!r.ok) return null
    return ((await r.json()) as { id?: string }).id ?? null
  } catch {
    // Sem playlist o Short publica-se na mesma. Falhar a arrumação não pode travar a publicação.
    return null
  }
}

/**
 * Sobe o MP4 ao YouTube em dois passos: abre uma sessão, despeja os bytes.
 *
 * O upload `resumable` é o que a API quer para vídeo. Não se retoma nada aqui — o clipe tem
 * segundos e alguns megabytes, e um falhanço repete-se inteiro mais depressa do que se
 * negociaria a retoma.
 */
async function subirShort(
  token: string,
  video: Buffer,
  titulo: string,
  descricao: string,
): Promise<{ videoId: string }> {
  const metadados = {
    snippet: {
      // O `#Shorts` no título é o que faz o YouTube tratá-lo como Short. Não há campo para isso.
      title: `${titulo.slice(0, 90)} #Shorts`,
      description: descricao.slice(0, 4900),
      categoryId: '22',
    },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
  }

  const abrir = await fetch(`${YT_UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(video.length),
    },
    body: JSON.stringify(metadados),
  })
  if (!abrir.ok) throw new Error(`YouTube ${abrir.status}: ${(await abrir.text()).slice(0, 200)}`)

  const destino = abrir.headers.get('location')
  if (!destino) throw new Error('o YouTube não devolveu destino de upload')

  const enviar = await fetch(destino, {
    method: 'PUT',
    headers: { 'content-type': 'video/mp4', 'content-length': String(video.length) },
    body: new Uint8Array(video),
  })
  if (!enviar.ok) throw new Error(`upload ${enviar.status}: ${(await enviar.text()).slice(0, 200)}`)

  const j = (await enviar.json()) as { id?: string }
  if (!j.id) throw new Error('o upload não devolveu id de vídeo')
  return { videoId: j.id }
}

export async function publicarClipe(
  clipId: string,
  destinos: Array<'instagram' | 'youtube'> = ['instagram', 'youtube'],
): Promise<ResultadoPublicacao> {
  const db = getSupabaseAdmin()

  const { data: clip } = await db
    .from('videocliper_clips')
    .select('id, titulo, caption, cta_palavra, video_url, estado, job_id, ig_post_id, youtube_short_id')
    .eq('id', clipId)
    .maybeSingle()
  if (!clip) return { ok: false, erro: 'clipe não encontrado' }
  if (!clip.video_url) return { ok: false, erro: 'o clipe ainda não foi cortado' }

  const caption = String(clip.caption ?? '').trim() || String(clip.titulo ?? '')
  const saida: ResultadoPublicacao = { ok: false }

  // ── Instagram ─────────────────────────────────────────────────────────────
  if (destinos.includes('instagram')) {
    if (clip.ig_post_id) {
      saida.instagram = { postId: clip.ig_post_id as string, erro: 'já tinha sido enviado' }
    } else {
      const { data, error } = await db.from('social_scheduled_posts').insert({
        channel: 'instagram',
        ig_account_id: '17841474872672009',
        ig_username: 'morethanmoney.pt',
        pillar: 'educacao',
        media_type: 'REELS',
        media_urls: [clip.video_url],
        caption,
        scheduled_at: new Date().toISOString(),
        status: 'approved',
        approved_by: 'videocliper',
        approved_at: new Date().toISOString(),
        created_by: 'videocliper',
      }).select('id').single()

      if (error) saida.instagram = { erro: error.message }
      else {
        saida.instagram = { postId: data.id }
        await db.from('videocliper_clips').update({ ig_post_id: data.id }).eq('id', clipId)
      }
    }
  }

  // ── YouTube Shorts ────────────────────────────────────────────────────────
  if (destinos.includes('youtube')) {
    if (clip.youtube_short_id) {
      saida.youtube = { videoId: clip.youtube_short_id as string, erro: 'já tinha sido publicado' }
    } else {
      try {
        const token = await tokenDoYoutube()
        const resposta = await fetch(clip.video_url as string)
        if (!resposta.ok) throw new Error(`o clipe não se deixou ler (HTTP ${resposta.status})`)
        const video = Buffer.from(new Uint8Array(await resposta.arrayBuffer() as ArrayBuffer))
        const { videoId } = await subirShort(token, video, String(clip.titulo ?? 'Corte MTM'), caption)

        const playlist = await garantirPlaylist(token)
        if (playlist) {
          await fetch(`${YT_API}/playlistItems?part=snippet`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({
              snippet: { playlistId: playlist, resourceId: { kind: 'youtube#video', videoId } },
            }),
          }).catch(() => undefined)
        }

        const url = `https://www.youtube.com/shorts/${videoId}`
        saida.youtube = { videoId, url }
        await db.from('videocliper_clips')
          .update({ youtube_short_id: videoId, youtube_short_url: url }).eq('id', clipId)
      } catch (e) {
        saida.youtube = { erro: e instanceof Error ? e.message : 'erro no YouTube' }
      }
    }
  }

  /**
   * Um destino que correu bem chega para o clipe contar como publicado.
   *
   * Marcá-lo como erro porque o YouTube falhou esconderia o Reels que saiu — e alguém voltaria a
   * carregar em publicar, duplicando-o no Instagram.
   */
  const algumFoi = Boolean(saida.instagram?.postId || saida.youtube?.videoId)
  await db.from('videocliper_clips').update({
    estado: algumFoi ? 'publicado' : 'erro',
    erro: algumFoi ? null : (saida.instagram?.erro ?? saida.youtube?.erro ?? 'nada publicou'),
    publicado_em: algumFoi ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', clipId)

  saida.ok = algumFoi
  return saida
}
