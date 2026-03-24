/**
 * Valores por defeito Restream (OBS → Servidor / URL + Stream key no painel Restream).
 * Cada educador pode guardar a sua chave em `lms_educators.restream_stream_key`.
 */
export const DEFAULT_RESTREAM_INGEST_URL = "rtmp://live.restream.io/live"

export function normalizeRestreamIngestUrl(url: string | null | undefined): string {
  const t = (url || "").trim()
  return t || DEFAULT_RESTREAM_INGEST_URL
}
