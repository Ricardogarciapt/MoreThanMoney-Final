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

function extractHostFromUrl(raw: string | null | undefined): string | null {
  const val = (raw || "").trim()
  if (!val) return null
  try {
    const withProto = /^[a-z]+:\/\//i.test(val) ? val : `rtmp://${val}`
    const u = new URL(withProto)
    return u.hostname || null
  } catch {
    return null
  }
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

  // Auto-derivação: quando só existe servidor RTMP, usamos o mesmo host para HLS público.
  // Ex.: rtmp://stream.exemplo.pt/live -> https://stream.exemplo.pt/hls
  const ingest =
    process.env.LMS_INGEST_URL?.trim() ||
    process.env.LMS_RTMPS_BASE_URL?.trim() ||
    process.env.LMS_RTMP_URL?.trim() ||
    ingestUrlFromRtmpServerHost()
  const host = extractHostFromUrl(ingest)
  if (host && host.toLowerCase() !== "live.restream.io") {
    return `https://${host}/hls`
  }

  return "https://stream.morethanmoney.pt/hls"
}

export function buildHlsManifestUrl(streamKey: string | null | undefined): string | null {
  if (!streamKey?.trim()) return null
  const key = streamKey.trim()

  // Restream: quando o OBS envia para `rtmps://live.restream.io:1937/live`,
  // as chaves seguem o padrão `re_...`. O manifest costuma ser servido em:
  // `https://live.restream.io/hls/<key>.m3u8`.
  if (key.startsWith("re_")) {
    return `https://live.restream.io/hls/${key}.m3u8`
  }

  const base = getLmsHlsPublicBaseUrl()
  return `${base}/${key}.m3u8`
}

/**
 * Candidatos de manifesto para tolerar diferenças de path no servidor HLS:
 * - /hls/<key>.m3u8 (padrão)
 * - /hls/live/<key>.m3u8 (nginx-rtmp com app `live`)
 *
 * Não altera fluxo Restream (`re_...`) nem YouTube/embed.
 */
export function buildHlsManifestCandidates(streamKey: string | null | undefined): string[] {
  if (!streamKey?.trim()) return []
  const key = streamKey.trim()

  // Restream mantém o endpoint oficial único.
  if (key.startsWith("re_")) {
    return [`https://live.restream.io/hls/${key}.m3u8`]
  }

  const base = getLmsHlsPublicBaseUrl().replace(/\/+$/, "")
  const canonical = `${base}/${key}.m3u8`

  // Se já tiver /live no final, o alternativo é sem /live.
  if (/\/live$/i.test(base)) {
    const withoutLive = base.replace(/\/live$/i, "")
    return [canonical, `${withoutLive}/${key}.m3u8`]
  }

  // Caso contrário, tenta também /live/<key>.m3u8.
  return [canonical, `${base}/live/${key}.m3u8`]
}
