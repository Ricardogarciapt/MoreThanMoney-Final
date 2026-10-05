/**
 * Pré-visualização de links nas publicações do feed social.
 *
 * O dono pediu a 05/10/2026 que «as publicações do feed devem trazer a thumbnail do link se
 * o link for partilhado». Até aqui o preview era obtido pelo BROWSER ao escrever o post e só
 * quando não havia média — e por isso 31 em 33 posts com URL estavam sem preview na base.
 *
 * Aqui vive a parte que não depende do Next: extrair o primeiro URL, normalizar o preview
 * para a forma guardada, decidir se um post é publicável, e o enriquecimento com timeout
 * curto (um site lento NUNCA pode atrasar nem rebentar a publicação). O extractor de
 * OpenGraph é o MESMO que o chat já usa (`lib/link-preview-fetch.ts`).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LinkPreviewData } from '@/lib/link-preview-types'
import { getHostname, getPrimaryUrlFromText } from '@/lib/url-utils'

/** O primeiro URL http(s)/www. do texto, já normalizado; null se não houver. */
export function extrairPrimeiroUrl(content: string | null | undefined): string | null {
  if (typeof content !== 'string') return null
  return getPrimaryUrlFromText(content)
}

const MAX_TITULO = 200
const MAX_DESCRICAO = 300

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

/**
 * Reduz o que o extractor devolve à forma guardada em `posts.link_preview`.
 * Só aceita imagem http(s) (um `data:` ou `javascript:` vindo de uma página estranha não
 * entra na base), corta títulos/descrições longos e garante `siteName`.
 * Devolve null se não houver URL — nada de previews «vazios» na base.
 */
export function resumirPreview(raw: unknown): LinkPreviewData | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const url = typeof o.url === 'string' && /^https?:\/\//i.test(o.url) ? o.url.trim() : null
  if (!url) return null
  const image = typeof o.image === 'string' && /^https?:\/\//i.test(o.image.trim()) ? o.image.trim() : null
  return {
    url,
    title: texto(o.title, MAX_TITULO) ?? getHostname(url),
    description: texto(o.description, MAX_DESCRICAO),
    image,
    siteName: texto(o.siteName, 100) ?? getHostname(url),
  }
}

/**
 * Um post é publicável se tiver texto OU média. Antes de 05/10 a rota aceitava `content`
 * vazio sem média e criava publicações em branco no feed.
 */
export function conteudoPublicavel(
  content: unknown,
  media: ReadonlyArray<string | null | undefined> | string | null | undefined
): boolean {
  const temTexto = typeof content === 'string' && content.trim().length > 0
  const lista = Array.isArray(media) ? media : [media]
  const temMedia = lista.some((m) => typeof m === 'string' && m.trim().length > 0)
  return temTexto || temMedia
}

export type EnriquecimentoLink = {
  link_url: string | null
  link_preview: LinkPreviewData | null
}

export type ObterPreview = (url: string) => Promise<LinkPreviewData | null>

/** Timeout curto: a publicação não espera mais do que isto por um site alheio. */
export const TIMEOUT_PREVIEW_MS = 5_000

/**
 * Dado o conteúdo, devolve `{ link_url, link_preview }` prontos a gravar.
 * Nunca lança: se o site falhar ou demorar, fica `link_url` preenchido (para o backfill
 * voltar a tentar) e `link_preview` a null.
 */
export async function enriquecerLinkDoPost(
  content: string | null | undefined,
  obterPreview: ObterPreview,
  timeoutMs = TIMEOUT_PREVIEW_MS
): Promise<EnriquecimentoLink> {
  const url = extrairPrimeiroUrl(content)
  if (!url) return { link_url: null, link_preview: null }
  try {
    const corrida = await Promise.race<LinkPreviewData | null>([
      obterPreview(url),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])
    return { link_url: url, link_preview: resumirPreview(corrida) }
  } catch {
    return { link_url: url, link_preview: null }
  }
}

/**
 * Backfill dos posts antigos: olha para os últimos `janela` posts com URL no texto e sem
 * preview, e trata no máximo `maximo` por corrida (rate limit — não martelar sites alheios
 * nem esgotar o tempo da função). Devolve quantos ficaram com preview.
 */
export async function backfillLinkPreviews(
  supabase: SupabaseClient,
  obterPreview: ObterPreview,
  { janela = 200, maximo = 20 }: { janela?: number; maximo?: number } = {}
): Promise<{ vistos: number; tratados: number; comPreview: number }> {
  const { data, error } = await supabase
    .from('posts')
    .select('id, content, link_url')
    .is('link_preview', null)
    .order('created_at', { ascending: false })
    .limit(janela)
  if (error) throw new Error(`backfill posts: ${error.message}`)

  const candidatos = (data ?? []).filter((p) => extrairPrimeiroUrl(p.content)).slice(0, maximo)
  let comPreview = 0
  for (const p of candidatos) {
    const enr = await enriquecerLinkDoPost(p.content, obterPreview)
    // Sem preview, grava à mesma o link_url: a app nativa fica com o URL e o próximo
    // backfill volta a tentar porque link_preview continua null.
    const { error: upErr } = await supabase.from('posts').update(enr).eq('id', p.id)
    if (upErr) console.warn('[social/link-preview] backfill update', p.id, upErr.message)
    else if (enr.link_preview) comPreview++
  }
  return { vistos: data?.length ?? 0, tratados: candidatos.length, comPreview }
}
