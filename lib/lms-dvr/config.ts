// DVR (gravação das sessões) — constantes partilhadas.
// Uma gravação por educador no VPS de streaming; download multi-áudio; apaga após confirmação.

// Base pública das gravações (nginx serve /mnt/dvr em https, download forçado).
export const DVR_PUBLIC_BASE = "https://stream.morethanmoney.pt/dvr"

// Idiomas de dobragem oferecidos por defeito (além do PT original).
export const DVR_DEFAULT_DUB_LANGS = ["en", "es", "fr", "de"] as const

export function dvrDownloadUrl(file: string): string {
  return `${DVR_PUBLIC_BASE}/${file}`
}

// Segredo partilhado com o worker do VPS (reutiliza o do worker de legendas — mesma máquina/confiança).
export function getDvrWorkerSecret(): string | null {
  return process.env.LMS_CAPTION_WORKER_SECRET || null
}
