/**
 * Restream: URL e chave vêm do painel Restream (formato livre).
 * Chaves `mtm_…` em `lms_streams` / `stream_key_fixed` são só para o RTMP HLS do More Than Money — não misturar no OBS com Restream.
 */
// Restream RTMPS (requerido): rtmps://live.restream.io:1937/live
export const DEFAULT_RESTREAM_INGEST_URL = "rtmps://live.restream.io:1937/live"

export function normalizeRestreamIngestUrl(url: string | null | undefined): string {
  const t = (url || "").trim()
  return t || DEFAULT_RESTREAM_INGEST_URL
}
