import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { tokenDoYoutube } from '@/lib/videocliper/publicar'
import { EDUCADORES } from './config'

/**
 * AS AULAS DE ONDE SAEM OS CORTES — as playlists que o site já mostra.
 *
 * Duas fontes, as mesmas do site: as playlists das salas (`lms_streams.playlist_url`) e os cursos
 * de cada educador (`lms_educator_playlists`). Só entram educadores que os reels conhecem
 * (`config.ts`): são eles que têm palavra de comentário e regra de publicação. Uma playlist de um
 * perfil genérico («MTM», «Mindset») fica de fora até ter dono.
 *
 * A lista vem da API do YouTube com o token que já publica os Shorts (lê playlists públicas e não
 * listadas). Vídeos privados ou apagados não entram; nem aulas com menos de 5 minutos.
 */

export interface Aula {
  videoId: string
  url: string
  titulo: string
  educador: string
  playlist: string
  duracaoSeg: number
}

const API = 'https://www.googleapis.com/youtube/v3'
const MIN_SEG = 5 * 60
const MAX_SEG = 3 * 3600

function idDaPlaylist(url: string): string | null {
  const m = String(url ?? '').match(/[?&]list=([A-Za-z0-9_-]{12,})/)
  return m?.[1] ?? null
}

function segundos(iso: string): number {
  const m = String(iso ?? '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0)
}

/** As playlists do site, cada uma com o educador dos reels a quem pertence. */
export async function playlistsDasAulas(): Promise<Array<{ id: string; titulo: string; educador: string }>> {
  const db = getSupabaseAdmin()
  const [{ data: eds }, { data: salas }, { data: cursos }] = await Promise.all([
    db.from('lms_educators').select('id, display_name'),
    db.from('lms_streams').select('educator_id, playlist_url, playlist_title, title'),
    db.from('lms_educator_playlists').select('educator_id, url, title').eq('is_active', true),
  ])
  const slugDe = new Map((eds ?? []).map((e) => [e.id as string, EDUCADORES.find((x) => x.nome === e.display_name)?.slug]))
  const saida = new Map<string, { id: string; titulo: string; educador: string }>()
  const juntar = (educatorId: unknown, url: unknown, titulo: unknown) => {
    const slug = slugDe.get(String(educatorId ?? ''))
    const id = idDaPlaylist(String(url ?? ''))
    if (slug && id && !saida.has(id)) saida.set(id, { id, titulo: String(titulo ?? 'Aulas'), educador: slug })
  }
  for (const s of salas ?? []) juntar(s.educator_id, s.playlist_url, s.playlist_title ?? s.title)
  for (const c of cursos ?? []) juntar(c.educator_id, c.url, c.title)
  return [...saida.values()]
}

/**
 * A LISTA QUE O MAC TROUXE.
 *
 * Sem as credenciais do YouTube na Vercel, quem lê as playlists é o cortador do Mac (yt-dlp, do
 * IP de casa) e deixa a lista em `site_settings.reels_aulas`. Serve até 3 dias: depois disso é
 * melhor não cortar do que cortar de uma lista que pode já não existir.
 */
export const CHAVE_AULAS = 'reels_aulas'

async function aulasDoMac(): Promise<Aula[]> {
  const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', CHAVE_AULAS).maybeSingle()
  const v = (data?.value ?? null) as { em?: string; aulas?: Aula[] } | null
  if (!v?.aulas?.length || !v.em || Date.now() - new Date(v.em).getTime() > 3 * 86400_000) return []
  return v.aulas.filter((a) => a.duracaoSeg >= MIN_SEG && a.duracaoSeg <= MAX_SEG)
}

/** Todas as aulas das playlists, com duração. Uma playlist que falhe não estraga as outras. */
export async function listarAulas(): Promise<Aula[]> {
  const playlists = await playlistsDasAulas()
  if (!playlists.length) return []
  let token: string
  try {
    token = await tokenDoYoutube()
  } catch {
    return aulasDoMac()
  }
  const auth = { headers: { Authorization: `Bearer ${token}` } }

  const vistas = new Map<string, Aula>()
  for (const pl of playlists) {
    let pagina = ''
    for (let n = 0; n < 4; n++) {
      const r = await fetch(`${API}/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${pl.id}${pagina ? `&pageToken=${pagina}` : ''}`, auth)
      if (!r.ok) break
      const j = (await r.json()) as {
        items?: Array<{ snippet?: { title?: string }; contentDetails?: { videoId?: string } }>
        nextPageToken?: string
      }
      for (const it of j.items ?? []) {
        const id = it.contentDetails?.videoId
        const titulo = String(it.snippet?.title ?? '')
        if (!id || vistas.has(id) || /^(private|deleted) video$/i.test(titulo)) continue
        vistas.set(id, { videoId: id, url: `https://www.youtube.com/watch?v=${id}`, titulo, educador: pl.educador, playlist: pl.titulo, duracaoSeg: 0 })
      }
      pagina = j.nextPageToken ?? ''
      if (!pagina) break
    }
  }

  const ids = [...vistas.keys()]
  for (let i = 0; i < ids.length; i += 50) {
    const r = await fetch(`${API}/videos?part=contentDetails&id=${ids.slice(i, i + 50).join(',')}`, auth)
    if (!r.ok) continue
    const j = (await r.json()) as { items?: Array<{ id: string; contentDetails?: { duration?: string } }> }
    for (const v of j.items ?? []) {
      const a = vistas.get(v.id)
      if (a) a.duracaoSeg = segundos(v.contentDetails?.duration ?? '')
    }
  }
  return [...vistas.values()].filter((a) => a.duracaoSeg >= MIN_SEG && a.duracaoSeg <= MAX_SEG)
}
