/**
 * YOUTUBE SEM OPENGRAPH — o YouTube responde ao nosso bot com a página de consentimento, sem
 * og:title nem og:image, e a pré-visualização ficava «youtube.com / youtube.com» (visto na app a
 * 05/10/2026). O oEmbed oficial dá título, autor e thumbnail sem chave; e mesmo que o oEmbed
 * falhe, a thumbnail sai do id do vídeo (img.youtube.com), que nunca muda.
 */
export function youtubeId(url: string): string | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  const host = u.hostname.replace(/^www\.|^m\./, "")
  if (host === "youtu.be") return limpar(u.pathname.slice(1))
  if (host === "youtube.com" || host === "music.youtube.com") {
    if (u.pathname === "/watch") return limpar(u.searchParams.get("v"))
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)
    if (m) return limpar(m[1])
  }
  return null
}

function limpar(id: string | null): string | null {
  return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null
}

export function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`
}

export type OEmbedYoutube = { title?: string; author_name?: string; thumbnail_url?: string }

/** Monta a pré-visualização a partir do oEmbed (ou só do id, se o oEmbed não vier). */
export function previewDoYoutube(url: string, id: string, oembed: OEmbedYoutube | null) {
  return {
    url,
    title: oembed?.title?.trim() || "Vídeo no YouTube",
    description: oembed?.author_name?.trim() || null,
    image: oembed?.thumbnail_url || youtubeThumbnail(id),
    siteName: "YouTube",
  }
}
