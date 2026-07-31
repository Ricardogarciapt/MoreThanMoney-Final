#!/usr/bin/env node
/**
 * MTM — Trabalhador de legendas ao vivo (VPS de streaming).
 *
 * ffmpeg extrai áudio PCM CONTÍNUO do HLS/FLV local → segmenta por PAUSAS naturais
 * (frases completas, sem cortar palavras a meio) → whisper-1 transcreve (verbose_json,
 * filtra música/ruído por confiança) → POST ao ingest do site, que traduz (Claude) e grava.
 *
 * Seguir a fala: em vez de blocos fixos de N segundos, acumula áudio até detetar ~0.5s de
 * silêncio (fim de frase) e só aí transcreve — dá continuidade e quase-simultaneidade.
 */
const { spawn } = require("child_process")

const API = (process.env.MTM_API_BASE || "https://www.morethanmoney.pt").replace(/\/$/, "")
const SECRET = process.env.LMS_CAPTION_WORKER_SECRET
const OPENAI = process.env.OPENAI_API_KEY
const GROQ = process.env.GROQ_API_KEY
const STREAM_ID = process.env.STREAM_ID
const STREAM_KEY = process.env.STREAM_KEY
const SOURCE_LANG = (process.env.SOURCE_LANG || "pt").toLowerCase().slice(0, 2)
// ASR: Groq Whisper (GRÁTIS, mesmo modelo) por defeito se houver GROQ_API_KEY; senão OpenAI.
const ASR_PROVIDER = process.env.CAPTION_ASR_PROVIDER || (GROQ ? "groq" : "openai")
const ASR_KEY = ASR_PROVIDER === "groq" ? GROQ : OPENAI
const ASR_URL = ASR_PROVIDER === "groq"
  ? "https://api.groq.com/openai/v1/audio/transcriptions"
  : "https://api.openai.com/v1/audio/transcriptions"
const MODEL = process.env.CAPTION_ASR_MODEL || (ASR_PROVIDER === "groq" ? "whisper-large-v3-turbo" : "whisper-1")
const INPUT =
  process.env.CAPTION_INPUT_URL || `http://127.0.0.1:8080/live/${STREAM_KEY}.flv`

// Áudio: PCM 16-bit LE mono 16 kHz
const SR = 16000, BPS = 2
const FRAME_MS = 100
const FRAME_BYTES = Math.round((SR * BPS * FRAME_MS) / 1000) // 3200
const SILENCE_PEAK = Number(process.env.CAPTION_SILENCE_PEAK || 500)
const SILENCE_MS = Number(process.env.CAPTION_SILENCE_MS || 500)   // pausa = fim de frase
const MIN_SPEECH_MS = Number(process.env.CAPTION_MIN_SPEECH_MS || 500)
const MAX_PHRASE_MS = Number(process.env.CAPTION_MAX_PHRASE_MS || 8000)
const SILENCE_FRAMES = Math.round(SILENCE_MS / FRAME_MS)
// Filtros de confiança (whisper verbose_json)
const MAX_NO_SPEECH = Number(process.env.CAPTION_MAX_NO_SPEECH || 0.8)
const MIN_LOGPROB = Number(process.env.CAPTION_MIN_LOGPROB || -2.0)

for (const [k, v] of Object.entries({ SECRET, ASR_KEY, STREAM_ID })) {
  if (!v) { console.error(`[caption-worker] falta env ${k} (ASR_KEY = GROQ_API_KEY ou OPENAI_API_KEY)`); process.exit(1) }
}

const NOISE = new Set(["", ".", "...", "obrigado", "obrigado.", "thank you", "thanks for watching", "tchau", "amém", "you"])
// Frases que o Whisper ALUCINA sobre silêncio/música (não são fala real) → descartar.
const HALLUC = [
  /amara\.?org/i, /legendas? (pela|feitas|by|comunidade)/i, /subtitles? by/i,
  /thanks? for watching/i, /obrigado por (assistir|ver|verem)/i, /subscribe|inscrev/i,
  /[♪♫🎵🎶]/, /^\s*(sim|não|ok|okay|yeah|uh|hmm)[.!\s]*$/i,
]
function isArtifact(t) {
  const s = t.trim()
  if (HALLUC.some((r) => r.test(s))) return true
  const words = s.toLowerCase().replace(/[.,!?;:]/g, "").split(/\s+/).filter(Boolean)
  // repetição excessiva (ex.: "sim sim sim sim"): poucas palavras únicas OU >=4 iguais seguidas
  if (words.length >= 4) {
    const uniq = new Set(words)
    if (uniq.size <= Math.max(1, Math.floor(words.length * 0.34))) return true
    let run = 1
    for (let i = 1; i < words.length; i++) { if (words[i] === words[i - 1]) { if (++run >= 4) return true } else run = 1 }
  }
  return false
}
function clean(t) {
  const s = (t || "").trim()
  if (s.length < 2) return ""
  if (NOISE.has(s.toLowerCase())) return ""
  if (isArtifact(s)) return ""
  return s
}
function peak(buf) {
  let p = 0
  for (let i = 0; i + 1 < buf.length; i += 2) { const s = Math.abs(buf.readInt16LE(i)); if (s > p) p = s }
  return p
}
function wavHeader(dataLen) {
  const b = Buffer.alloc(44)
  b.write("RIFF", 0); b.writeUInt32LE(36 + dataLen, 4); b.write("WAVE", 8)
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * BPS, 28); b.writeUInt16LE(BPS, 32); b.writeUInt16LE(16, 34)
  b.write("data", 36); b.writeUInt32LE(dataLen, 40)
  return b
}

console.log(`[caption-worker] stream=${STREAM_ID} lang=${SOURCE_LANG} asr=${ASR_PROVIDER} model=${MODEL} input=${INPUT}`)

const ff = spawn("ffmpeg", ["-loglevel", "error", "-i", INPUT, "-vn", "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"])
ff.stderr.on("data", (d) => process.stderr.write(`[ffmpeg] ${d}`))
ff.on("exit", (code) => { console.log(`[caption-worker] ffmpeg terminou (${code})`); process.exit(code || 0) })

let seq = 0
let lastText = ""       // contexto p/ o prompt do whisper (continuidade)
let carry = Buffer.alloc(0)          // bytes soltos < 1 frame
let phrase = []                      // frames (Buffers) da frase atual
let speechFrames = 0                 // nº de frames com fala na frase
let silenceRun = 0                   // frames de silêncio consecutivos
let busy = false

ff.stdout.on("data", (chunk) => {
  let buf = Buffer.concat([carry, chunk])
  let off = 0
  while (off + FRAME_BYTES <= buf.length) {
    const frame = buf.subarray(off, off + FRAME_BYTES)
    off += FRAME_BYTES
    const isSpeech = peak(frame) >= SILENCE_PEAK
    if (isSpeech) { phrase.push(frame); speechFrames++; silenceRun = 0 }
    else {
      silenceRun++
      if (speechFrames > 0) phrase.push(frame) // mantém a pausa curta dentro da frase
    }
    const phraseMs = phrase.length * FRAME_MS
    const speechMs = speechFrames * FRAME_MS
    // Fim de frase: pausa suficiente após fala real, OU frase demasiado longa
    if ((silenceRun >= SILENCE_FRAMES && speechMs >= MIN_SPEECH_MS) || phraseMs >= MAX_PHRASE_MS) {
      flush()
    }
  }
  carry = buf.subarray(off)
})

function flush() {
  if (speechFrames * FRAME_MS < MIN_SPEECH_MS) { phrase = []; speechFrames = 0; silenceRun = 0; return }
  const pcm = Buffer.concat(phrase)
  phrase = []; speechFrames = 0; silenceRun = 0
  if (busy) return // evita sobreposição de pedidos; a frase seguinte apanha o resto
  busy = true
  transcribe(pcm)
    .then((t) => {
      const c = clean(t)
      if (!c || c === lastText) return
      // Eco do prompt: se a nova frase contém/está contida na anterior → é repetição/eco.
      if (lastText && (c.includes(lastText) || lastText.includes(c)) && Math.min(c.length, lastText.length) > 12) return
      lastText = c
      seq++
      return postCue(seq, c)
    })
    .catch((e) => console.error("[caption-worker] flush:", e.message))
    .finally(() => { busy = false })
}

async function transcribe(pcm) {
  const wav = Buffer.concat([wavHeader(pcm.length), pcm])
  const form = new FormData()
  form.append("file", new Blob([wav], { type: "audio/wav" }), "audio.wav")
  form.append("model", MODEL)
  form.append("language", SOURCE_LANG)
  form.append("temperature", "0")
  form.append("response_format", "verbose_json")
  // NB: NÃO passar prompt — o Whisper pode injetar palavras do prompt que não foram ditas
  // (fabricação). A segmentação por pausa já dá frases completas sem precisar de contexto.
  const r = await fetch(ASR_URL, {
    method: "POST", headers: { Authorization: `Bearer ${ASR_KEY}` }, body: form,
  })
  if (!r.ok) { console.error("[caption-worker] ASR", r.status, (await r.text()).slice(0, 160)); return "" }
  const d = await r.json().catch(() => ({}))
  const segs = Array.isArray(d.segments) ? d.segments : []
  // Filtro de confiança quando o provider fornece os campos; se não (ex.: Groq turbo),
  // defaults deixam passar e a limpeza fica pelos filtros de texto (NOISE/HALLUC).
  const good = segs.filter((s) => (s.no_speech_prob ?? 0) < MAX_NO_SPEECH && (s.avg_logprob ?? 0) > MIN_LOGPROB)
  const joined = good.map((s) => (s.text || "").trim()).join(" ").trim()
  // Fallback: alguns providers devolvem só `text` sem `segments`.
  return joined || (typeof d.text === "string" ? d.text.trim() : "")
}

async function postCue(n, text) {
  try {
    const r = await fetch(`${API}/api/live-sessions/streams/${STREAM_ID}/captions/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-caption-secret": SECRET },
      body: JSON.stringify({ seq: n, source_text: text, source_language: SOURCE_LANG }),
    })
    if (!r.ok) console.error("[caption-worker] ingest", r.status, (await r.text()).slice(0, 160))
    else console.log(`[caption-worker] cue #${n}: ${text}`)
  } catch (e) { console.error("[caption-worker] ingest erro:", e.message) }
}

process.on("SIGINT", () => { ff.kill("SIGINT"); process.exit(0) })
process.on("SIGTERM", () => { ff.kill("SIGTERM"); process.exit(0) })
