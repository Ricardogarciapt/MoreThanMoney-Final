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
 * Connector YouTube (opcional, SEM dependências — usa a API REST via fetch/https nativos):
 *      YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
 */
const { execFile } = require("child_process")
const fs = require("fs")
const os = require("os")
const path = require("path")
const https = require("https")

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

/**
 * O gravador escreve `<base>__<epoch>.mp4` (uma gravação por arranque) mas o trabalho guarda o nome
 * sem sufixo. Sem isto, uma sessão gravada em duas partes falhava com «base em falta» (16/09).
 * Escolhe-se a MAIOR das variantes: é a gravação completa da sessão, não um arranque falhado.
 */
function resolverBase(baseFile) {
  const direto = path.join(DVR_DIR, baseFile)
  if (fs.existsSync(direto)) return direto
  const semExt = baseFile.replace(/\.mp4$/i, "")
  const candidatos = fs
    .readdirSync(DVR_DIR)
    .filter((f) => f.startsWith(`${semExt}__`) && f.endsWith(".mp4") && !f.includes("-multi"))
    .map((f) => ({ f: path.join(DVR_DIR, f), size: fs.statSync(path.join(DVR_DIR, f)).size }))
    .sort((a, b) => b.size - a.size)
  return candidatos.length ? candidatos[0].f : direto
}

async function assemble(job) {
  const base = resolverBase(job.baseFile)
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

// ── Connector YouTube (REST puro, sem dependências) ─────────────────────────────
// Access token a partir do refresh token (OAuth2).
async function ytAccessToken() {
  const cid = process.env.YOUTUBE_CLIENT_ID
  const secret = process.env.YOUTUBE_CLIENT_SECRET
  const refresh = process.env.YOUTUBE_REFRESH_TOKEN
  if (!cid || !secret || !refresh) throw new Error("credenciais YOUTUBE_* em falta")
  const body = new URLSearchParams({ client_id: cid, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" })
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body,
  })
  const j = await r.json().catch(() => ({}))
  if (!j.access_token) throw new Error("token: " + JSON.stringify(j).slice(0, 200))
  return j.access_token
}

async function ytJson(token, method, url, bodyObj) {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  })
  const t = await r.text()
  let j = {}
  try { j = t ? JSON.parse(t) : {} } catch { j = { raw: t } }
  if (!r.ok) throw new Error(`${method} ${url.split("?")[0]} → ${r.status} ${t.slice(0, 200)}`)
  return j
}

// Procura playlist minha pelo título (evita duplicados) ou cria uma não-listada.
async function ensurePlaylist(token, title, existingId) {
  if (existingId) return existingId
  try {
    let pageToken = ""
    do {
      const u = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`
      const res = await ytJson(token, "GET", u)
      const found = (res.items || []).find((p) => p.snippet && p.snippet.title === title)
      if (found) return found.id
      pageToken = res.nextPageToken || ""
    } while (pageToken)
  } catch (e) { log("playlist list fail", e.message) }
  const created = await ytJson(token, "POST", "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status", {
    snippet: { title }, status: { privacyStatus: "unlisted" },
  })
  return created.id
}

// Upload resumable de um vídeo (stream do ficheiro) → devolve videoId.
async function ytUploadVideo(token, filePath, snippet, privacyStatus) {
  const meta = JSON.stringify({ snippet, status: { privacyStatus: privacyStatus || "unlisted", selfDeclaredMadeForKids: false } })
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/*" },
    body: meta,
  })
  if (!init.ok) throw new Error(`init upload ${init.status} ${(await init.text()).slice(0, 200)}`)
  const uploadUrl = init.headers.get("location")
  if (!uploadUrl) throw new Error("sem URL de upload resumable")
  const size = fs.statSync(filePath).size
  const u = new URL(uploadUrl)
  return await new Promise((resolve, reject) => {
    const req = https.request(
      { method: "PUT", hostname: u.hostname, path: u.pathname + u.search, headers: { "content-length": size, "content-type": "video/*" } },
      (res) => {
        let data = ""
        res.on("data", (d) => (data += d))
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data).id) } catch { reject(new Error("parse upload resp: " + data.slice(0, 200))) }
          } else reject(new Error(`PUT upload ${res.statusCode} ${data.slice(0, 200)}`))
        })
      },
    )
    req.on("error", reject)
    fs.createReadStream(filePath).pipe(req)
  })
}

// Legendas (multipart/related: metadata JSON + ficheiro SRT).
async function ytInsertCaption(token, videoId, lang, name, srt) {
  const boundary = "mtmcc" + videoId + lang
  const meta = JSON.stringify({ snippet: { videoId, language: lang, name } })
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${srt}\r\n--${boundary}--\r\n`
  const r = await fetch("https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!r.ok) throw new Error(`cc ${r.status} ${(await r.text()).slice(0, 160)}`)
}

// ISO 639-2 (tags do ffprobe) → 639-1
const ISO2 = { por: "pt", eng: "en", spa: "es", deu: "de", fra: "fr", ita: "it", nld: "nl" }

/** Mapa { idioma-2-letras: ordinal da faixa de áudio } a partir das tags do ficheiro. */
async function ffprobeAudioLangs(file) {
  const out = await sh("ffprobe", [
    "-v", "error", "-select_streams", "a",
    "-show_entries", "stream_tags=language", "-of", "json", file,
  ])
  let j = {}
  try { j = JSON.parse(String(out)) } catch { j = {} }
  const map = {}
  ;(j.streams || []).forEach((st, i) => {
    const lang3 = (st.tags && st.tags.language) || ""
    const two = ISO2[lang3] || lang3.slice(0, 2)
    if (two && map[two] === undefined) map[two] = i // ordinal dentro das faixas de áudio
  })
  return map
}

// Upload para o YouTube: UM vídeo por idioma (vídeo + a faixa de áudio desse idioma + CC +
// título traduzido). Extrai cada faixa do master multi-áudio; o master FICA no DVR.
async function uploadYoutube(job) {
  const master = job.masterFile ? path.join(DVR_DIR, job.masterFile) : null
  const baseF = job.baseFile ? path.join(DVR_DIR, job.baseFile) : null
  const src = master && fs.existsSync(master) ? master : baseF
  if (!src || !fs.existsSync(src)) throw new Error("ficheiro em falta p/ youtube")

  const token = await ytAccessToken()
  const audioMap = await ffprobeAudioLangs(src) // { lang: ordinal }
  let playlistId = null
  try { playlistId = await ensurePlaylist(token, job.playlistTitle || "Gravações", job.playlistId) } catch (e) { log("playlist fail", e.message) }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytdvr-"))
  const results = []
  try {
    for (const up of job.uploads || []) {
      const ordinal = audioMap[up.lang]
      // sem faixa de áudio nesse idioma → salta (exceto a fonte, que usa a faixa 0)
      if (ordinal === undefined && up.lang !== job.sourceLang) continue
      const idx = ordinal === undefined ? 0 : ordinal
      const outFile = path.join(tmp, `${up.lang}.mp4`)
      // vídeo + só a faixa de áudio desse idioma (copy = rápido; áudio já alinhado por timestamp)
      await sh("ffmpeg", [
        "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", src,
        "-map", "0:v:0", "-map", `0:a:${idx}`, "-c", "copy", "-movflags", "+faststart", outFile,
      ])
      let videoId
      try {
        videoId = await ytUploadVideo(token, outFile, { title: String(up.title || "").slice(0, 100), description: String(up.description || "") }, job.privacyStatus)
      } finally {
        fs.rmSync(outFile, { force: true })
      }
      if (!videoId) continue
      // CC nesse idioma
      try {
        const r = await fetch(up.srtUrl)
        if (r.ok) {
          const srt = await r.text()
          if (srt.includes("-->")) await ytInsertCaption(token, videoId, up.lang, LABEL[up.lang] || up.lang, srt)
        }
      } catch (e) { log("cc fail", up.lang, e.message) }
      // playlist
      if (playlistId) {
        try {
          await ytJson(token, "POST", "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
            snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } },
          })
        } catch (e) { log("pl add fail", e.message) }
      }
      results.push({ lang: up.lang, videoId })
      log(`youtube ${up.lang} ok https://youtu.be/${videoId}`)
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  if (!results.length) throw new Error("nenhum vídeo enviado (sem faixas de áudio?)")
  const first = results[0]
  await report({
    jobId: job.jobId, result: "youtube_done",
    video_id: first.videoId, video_url: `https://youtu.be/${first.videoId}`,
    playlist_id: playlistId || null,
    playlist_url: playlistId ? `https://www.youtube.com/playlist?list=${playlistId}` : null,
    videos: results,
  })
  log(`youtube done: ${results.length} vídeos${playlistId ? ` (playlist ${playlistId})` : ""}`)

  /**
   * O DISCO LIMPA-SE DEPOIS DE SUBIR.
   *
   * Antes o master ficava aqui para sempre — «1 gravação por sala, não apagar». Isso enchia o
   * disco de gigabytes de ficheiros que já estão no YouTube, onde não expiram e de onde se
   * descarregam. Decisão do Ricardo: depois de subido e publicado, o ficheiro sai daqui.
   *
   * Três condições, e as três têm de se verificar:
   *
   * 1. O `report` acima CORREU. Se ele falhou, isto nem chega a ser executado — o site não sabe
   *    onde está o vídeo e o ficheiro é a única cópia que resta.
   * 2. Há pelo menos um `videoId` do YouTube. Sem isso não há para onde ter ido.
   * 3. Apaga-se com `force`, sem rebentar: perder a gravação por causa de uma permissão errada
   *    seria trocar um problema de disco por um problema pior.
   *
   * Guarda-se `DVR_MANTER=1` para quem quiser o comportamento antigo numa máquina de testes.
   */
  if (process.env.DVR_MANTER === "1") {
    log("DVR_MANTER=1 — ficheiros mantidos")
    return
  }

  const aApagar = [master, baseF].filter((f) => f && fs.existsSync(f))
  let libertado = 0
  for (const f of aApagar) {
    try {
      libertado += fs.statSync(f).size
      fs.rmSync(f, { force: true })
      log(`apagado do DVR: ${path.basename(f)}`)
    } catch (e) {
      // Falhar a limpeza não é um erro do trabalho: o vídeo está no YouTube, que era o ponto.
      log(`nao consegui apagar ${path.basename(f)}: ${e.message}`)
    }
  }
  if (libertado) log(`libertados ${(libertado / 1024 / 1024 / 1024).toFixed(2)} GB`)
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
