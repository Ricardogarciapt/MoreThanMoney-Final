export const LMS_PLAYBACK_MODES = ["youtube_first", "hls_first", "auto"] as const
export type LmsPlaybackMode = (typeof LMS_PLAYBACK_MODES)[number]

export const LMS_INGEST_PROVIDERS = ["restream", "mtm_direct"] as const
export type LmsIngestProvider = (typeof LMS_INGEST_PROVIDERS)[number]

export function normalizePlaybackMode(value: unknown): LmsPlaybackMode {
  const v = String(value || "").trim().toLowerCase()
  if (LMS_PLAYBACK_MODES.includes(v as LmsPlaybackMode)) return v as LmsPlaybackMode
  // Default HLS-first: menor latência (o resolver faz fallback a YouTube se não houver HLS).
  return "hls_first"
}

export function normalizeIngestProvider(value: unknown): LmsIngestProvider {
  const v = String(value || "").trim().toLowerCase()
  if (LMS_INGEST_PROVIDERS.includes(v as LmsIngestProvider)) return v as LmsIngestProvider
  return "restream"
}
