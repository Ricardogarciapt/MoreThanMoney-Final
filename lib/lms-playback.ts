import { buildHlsManifestUrl } from "@/lib/lms-stream-ingest"

type EducatorPlayback = {
  restream_enabled?: boolean | null
  restream_embed_url?: string | null
}

/**
 * Prioridade para o aluno: playback manual (YouTube, etc.) → embed Restream por canal → embed Restream do educador → HLS próprio.
 */
export function resolveViewerPlayback(stream: {
  playback_url?: string | null
  restream_embed_url?: string | null
  stream_key?: string | null
  educator?: EducatorPlayback | null
}): { playback_url: string | null; hls_manifest_url: string | null } {
  const manual = (stream.playback_url || "").trim()
  if (manual) {
    return { playback_url: manual, hls_manifest_url: null }
  }

  const streamEmbed = (stream.restream_embed_url || "").trim()
  if (streamEmbed) {
    return { playback_url: streamEmbed, hls_manifest_url: null }
  }

  const edu = stream.educator
  if (edu?.restream_enabled && (edu.restream_embed_url || "").trim()) {
    return { playback_url: (edu.restream_embed_url as string).trim(), hls_manifest_url: null }
  }

  return {
    playback_url: null,
    hls_manifest_url: buildHlsManifestUrl(stream.stream_key),
  }
}
