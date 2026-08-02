// Gera WebVTT / SRT a partir das legendas gravadas (lms_stream_captions).
// Usado para download sidecar (.vtt/.srt) e para o worker do VPS embutir faixas mov_text.

export type CaptionCue = {
  seq: number
  t_start_ms: number
  t_end_ms: number | null
  source_language?: string | null
  source_text?: string | null
  translations?: Record<string, string> | null
}

/** Texto do cue no idioma pedido: pt/fonte → source_text; outro → translations[lang] (fallback fonte). */
export function cueText(cue: CaptionCue, lang: string): string {
  const src = (cue.source_language || "pt").toLowerCase().slice(0, 2)
  const want = lang.toLowerCase().slice(0, 2)
  if (want === src) return (cue.source_text || "").trim()
  const t = cue.translations?.[want] ?? cue.translations?.[lang]
  return (t || cue.source_text || "").trim()
}

function fmtTimestamp(ms: number, sep: "." | ","): string {
  const total = Math.max(0, Math.floor(ms))
  const h = Math.floor(total / 3600000)
  const m = Math.floor((total % 3600000) / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const msPart = total % 1000
  const pad = (n: number, w = 2) => String(n).padStart(w, "0")
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(msPart, 3)}`
}

/** Garante fim > início; se t_end_ms faltar, usa +2.5s ou o início do cue seguinte. */
function endMs(cue: CaptionCue, next?: CaptionCue): number {
  if (typeof cue.t_end_ms === "number" && cue.t_end_ms > cue.t_start_ms) return cue.t_end_ms
  if (next && next.t_start_ms > cue.t_start_ms) return Math.min(next.t_start_ms, cue.t_start_ms + 8000)
  return cue.t_start_ms + 2500
}

export function toWebVTT(cues: CaptionCue[], lang: string): string {
  const sorted = [...cues].sort((a, b) => a.t_start_ms - b.t_start_ms)
  const lines: string[] = ["WEBVTT", ""]
  sorted.forEach((cue, i) => {
    const text = cueText(cue, lang)
    if (!text) return
    const start = fmtTimestamp(cue.t_start_ms, ".")
    const end = fmtTimestamp(endMs(cue, sorted[i + 1]), ".")
    lines.push(`${start} --> ${end}`)
    lines.push(text)
    lines.push("")
  })
  return lines.join("\n")
}

export function toSRT(cues: CaptionCue[], lang: string): string {
  const sorted = [...cues].sort((a, b) => a.t_start_ms - b.t_start_ms)
  const blocks: string[] = []
  let n = 0
  sorted.forEach((cue, i) => {
    const text = cueText(cue, lang)
    if (!text) return
    n += 1
    const start = fmtTimestamp(cue.t_start_ms, ",")
    const end = fmtTimestamp(endMs(cue, sorted[i + 1]), ",")
    blocks.push(`${n}\n${start} --> ${end}\n${text}\n`)
  })
  return blocks.join("\n")
}
