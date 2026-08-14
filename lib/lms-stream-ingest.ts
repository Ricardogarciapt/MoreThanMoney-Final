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

/**
 * Chaves cujo browser-stream é re-encodado no VPS (ver whip/route.ts + mtm-rtc-reencode@).
 * Para estas, além do HLS single-quality, existe um ladder ABR (720p+480p) em
 * /hls-abr/<key>/master.m3u8 → dá o menu de qualidade nos players (web/iOS/Android).
 */
function reencodeKeys(): string[] {
  return (process.env.LMS_RTC_REENCODE_KEYS || "mtm_c6e156d5_1d7c9b9c556a2524248f894b1cbf344f")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function isReencodeKey(key: string): boolean {
  return reencodeKeys().includes(key)
}

/** Base pública do ladder ABR. Deriva da base HLS trocando /hls -> /hls-abr. */
function getLmsAbrPublicBaseUrl(): string {
  const explicit = process.env.LMS_HLS_ABR_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, "")
  const base = getLmsHlsPublicBaseUrl().replace(/\/+$/, "")
  return /\/hls$/i.test(base) ? base.replace(/\/hls$/i, "/hls-abr") : `${base}-abr`
}

/** URL da master ABR (menu de qualidade) para uma chave re-encode. */
export function buildAbrMasterUrl(streamKey: string | null | undefined): string | null {
  if (!streamKey?.trim()) return null
  const key = streamKey.trim()
  if (!isReencodeKey(key)) return null
  return `${getLmsAbrPublicBaseUrl()}/${key}/master.m3u8`
}

export function buildHlsManifestUrl(streamKey: string | null | undefined): string | null {
  if (!streamKey?.trim()) return null
  const key = streamKey.trim()

  // Chaves re-encode: servir a master ABR (720p+480p+Auto) → o player ganha menu de qualidade.
  const abr = buildAbrMasterUrl(key)
  if (abr) return abr

  // Arquitetura: OBS → Restream → VPS (stream.morethanmoney.pt)
  // O Restream empurra RTMP para o VPS usando a chave configurada na destino (pode ser `re_` ou `mtm_`).
  // O HLS é sempre servido a partir do VPS — não do CDN do Restream.
  const base = getLmsHlsPublicBaseUrl()
  return `${base}/${key}.m3u8`
}

/**
 * Candidatos de manifesto para tolerar diferenças de path no servidor HLS:
 * - /hls/<key>.m3u8 (padrão SRS)
 * - /hls/live/<key>.m3u8 (nginx-rtmp com app `live`)
 *
 * Todas as chaves (`re_`, `mtm_`, etc.) usam o VPS como playback.
 */
export function buildHlsManifestCandidates(streamKey: string | null | undefined): string[] {
  if (!streamKey?.trim()) return []
  const key = streamKey.trim()

  const base = getLmsHlsPublicBaseUrl().replace(/\/+$/, "")
  const canonical = `${base}/${key}.m3u8`

  // Chaves re-encode: master ABR primeiro (menu de qualidade), single-quality como fallback
  // se o ladder ainda não estiver a produzir (ffmpeg #2 a arrancar).
  const abr = buildAbrMasterUrl(key)
  const prefix = abr ? [abr] : []

  // Se já tiver /live no final, o alternativo é sem /live.
  if (/\/live$/i.test(base)) {
    const withoutLive = base.replace(/\/live$/i, "")
    return [...prefix, canonical, `${withoutLive}/${key}.m3u8`]
  }

  // Caso contrário, tenta também /live/<key>.m3u8.
  return [...prefix, canonical, `${base}/live/${key}.m3u8`]
}
