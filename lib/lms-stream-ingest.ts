/**
 * Monta `rtmp://HOST/live` a partir de RTMP_SERVER_HOST (só hostname, ex.: stream.o-teu-servidor.com).
 * Usado quando não há URL completa em LMS_INGEST_URL.
 */
function ingestUrlFromRtmpServerHost(): string | null {
  const host = process.env.RTMP_SERVER_HOST?.trim()
  if (!host) return null
  const clean = host
    .replace(/^rtmps?:\/\//i, "")
    .split("/")[0]
    ?.replace(/\/+$/, "")
  if (!clean) return null
  return `rtmp://${clean}/live`
}

/**
 * URL do servidor de ingestão para OBS (aba "Stream" → Servidor personalizado).
 * Deve incluir o path da aplicação (ex.: /live), sem a stream key.
 *
 * Variáveis (por ordem de prioridade):
 * - LMS_INGEST_URL
 * - LMS_RTMPS_BASE_URL (legado)
 * - LMS_RTMP_URL
 * - RTMP_SERVER_HOST → constrói rtmp://{host}/live
 *
 * Se a ligação falhar, define no Vercel/hosting por exemplo:
 * rtmp://stream.morethanmoney.pt/live  ou  rtmps://stream.morethanmoney.pt/live
 */
export function getLmsIngestServerUrl(): string {
  const raw =
    process.env.LMS_INGEST_URL?.trim() ||
    process.env.LMS_RTMPS_BASE_URL?.trim() ||
    process.env.LMS_RTMP_URL?.trim() ||
    ingestUrlFromRtmpServerHost()
  if (raw) return raw.replace(/\/+$/, "")
  return "rtmp://stream.morethanmoney.pt/live"
}

/**
 * URL base pública para manifest HLS (alunos). Ex.: https://stream.morethanmoney.pt/hls
 * O manifest usa o mesmo identificador que a chave de ingestão no path — não expor stream_key em JSON separado.
 */
export function getLmsHlsPublicBaseUrl(): string {
  const raw = process.env.LMS_HLS_PUBLIC_BASE_URL?.trim()
  if (raw) return raw.replace(/\/+$/, "")
  return "https://stream.morethanmoney.pt/hls"
}

export function buildHlsManifestUrl(streamKey: string | null | undefined): string | null {
  if (!streamKey?.trim()) return null
  const base = getLmsHlsPublicBaseUrl()
  return `${base}/${streamKey.trim()}.m3u8`
}
