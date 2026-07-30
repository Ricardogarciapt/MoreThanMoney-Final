#!/usr/bin/env node
/**
 * MTM — Trabalhador de legendas ao vivo (corre no VPS de streaming).
 *
 * Fluxo: ffmpeg capta o áudio do HLS local (SRS) em segmentos WAV curtos → OpenAI
 * transcreve no idioma de origem → POST ao endpoint de ingest do site, que traduz
 * (Claude) e grava o cue (Realtime para o web; polling para as apps nativas).
 *
 * Uso:
 *   STREAM_ID=<uuid> STREAM_KEY=<key> SOURCE_LANG=pt \
 *   OPENAI_API_KEY=... LMS_CAPTION_WORKER_SECRET=... \
 *   node caption-worker.js
 *
 * Requer: Node 18+ (fetch/FormData/Blob globais) e ffmpeg no PATH.
 */
const { spawn } = require("child_process")
const fs = require("fs")
const os = require("os")
const path = require("path")

const API = (process.env.MTM_API_BASE || "https://www.morethanmoney.pt").replace(/\/$/, "")
const SECRET = process.env.LMS_CAPTION_WORKER_SECRET
const OPENAI = process.env.OPENAI_API_KEY
const STREAM_ID = process.env.STREAM_ID
const STREAM_KEY = process.env.STREAM_KEY
const SOURCE_LANG = (process.env.SOURCE_LANG || "pt").toLowerCase().slice(0, 2)
const SEG = Number(process.env.CAPTION_SEGMENT_SECONDS || 5)
const MODEL = process.env.CAPTION_ASR_MODEL || "gpt-4o-transcribe"
const INPUT =
  process.env.CAPTION_INPUT_URL ||
  `http://127.0.0.1:8080/live/${STREAM_KEY}.m3u8` // SRS HLS local

for (const [k, v] of Object.entries({ SECRET, OPENAI, STREAM_ID })) {
  if (!v) {
    console.error(`[caption-worker] falta env ${k}`)
    process.exit(1)
  }
}

// Fragmentos de "silêncio" que os modelos de ASR às vezes alucinam — descartar.
const NOISE = new Set(["", ".", "...", "obrigado", "thank you", "thanks for watching", "..."])
function clean(t) {
  const s = (t || "").trim()
  if (s.length < 2) return ""
  if (NOISE.has(s.toLowerCase())) return ""
  return s
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mtmcap-"))
let seq = 0
const processed = new Set()

console.log(`[caption-worker] stream=${STREAM_ID} lang=${SOURCE_LANG} input=${INPUT}`)

const ff = spawn("ffmpeg", [
  "-loglevel", "error",
  "-i", INPUT,
  "-vn", "-ac", "1", "-ar", "16000",
  "-f", "segment", "-segment_time", String(SEG), "-reset_timestamps", "1",
  path.join(dir, "seg_%05d.wav"),
])
ff.stderr.on("data", (d) => process.stderr.write(`[ffmpeg] ${d}`))
ff.on("exit", (code) => {
  console.log(`[caption-worker] ffmpeg terminou (${code}) — a sair`)
  cleanup()
  process.exit(code || 0)
})

// Um segmento está completo quando o seguinte já existe (o último ainda está a escrever).
const tick = setInterval(() => {
  let files
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".wav")).sort()
  } catch {
    return
  }
  const complete = files.slice(0, Math.max(0, files.length - 1))
  for (const f of complete) {
    if (processed.has(f)) continue
    processed.add(f)
    handle(path.join(dir, f)).catch((e) => console.error("[caption-worker] handle:", e.message))
  }
}, 1000)

async function handle(file) {
  let buf
  try {
    buf = fs.readFileSync(file)
  } catch {
    return
  }
  fs.unlink(file, () => {})
  if (buf.length < 8000) return // ~silêncio muito curto
  const text = clean(await transcribe(buf))
  if (!text) return
  seq += 1
  await postCue(seq, text)
}

async function transcribe(buf) {
  const form = new FormData()
  form.append("file", new Blob([buf], { type: "audio/wav" }), "audio.wav")
  form.append("model", MODEL)
  form.append("language", SOURCE_LANG)
  form.append("response_format", "json")
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI}` },
    body: form,
  })
  if (!r.ok) {
    console.error("[caption-worker] ASR", r.status, (await r.text()).slice(0, 200))
    return ""
  }
  const d = await r.json().catch(() => ({}))
  return d.text || ""
}

async function postCue(seq, text) {
  try {
    const r = await fetch(`${API}/api/live-sessions/streams/${STREAM_ID}/captions/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-caption-secret": SECRET },
      body: JSON.stringify({ seq, source_text: text, source_language: SOURCE_LANG }),
    })
    if (!r.ok) console.error("[caption-worker] ingest", r.status, (await r.text()).slice(0, 200))
    else console.log(`[caption-worker] cue #${seq}: ${text}`)
  } catch (e) {
    console.error("[caption-worker] ingest erro:", e.message)
  }
}

function cleanup() {
  clearInterval(tick)
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {}
}
process.on("SIGINT", () => { ff.kill("SIGINT"); cleanup(); process.exit(0) })
process.on("SIGTERM", () => { ff.kill("SIGTERM"); cleanup(); process.exit(0) })
