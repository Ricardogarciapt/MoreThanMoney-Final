// DVR (gravação das sessões) — constantes partilhadas.
// Uma gravação por SALA (stream) no VPS de streaming; download multi-áudio + legendas; apaga após confirmação.

// Base pública das gravações (nginx serve /mnt/dvr em https, download forçado).
export const DVR_PUBLIC_BASE = "https://stream.morethanmoney.pt/dvr"

// Idiomas de dobragem oferecidos por defeito (além do PT original).
export const DVR_DEFAULT_DUB_LANGS = ["en", "es", "fr", "de"] as const

// Idiomas de legendas embutidas/sidecar (inclui PT, a língua-fonte).
export const DVR_CAPTION_LANGS = ["pt", "en", "es", "fr", "de"] as const

// Connector YouTube (upload não-listado → playlist). Ligado só quando as credenciais existem.
export function isYoutubeConnectorEnabled(): boolean {
  return Boolean(
    process.env.YOUTUBE_CLIENT_ID &&
      process.env.YOUTUBE_CLIENT_SECRET &&
      process.env.YOUTUBE_REFRESH_TOKEN,
  )
}

export function dvrDownloadUrl(file: string): string {
  return `${DVR_PUBLIC_BASE}/${file}`
}

// Segredo partilhado com o worker do VPS (reutiliza o do worker de legendas — mesma máquina/confiança).
export function getDvrWorkerSecret(): string | null {
  return process.env.LMS_CAPTION_WORKER_SECRET || null
}
