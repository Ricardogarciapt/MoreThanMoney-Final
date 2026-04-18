import { buildHlsManifestUrl } from "@/lib/lms-stream-ingest"
import { normalizeIngestProvider, normalizePlaybackMode } from "@/lib/lms-stream-options"

type EducatorPlayback = {
  restream_enabled?: boolean | null
  restream_embed_url?: string | null
}

const YT_EMBED = "https://www.youtube.com/embed/"

/**
 * Ligações `watch`, `live` ou `youtu.be` não funcionam de forma fiável em `<iframe>`;
 * converte para `/embed/VIDEO_ID` quando reconhecível.
 */
export function normalizeEmbedPlaybackUrl(raw: string): string {
  const url = raw.trim()
  if (!url) return url
  // Aceitar diretamente o ID de um vídeo (YouTube Live "video id").
  if (/^[\w-]{11}$/.test(url)) return `${YT_EMBED}${url}`

  let href = url
  if (url.startsWith("//")) href = `https:${url}`
  else if (!/^https?:\/\//i.test(href) && (/youtube/i.test(href) || /youtu\.be/i.test(href))) {
    href = `https://${href.replace(/^\/+/, "")}`
  } else if (!/^https?:\/\//i.test(href)) {
    return url
  }

  try {
    const parsed = new URL(href)
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase()

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0]?.split("?")[0]
      if (id && /^[\w-]{11}$/.test(id)) return `${YT_EMBED}${id}`
      return url
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname.startsWith("/embed/")) return url

      const v = parsed.searchParams.get("v")
      if (v && /^[\w-]{11}$/.test(v)) return `${YT_EMBED}${v}`

      const liveMatch = parsed.pathname.match(/^\/live\/([\w-]+)/)
      if (liveMatch?.[1]) return `${YT_EMBED}${liveMatch[1]}`

      const shortsMatch = parsed.pathname.match(/^\/shorts\/([\w-]{11})/)
      if (shortsMatch?.[1]) return `${YT_EMBED}${shortsMatch[1]}`
    }

    return url
  } catch {
    return url
  }
}

/**
 * Prioridade para o aluno:
 * - `playback_url` manual (YouTube, etc.)
 * - YouTube a partir de `youtube_enabled` + `youtube_key` (entrada pode ser link/ID; converte para embed)
 * - HLS próprio (MTM) via `stream_key` (apenas fallback, se existir)
 *
 * Ingest Restream: em live, o aluno deve ver o HLS (ex. live.restream.io, chave `re_*`),
 * não o YouTube — o OBS vai para o Restream, não para o embed YouTube.
 */
export function resolveViewerPlayback(stream: {
  playback_url?: string | null
  stream_key?: string | null
  is_live?: boolean | null
  playback_mode?: string | null
  ingest_provider?: string | null
  educator?: EducatorPlayback | null
  youtube_enabled?: boolean | null
  youtube_key?: string | null
}): { playback_url: string | null; hls_manifest_url: string | null } {
  const isLive = Boolean(stream.is_live)
  const playbackMode = normalizePlaybackMode(stream.playback_mode)
  const ingest = normalizeIngestProvider(stream.ingest_provider)

  const ytEnabled = Boolean(stream.youtube_enabled)
  const youtubeKeyRaw = (stream.youtube_key || "").trim()
  const youtubeEmbed =
    ytEnabled && youtubeKeyRaw ? normalizeEmbedPlaybackUrl(youtubeKeyRaw) : ""
  const manual = normalizeEmbedPlaybackUrl((stream.playback_url || "").trim())
  const hls = buildHlsManifestUrl(stream.stream_key)

  if (isLive) {
    // Restream + HLS disponível → sempre HLS para o aluno (evita iframe YouTube vazio com youtube_first).
    if (ingest === "restream" && hls) {
      return { playback_url: null, hls_manifest_url: hls }
    }

    if (playbackMode === "hls_first") {
      if (hls) return { playback_url: null, hls_manifest_url: hls }
      if (youtubeEmbed.startsWith(YT_EMBED)) return { playback_url: youtubeEmbed, hls_manifest_url: null }
      if (manual) return { playback_url: manual, hls_manifest_url: null }
      return { playback_url: null, hls_manifest_url: null }
    }

    if (playbackMode === "auto") {
      if (hls) return { playback_url: null, hls_manifest_url: hls }
      if (youtubeEmbed.startsWith(YT_EMBED)) return { playback_url: youtubeEmbed, hls_manifest_url: null }
      if (manual) return { playback_url: manual, hls_manifest_url: null }
      return { playback_url: null, hls_manifest_url: null }
    }

    // Default seguro: youtube_first
    if (youtubeEmbed.startsWith(YT_EMBED)) return { playback_url: youtubeEmbed, hls_manifest_url: null }
    if (manual) return { playback_url: manual, hls_manifest_url: null }
    if (hls) return { playback_url: null, hls_manifest_url: hls }
    return { playback_url: null, hls_manifest_url: null }
  }

  // Offline / agendado: playback manual -> YouTube -> HLS (se disponível)
  if (manual) return { playback_url: manual, hls_manifest_url: null }

  if (youtubeEmbed.startsWith(YT_EMBED)) {
    return { playback_url: youtubeEmbed, hls_manifest_url: null }
  }

  return { playback_url: null, hls_manifest_url: hls }
}
