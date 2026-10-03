/**
 * VÍDEOS «APRENDE A USAR …» — um vídeo de introdução por destino do site.
 *
 * O admin cola um link (YouTube ou uma gravação nossa em HLS) para cada destino da navbar e liga o
 * interruptor. A partir daí esse destino mostra um botão «Aprende a usar o Terminal MTM» que abre
 * o mesmo leitor modal usado no curso de introdução.
 *
 * A lista de destinos NÃO vive aqui — vive em lib/navegacao.ts, que é a navbar. Aqui só se guarda
 * o que o admin escreveu sobre cada um.
 *
 * Supabase frágil: a configuração muda raríssimas vezes e é lida por um índice parcial
 * (`ativo`), com cache de 5 minutos no servidor. Nenhuma página faz uma query por render.
 */

import { getSupabaseAdmin } from '@/lib/admin-api-helpers'
import { destinoPorId, textoAprendeAUsar } from '@/lib/navegacao'

export type TipoVideoIntro = 'youtube' | 'playlist' | 'hls'

export type VideoIntro = {
  destino: string
  tipo: TipoVideoIntro
  url: string
  rotulo: string | null
  ativo: boolean
}

/** O que o cliente precisa de saber para desenhar o botão e o leitor. */
export type VideoIntroPublico = {
  destino: string
  tipo: TipoVideoIntro
  url: string
  /** Texto pronto: «Aprende a usar o Terminal MTM». */
  texto: string
}

const RX_YOUTUBE = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i

/**
 * Que tipo de link é este — e se sequer é um link que sabemos tocar.
 *
 * Só aceitamos o que o leitor consegue mesmo abrir: YouTube (vídeo ou playlist) e HLS nosso. Um
 * link de Vimeo ou de Drive colado por engano fica bloqueado aqui, no momento de gravar, em vez de
 * aparecer como um leitor preto na cara do aluno.
 */
export function classificarUrlIntro(url: string): { ok: true; tipo: TipoVideoIntro } | { ok: false; erro: string } {
  const limpo = (url || '').trim()
  if (!limpo) return { ok: false, erro: 'Falta o link.' }

  if (RX_YOUTUBE.test(limpo)) {
    let busca: URLSearchParams
    try {
      busca = new URL(limpo.startsWith('http') ? limpo : `https://${limpo}`).searchParams
    } catch {
      return { ok: false, erro: 'Link do YouTube inválido.' }
    }
    if (busca.get('list')) return { ok: true, tipo: 'playlist' }
    return { ok: true, tipo: 'youtube' }
  }

  if (/\.m3u8(\?|$)/i.test(limpo)) return { ok: true, tipo: 'hls' }

  return {
    ok: false,
    erro: 'Só aceitamos links do YouTube (vídeo ou playlist) ou uma gravação nossa em HLS (.m3u8).',
  }
}

/** O `list=` de um URL de playlist do YouTube (ou o id cru). Null se não for uma playlist. */
export function extrairIdPlaylist(url: string | null | undefined): string | null {
  if (!url) return null
  const m = String(url).match(/[?&]list=([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  if (/^[a-zA-Z0-9_-]{12,}$/.test(String(url).trim())) return String(url).trim()
  return null
}

/** Texto do botão para um destino, com o rótulo que o admin tenha escrito. */
export function textoBotao(destinoId: string, rotulo?: string | null): string {
  const destino = destinoPorId(destinoId)
  if (!destino) return `Aprende a usar ${(rotulo || '').trim() || 'isto'}`
  return textoAprendeAUsar(destino, rotulo)
}

type Cache = { em: number; valor: VideoIntroPublico[] }
let cache: Cache | null = null
const TTL_MS = 5 * 60 * 1000

/** Os vídeos LIGADOS, prontos a servir ao site. Uma query indexada por cada 5 minutos. */
export async function lerVideosIntroAtivos(forcar = false): Promise<VideoIntroPublico[]> {
  if (!forcar && cache && Date.now() - cache.em < TTL_MS) return cache.valor

  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('mtm_videos_intro')
      .select('destino, tipo, url, rotulo')
      .eq('ativo', true)

    const valor: VideoIntroPublico[] = (data || [])
      // Um destino que já não existe na navbar não deve continuar a mostrar botão.
      .filter((l: Record<string, unknown>) => destinoPorId(String(l.destino)))
      .map((l: Record<string, unknown>) => ({
        destino: String(l.destino),
        tipo: l.tipo as TipoVideoIntro,
        url: String(l.url),
        texto: textoBotao(String(l.destino), (l.rotulo as string) ?? null),
      }))

    cache = { em: Date.now(), valor }
    return valor
  } catch {
    return cache?.valor ?? []
  }
}

/** Todas as linhas (ligadas ou não) — só o admin as vê. */
export async function lerVideosIntroTodos(): Promise<VideoIntro[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('mtm_videos_intro')
    .select('destino, tipo, url, rotulo, ativo')
  if (error) throw new Error(error.message)
  return (data || []).map((l: Record<string, unknown>) => ({
    destino: String(l.destino),
    tipo: l.tipo as TipoVideoIntro,
    url: String(l.url),
    rotulo: (l.rotulo as string) ?? null,
    ativo: Boolean(l.ativo),
  }))
}

export function limparCacheVideosIntro(): void {
  cache = null
}
