#!/usr/bin/env node
/**
 * MTM DVR worker — corre no VPS de streaming.
 * Sonda o site por jobs de DVR e:
 *   • delete  → apaga as gravações no /mnt/dvr (poupa recursos) e reporta 'deleted'
 *   • assemble→ quando o site tem todos os clips TTS prontos, monta 1 MP4 multi-áudio
 *               (vídeo + PT original + faixas dobradas EN/ES/DE alinhadas às legendas)
 *               + faixas de legendas (mov_text) embutidas, e reporta 'assembled'.
 *   • youtube → faz upload da gravação montada para o YouTube (não-listado) e adiciona
 *               a uma playlist "Rever aulas"; reporta 'youtube_done'.
 *
 * Sem estado próprio: a fonte de verdade é o site. Uma gravação por SALA (stream).
 * Env: MTM_API_BASE, LMS_CAPTION_WORKER_SECRET, DVR_DIR(=/mnt/dvr),
 *      DVR_PUBLIC_BASE(=https://stream.morethanmoney.pt/dvr), POLL_SECONDS(=20)
 * Connector YouTube (opcional, requer `npm i googleapis` na pasta do worker):
 *      YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
 */
const { execFile } = require("child_process")
const fs = require("fs")
const os = require("os")
const path = require("path")

const API = (process.env.MTM_API_BASE || "https://www.morethanmoney.pt").replace(/\/$/, "")
const SECRET = process.env.LMS_CAPTION_WORKER_SECRET || ""
const DVR_DIR = process.env.DVR_DIR || "/mnt/dvr"
const PUBLIC_BASE = (process.env.DVR_PUBLIC_BASE || "https://stream.morethanmoney.pt/dvr").replace(/\/$/, "")
const POLL_MS = (parseInt(process.env.POLL_SECONDS || "20", 10) || 20) * 1000

// ISO 639-1 → 639-2 (metadata de idioma nas faixas de áudio)
const ISO3 = { pt: "por", en: "eng", es: "spa", de: "deu", fr: "fra", it: "ita", nl: "nld" }
const LABEL = { pt: "Português", en: "English", es: "Español", de: "Deutsch", fr: "Français" }

function log(...a) { console.log(new Date().toISOString(), ...a) }
function sh(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    execFile(cmd, args, { maxBuffer: 1 << 26, ...opts }, (e, so, se) => (e ? rej(new Error(se || e.message)) : res(so)))
  })
}
async function api(pathname, init = {}) {
  const r = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { "x-caption-secret": SECRET, "content-type": "application/json", ...(init.headers || {}) },
  })
  const txt = await r.text()
  let j = {}
  try { j = txt ? JSON.parse(txt) : {} } catch { j = { raw: txt } }
  if (!r.ok) throw new Error(`${pathname} → ${r.status} ${txt.slice(0, 200)}`)
  return j
}
async function report(body) { return api(`/api/live-sessions/dvr/worker`, { method: "POST", body: JSON.stringify(body) }) }

async function download(url, dest) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`download ${r.status} ${url}`)
  const buf = Buffer.from(await r.arrayBuffer())
  fs.writeFileSync(dest, buf)
  return buf.length
}
async function probeDuration(file) {
  const out = await sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])
  return parseFloat(String(out).trim()) || 0
}

/** Constrói uma faixa de áudio contínua colocando cada clip no seu offset (ms), com a duração do vídeo. */
async function buildTrack(clips, durationS, outFile) {
  // clips: [{start_ms, file}]
  const inputs = []
  const filters = []
  const labels = []
  clips.forEach((c, i) => {
    inputs.push("-i", c.file)
    const d = Math.max(0, Math.round(c.start_ms))
    filters.push(`[${i}]adelay=${d}|${d}[a${i}]`)
    labels.push(`[a${i}]`)
  })
  let fc
  if (clips.length === 1) fc = `${filters[0]};[a0]apad[out]`
  else fc = `${filters.join(";")};${labels.join("")}amix=inputs=${clips.length}:normalize=0:dropout_transition=0[m];[m]apad[out]`
  await sh("ffmpeg", [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
    ...inputs, "-filter_complex", fc, "-map", "[out]",
    "-t", String(durationS), "-c:a", "aac", "-b:a", "128k", outFile,
  ])
}

async function assemble(job) {
  const base = path.join(DVR_DIR, job.baseFile)
  if (!fs.existsSync(base)) throw new Error(`base em falta: ${base}`)
  const durationS = await probeDuration(base)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dvr-"))
  try {
    const outLangs = [] // { lang, track }
    for (const lang of job.langs) {
      const items = (job.manifest[lang] || []).filter((x) => x && x.url)
      if (!items.length) continue
      const clips = []
      for (let i = 0; i < items.length; i++) {
        const f = path.join(tmp, `${lang}-${i}.mp3`)
        try { await download(items[i].url, f); clips.push({ start_ms: items[i].start_ms, file: f }) } catch (e) { log("clip fail", e.message) }
      }
      if (!clips.length) continue
      const track = path.join(tmp, `track-${lang}.m4a`)
      await buildTrack(clips, durationS, track)
      outLangs.push({ lang, track })
    }

    // Legendas (mov_text) — descarrega os VTT que têm cues e embute-as como faixas.
    const outSubs = [] // { lang, file }
    for (const s of job.subtitles || []) {
      if (!s || !s.vttUrl) continue
      try {
        const f = path.join(tmp, `sub-${s.lang}.vtt`)
        await download(s.vttUrl, f)
        const txt = fs.readFileSync(f, "utf8")
        if (txt.includes("-->")) outSubs.push({ lang: s.lang, file: f }) // só se tiver cues
      } catch (e) { log("sub fail", s.lang, e.message) }
    }

    const multiName = `${job.streamKey}-multi.mp4`
    const outFile = path.join(DVR_DIR, multiName)
    // mux: vídeo + PT original (do base) + faixas dobradas + legendas
    const args = ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", base]
    outLangs.forEach((o) => args.push("-i", o.track))
    outSubs.forEach((s) => args.push("-i", s.file))
    const subInputBase = 1 + outLangs.length // índice do 1º input de legendas
    args.push("-map", "0:v:0", "-map", "0:a:0")
    outLangs.forEach((_, i) => args.push("-map", `${i + 1}:a:0`))
    outSubs.forEach((_, i) => args.push("-map", `${subInputBase + i}:0`))
    args.push("-c:v", "copy", "-c:a", "aac")
    if (outSubs.length) args.push("-c:s", "mov_text")
    // metadata: faixa 0 = PT
    args.push("-metadata:s:a:0", `language=${ISO3[job.sourceLang] || "por"}`, "-metadata:s:a:0", `title=${LABEL[job.sourceLang] || "Original"}`, "-disposition:a:0", "default")
    outLangs.forEach((o, i) => {
      args.push(`-metadata:s:a:${i + 1}`, `language=${ISO3[o.lang] || o.lang}`, `-metadata:s:a:${i + 1}`, `title=${LABEL[o.lang] || o.lang}`)
    })
    outSubs.forEach((s, i) => {
      args.push(`-metadata:s:s:${i}`, `language=${ISO3[s.lang] || s.lang}`, `-metadata:s:s:${i}`, `title=${LABEL[s.lang] || s.lang}`)
    })
    args.push("-movflags", "+faststart", outFile)
    await sh("ffmpeg", args)

    const size = fs.statSync(outFile).size
    await report({
      jobId: job.jobId, result: "assembled",
      multi_file: multiName, download_url: `${PUBLIC_BASE}/${multiName}`,
      size_bytes: size, duration_s: Math.round(durationS),
    })
    log(`assembled ${multiName} (${(size / 1e6).toFixed(1)}MB, ${outLangs.length + 1} áudio, ${outSubs.length} legendas)`)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

// ── Connector YouTube ─────────────────────────────────────────────────────────
// Upload não-listado + adição a uma playlist "Rever aulas". OAuth2 por refresh token.
function getYoutubeClient() {
  const cid = process.env.YOUTUBE_CLIENT_ID
  const secret = process.env.YOUTUBE_CLIENT_SECRET
  const refresh = process.env.YOUTUBE_REFRESH_TOKEN
  if (!cid || !secret || !refresh) throw new Error("credenciais YOUTUBE_* em falta")
  let google
  try { ({ google } = require("googleapis")) } catch { throw new Error("googleapis não instalado (npm i googleapis)") }
  const oauth2 = new google.auth.OAuth2(cid, secret)
  oauth2.setCredentials({ refresh_token: refresh })
  return google.youtube({ version: "v3", auth: oauth2 })
}

async function ensurePlaylist(yt, title, existingId) {
  if (existingId) return existingId
  // Procura uma playlist minha com o mesmo título antes de criar (evita duplicados).
  try {
    let pageToken
    do {
      const res = await yt.playlists.list({ part: ["snippet"], mine: true, maxResults: 50, pageToken })
      const found = (res.data.items || []).find((p) => (p.snippet && p.snippet.title) === title)
      if (found) return found.id
      pageToken = res.data.nextPageToken
    } while (pageToken)
  } catch (e) { log("playlist list fail", e.message) }
  const created = await yt.playlists.insert({
    part: ["snippet", "status"],
    requestBody: { snippet: { title }, status: { privacyStatus: "unlisted" } },
  })
  return created.data.id
}

async function uploadYoutube(job) {
  const file = path.join(DVR_DIR, job.file)
  if (!fs.existsSync(file)) throw new Error(`ficheiro em falta: ${file}`)
  const yt = getYoutubeClient()
  const up = await yt.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title: String(job.title || "Sessão MoreThanMoney").slice(0, 100), description: String(job.description || "") },
      status: { privacyStatus: job.privacyStatus || "unlisted", selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(file) },
  })
  const videoId = up.data.id
  if (!videoId) throw new Error("upload sem videoId")
  let playlistId = null
  try {
    playlistId = await ensurePlaylist(yt, job.playlistTitle || "Rever aulas", job.playlistId)
    if (playlistId) {
      await yt.playlistItems.insert({
        part: ["snippet"],
        requestBody: { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } },
      })
    }
  } catch (e) { log("playlist add fail", e.message) }
  await report({
    jobId: job.jobId, result: "youtube_done",
    video_id: videoId, video_url: `https://youtu.be/${videoId}`,
    playlist_id: playlistId || null,
    playlist_url: playlistId ? `https://www.youtube.com/playlist?list=${playlistId}` : null,
  })
  log(`youtube ok: https://youtu.be/${videoId}${playlistId ? ` (playlist ${playlistId})` : ""}`)
}

async function doDelete(job) {
  for (const f of job.files || []) {
    try { fs.rmSync(path.join(DVR_DIR, f), { force: true }); log("apagado", f) } catch (e) { log("rm fail", e.message) }
  }
  await report({ jobId: job.jobId, result: "deleted" })
}

async function tick() {
  let job
  try { job = await api(`/api/live-sessions/dvr/worker`) } catch (e) { log("poll erro:", e.message); return }
  if (!job || job.action === "none" || !job.action) return
  try {
    if (job.action === "delete") return await doDelete(job)
    if (job.action === "youtube") return await uploadYoutube(job)
    if (job.action === "assemble") {
      if (!job.ready) { log(`a preparar áudio… faltam ${job.remaining}`); return }
      return await assemble(job)
    }
  } catch (e) {
    log("job erro:", e.message)
    if (job.action === "youtube" && job.jobId) {
      try { await report({ jobId: job.jobId, result: "youtube_error", error: e.message }) } catch {}
    } else if (job.jobId) {
      try { await report({ jobId: job.jobId, result: "error", error: e.message }) } catch {}
    }
  }
}

async function main() {
  if (!SECRET) { console.error("LMS_CAPTION_WORKER_SECRET em falta"); process.exit(1) }
  log(`DVR worker iniciado — API=${API} DVR_DIR=${DVR_DIR} poll=${POLL_MS / 1000}s`)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick()
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}
main()
