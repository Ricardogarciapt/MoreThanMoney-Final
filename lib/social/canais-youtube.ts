/**
 * FEED SOCIAL · CANAIS DE YOUTUBE CURADOS (pedido do Ricardo, 24/11/2026).
 *
 * Sempre que sai um vídeo novo nestes canais, o feed da app-mobile (tabela `posts`, autor = um
 * admin) recebe uma publicação com o link. Corre dentro do cron `social-link-preview` (o
 * vercel.json está no tecto de crons, por isso não se cria um novo).
 *
 * Regras:
 *  - Só o vídeo mais recente de cada canal, e só se ainda não houver publicação com esse vídeo.
 *    Assim a primeira corrida publica o último vídeo de cada canal, e as seguintes só os novos.
 *  - `auto: false` = o tema tem de ser visto pelo Ricardo ou pela AIDA antes de publicar. O canal
 *    fica registado mas não publica. Ver a nota de cada canal.
 *  - Lê o feed RSS oficial do YouTube (`/feeds/videos.xml?channel_id=`), sem chave de API.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { enriquecerLinkDoPost } from '@/lib/social/link-preview'
import { fetchLinkPreview } from '@/lib/link-preview-fetch'

export type CanalYoutube = {
  nome: string
  tema: string
  channelId: string
  /** false = não publica sozinho; o tema precisa de revisão humana antes. */
  auto: boolean
  nota?: string
}

export const CANAIS_YOUTUBE: CanalYoutube[] = [
  {
    nome: 'Luis Pinto',
    tema: 'IA e Finanças',
    channelId: 'UCs5Len9qSmd9DI4vwuEw-Aw',
    auto: false,
    nota: 'Último vídeo («Problemas de Portugal...») a confirmar o tema antes de publicar.',
  },
  {
    nome: 'Admirável Cripto Mundo Novo',
    tema: 'Criptomoedas (Eduardo Espada)',
    channelId: 'UC4Ky4GBj0l5BOYxcygWXn5A',
    auto: true,
    nota: 'Assumido como canal do Eduardo Espada; confirmar.',
  },
  {
    nome: 'António Vilaça Pacheco',
    tema: 'Conforme o tema do vídeo',
    channelId: 'UCdRb0QzQzFJT63RKwvFgI0A',
    auto: false,
    nota: 'Publicar conforme o tema; o último vídeo é uma live (#67) a rever.',
  },
  {
    nome: 'Jorge Coutinho',
    tema: 'Mindset e liderança',
    channelId: 'UCu25tu2vDf93_Y8RsCOJvXQ',
    auto: true,
  },
  {
    nome: 'Motiversity',
    tema: 'Mindset',
    channelId: 'UC5PwYtgNAZuLQJqlQxj5D3g',
    auto: true,
  },
]

export type VideoYoutube = { videoId: string; titulo: string; publicado: string }

function decodificar(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

/** Lê as entradas (vídeos) do feed Atom do YouTube. Puro. */
export function lerFeedYoutube(xml: string): VideoYoutube[] {
  const entradas: VideoYoutube[] = []
  for (const bloco of xml.split('<entry>').slice(1)) {
    const id = bloco.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim()
    const titulo = bloco.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
    const publicado = bloco.match(/<published>([^<]+)<\/published>/)?.[1]?.trim() ?? ''
    if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) continue
    entradas.push({ videoId: id, titulo: decodificar(titulo), publicado })
  }
  return entradas
}

/** O vídeo mais recente (pela data de publicação). Puro. */
export function videoMaisRecente(videos: VideoYoutube[]): VideoYoutube | null {
  if (!videos.length) return null
  return [...videos].sort((a, b) => Date.parse(b.publicado) - Date.parse(a.publicado))[0] ?? null
}

export function urlDoVideo(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

/** Texto da publicação: título, link e a atribuição do canal. Puro. */
export function textoDaPublicacao(canal: CanalYoutube, video: VideoYoutube): string {
  return [
    `📺 Novo vídeo de ${canal.nome} · ${canal.tema}`,
    '',
    video.titulo,
    '',
    urlDoVideo(video.videoId),
  ].join('\n')
}

export type ResultadoCanal = {
  canal: string
  estado: 'publicado' | 'ja_publicado' | 'aguarda_tema' | 'sem_video' | 'erro'
  videoId?: string
  erro?: string
}

const TIMEOUT_RSS_MS = 10_000

export async function lerCanal(channelId: string): Promise<VideoYoutube[]> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
    signal: AbortSignal.timeout(TIMEOUT_RSS_MS),
  })
  if (!res.ok) throw new Error(`RSS ${res.status}`)
  return lerFeedYoutube(await res.text())
}

/**
 * Corre o ciclo: para cada canal, o vídeo mais recente vai ao feed se ainda não lá estiver.
 * Erros de um canal não param os outros.
 */
export async function correrCanaisYoutube(db: SupabaseClient): Promise<ResultadoCanal[]> {
  const { data: admins } = await db
    .from('profiles')
    .select('id')
    .eq('user_type', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
  const autor = admins?.[0]?.id as string | undefined
  const resultados: ResultadoCanal[] = []

  for (const canal of CANAIS_YOUTUBE) {
    try {
      const video = videoMaisRecente(await lerCanal(canal.channelId))
      if (!video) {
        resultados.push({ canal: canal.nome, estado: 'sem_video' })
        continue
      }
      if (!canal.auto) {
        resultados.push({ canal: canal.nome, estado: 'aguarda_tema', videoId: video.videoId })
        continue
      }
      const { data: existe } = await db
        .from('posts')
        .select('id')
        .ilike('link_url', `%${video.videoId}%`)
        .limit(1)
      if (existe && existe.length) {
        resultados.push({ canal: canal.nome, estado: 'ja_publicado', videoId: video.videoId })
        continue
      }
      if (!autor) throw new Error('sem admin para autor da publicação')
      const content = textoDaPublicacao(canal, video)
      const { link_url, link_preview } = await enriquecerLinkDoPost(content, fetchLinkPreview)
      const { error } = await db.from('posts').insert({
        user_id: autor,
        content,
        link_url,
        link_preview,
        likes_count: 0,
        comments_count: 0,
      })
      if (error) throw new Error(error.message)
      resultados.push({ canal: canal.nome, estado: 'publicado', videoId: video.videoId })
    } catch (e) {
      resultados.push({ canal: canal.nome, estado: 'erro', erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return resultados
}
