/**
 * Instagram Content Publishing — publicação nativa via Graph API v21.0.
 *
 * Substitui ferramentas de terceiros (Postiz) para agendar/publicar nas contas
 * da marca (@morethanmoney.pt) e pessoal (@ricardogarciapt). Ambos os tokens
 * System User têm o scope `instagram_content_publish`.
 *
 * Fluxo por tipo:
 *  - IMAGE:    POST /media (image_url) → media_publish
 *  - CAROUSEL: POST /media (is_carousel_item) por filho → POST /media (CAROUSEL, children) → publish
 *  - STORIES:  POST /media (media_type=STORIES, image_url|video_url) → publish
 *  - REELS:    POST /media (media_type=REELS, video_url) → poll status_code → publish
 *
 * A API exige media hospedada em URL público → usar rehostMedia() para
 * re-hospedar exports do Canva no bucket público `uploads` do Supabase.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const GRAPH = "https://graph.facebook.com/v21.0"

export const IG_ACCOUNTS = [
  { id: "17841474872672009", username: "morethanmoney.pt", tokenEnv: "INSTAGRAM_TOKEN" },
  { id: "17841405656956716", username: "ricardogarciapt", tokenEnv: "INSTAGRAM_TOKEN_RICARDO" },
] as const

export type IgMediaType = "IMAGE" | "CAROUSEL" | "STORIES" | "REELS"

export interface ScheduledPost {
  id: string
  ig_account_id: string
  ig_username?: string | null
  media_type: IgMediaType
  media_urls: string[]
  caption?: string | null
  creation_id?: string | null
  child_creation_ids?: string[] | null
}

export interface PublishResult {
  mediaId: string
  permalink: string | null
  creationId: string
}

/** Erro que sinaliza ao cron "ainda a processar, tenta outra vez" (ex.: Reels em encoding). */
export class MediaNotReadyError extends Error {
  creationId: string
  childIds?: string[]
  constructor(creationId: string, childIds?: string[]) {
    super("MEDIA_NOT_READY")
    this.name = "MediaNotReadyError"
    this.creationId = creationId
    this.childIds = childIds
  }
}

export function tokenForAccount(igAccountId: string): string | undefined {
  const acc = IG_ACCOUNTS.find((a) => a.id === igAccountId)
  const scoped = acc ? process.env[acc.tokenEnv]?.trim() : undefined
  return scoped || process.env.INSTAGRAM_TOKEN?.trim()
}

export function usernameForAccount(igAccountId: string): string | undefined {
  return IG_ACCOUNTS.find((a) => a.id === igAccountId)?.username
}

// ── Graph helpers ──────────────────────────────────────────────────────────

async function graphPost(
  igId: string,
  edge: string,
  params: Record<string, string>,
  token: string,
): Promise<any> {
  const body = new URLSearchParams({ ...params, access_token: token })
  const r = await fetch(`${GRAPH}/${igId}/${edge}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.error) {
    const msg = j?.error?.message || `HTTP ${r.status}`
    throw new Error(`[IG ${edge}] ${msg}`)
  }
  return j
}

async function graphGet(id: string, fields: string, token: string): Promise<any> {
  const r = await fetch(`${GRAPH}/${id}?fields=${encodeURIComponent(fields)}&access_token=${token}`)
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.error) {
    const msg = j?.error?.message || `HTTP ${r.status}`
    throw new Error(`[IG get ${id}] ${msg}`)
  }
  return j
}

// ── Media re-hosting (Canva export → bucket público) ─────────────────────────

/**
 * Re-hospeda uma imagem/vídeo de um URL (possivelmente temporário/assinado, ex.: Canva)
 * no bucket público `uploads` do Supabase, e devolve o URL público estável.
 */
export async function rehostMedia(
  sourceUrl: string,
  opts: { prefix?: string } = {},
): Promise<string> {
  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`rehostMedia: fetch falhou (${res.status})`)
  const contentType = res.headers.get("content-type") || "image/jpeg"
  const buf = Buffer.from(await res.arrayBuffer())
  return uploadBufferToBucket(buf, contentType, opts.prefix)
}

/** Faz upload de um Buffer no bucket público `uploads` e devolve o URL público estável. */
export async function uploadBufferToBucket(
  buf: Buffer,
  contentType = "image/png",
  prefix = "social",
): Promise<string> {
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("mp4") || contentType.includes("video")
      ? "mp4"
      : contentType.includes("webp")
        ? "webp"
        : "jpg"
  const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`
  const admin = getSupabaseAdmin()
  const { error } = await admin.storage.from("uploads").upload(key, buf, { contentType, upsert: true })
  if (error) throw new Error(`uploadBufferToBucket: upload falhou — ${error.message}`)
  const { data } = admin.storage.from("uploads").getPublicUrl(key)
  return data.publicUrl
}

// ── Container builders ───────────────────────────────────────────────────────

async function createImageContainer(igId: string, url: string, caption: string, token: string) {
  const j = await graphPost(igId, "media", { image_url: url, caption }, token)
  return j.id as string
}

async function createStoriesContainer(igId: string, url: string, isVideo: boolean, token: string) {
  const params: Record<string, string> = { media_type: "STORIES" }
  if (isVideo) params.video_url = url
  else params.image_url = url
  const j = await graphPost(igId, "media", params, token)
  return j.id as string
}

async function createReelsContainer(igId: string, url: string, caption: string, token: string) {
  const j = await graphPost(igId, "media", { media_type: "REELS", video_url: url, caption }, token)
  return j.id as string
}

async function createCarouselContainer(
  igId: string,
  urls: string[],
  caption: string,
  token: string,
): Promise<{ parentId: string; childIds: string[] }> {
  const childIds: string[] = []
  for (const url of urls.slice(0, 10)) {
    const isVideo = /\.(mp4|mov)(\?|$)/i.test(url)
    const params: Record<string, string> = { is_carousel_item: "true" }
    if (isVideo) {
      params.media_type = "VIDEO"
      params.video_url = url
    } else {
      params.image_url = url
    }
    const j = await graphPost(igId, "media", params, token)
    childIds.push(j.id as string)
  }
  const parent = await graphPost(
    igId,
    "media",
    { media_type: "CAROUSEL", children: childIds.join(","), caption },
    token,
  )
  return { parentId: parent.id as string, childIds }
}

/** Devolve true quando o container está pronto a publicar (FINISHED). Lança em ERROR. */
async function isContainerReady(creationId: string, token: string): Promise<boolean> {
  const j = await graphGet(creationId, "status_code", token)
  const status = j.status_code as string
  if (status === "FINISHED") return true
  if (status === "ERROR" || status === "EXPIRED") throw new Error(`Container ${status}`)
  return false
}

async function publishContainer(igId: string, creationId: string, token: string): Promise<string> {
  const j = await graphPost(igId, "media_publish", { creation_id: creationId }, token)
  return j.id as string
}

async function fetchPermalink(mediaId: string, token: string): Promise<string | null> {
  try {
    const j = await graphGet(mediaId, "permalink", token)
    return (j.permalink as string) || null
  } catch {
    return null
  }
}

// ── Orquestração ─────────────────────────────────────────────────────────────

/**
 * Publica um post agendado. Cria o(s) container(es) e publica.
 *
 * Para media que precisa de encoding (REELS / vídeo em carrossel) faz poll curto;
 * se ainda não estiver pronto lança MediaNotReadyError com o creation_id para o
 * cron guardar e retomar na próxima ronda (sem recriar containers).
 */
/**
 * Sentinela de nota INTERNA na legenda. Tudo a partir daqui (brief visual, notas do rascunho
 * gerado pela máquina) é cortado antes de publicar — viaja com o rascunho para o Ricardo rever,
 * mas NUNCA vai para o Instagram.
 */
export const CAPTION_INTERNAL_MARK = "—INTERNO—"
export function publicCaption(raw: string): string {
  const i = raw.indexOf(CAPTION_INTERNAL_MARK)
  return (i >= 0 ? raw.slice(0, i) : raw).trim()
}

export async function publishScheduledPost(post: ScheduledPost): Promise<PublishResult> {
  const igId = post.ig_account_id
  const token = tokenForAccount(igId)
  if (!token) throw new Error(`Sem token IG para a conta ${igId} (verifica env vars na Vercel)`)

  const urls = (post.media_urls || []).filter(Boolean)
  if (urls.length === 0) throw new Error("Post sem media_urls")
  const caption = publicCaption(post.caption || "")

  // Retoma: se já existe um container criado (ex.: Reels a processar), só publica.
  if (post.creation_id) {
    const ready = await waitReady(post.creation_id, token)
    if (!ready) throw new MediaNotReadyError(post.creation_id, post.child_creation_ids || undefined)
    const mediaId = await publishContainer(igId, post.creation_id, token)
    return { mediaId, permalink: await fetchPermalink(mediaId, token), creationId: post.creation_id }
  }

  let creationId: string
  let needsWait = false

  switch (post.media_type) {
    case "CAROUSEL": {
      const { parentId } = await createCarouselContainer(igId, urls, caption, token)
      creationId = parentId
      needsWait = urls.some((u) => /\.(mp4|mov)(\?|$)/i.test(u))
      break
    }
    case "STORIES": {
      const isVideo = /\.(mp4|mov)(\?|$)/i.test(urls[0])
      creationId = await createStoriesContainer(igId, urls[0], isVideo, token)
      needsWait = isVideo
      break
    }
    case "REELS": {
      creationId = await createReelsContainer(igId, urls[0], caption, token)
      needsWait = true
      break
    }
    case "IMAGE":
    default: {
      creationId = await createImageContainer(igId, urls[0], caption, token)
      break
    }
  }

  if (needsWait) {
    const ready = await waitReady(creationId, token)
    if (!ready) throw new MediaNotReadyError(creationId)
  }

  const mediaId = await publishContainer(igId, creationId, token)
  return { mediaId, permalink: await fetchPermalink(mediaId, token), creationId }
}

/** Poll curto (dentro do budget do cron): ~5 tentativas × 4s. */
async function waitReady(creationId: string, token: string): Promise<boolean> {
  for (let i = 0; i < 5; i++) {
    if (await isContainerReady(creationId, token)) return true
    await new Promise((r) => setTimeout(r, 4000))
  }
  return false
}
