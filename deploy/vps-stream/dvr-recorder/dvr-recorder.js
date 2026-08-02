#!/usr/bin/env node
/**
 * MTM DVR recorder — grava as sessões SEM usar o DVR nativo do SRS (que segfaultava o SRS).
 *
 * Desacoplado: sonda a API do SRS pelos streams a publicar e, para cada um, corre um
 * ffmpeg SEPARADO que puxa o FLV local e copia (-c copy, sem transcode → CPU baixa) para
 * /mnt/dvr/<key>.mp4. Se o ffmpeg falhar, o SRS NÃO é afetado (processos distintos).
 * Quando o publisher termina, o ffmpeg fecha o ficheiro e regista a gravação no site
 * (POST /api/live-sessions/dvr/on-dvr) — reutiliza todo o pipeline de download/assembly.
 *
 * Env: MTM_API_BASE, RTMP_RELAY_SECRET, DVR_DIR(=/mnt/dvr),
 *      SRS_API(=http://127.0.0.1:1985), FLV_BASE(=http://127.0.0.1:8080/live), POLL_SECONDS(=8)
 */
const { spawn } = require("child_process")
const fs = require("fs")
const path = require("path")

const API = (process.env.MTM_API_BASE || "https://www.morethanmoney.pt").replace(/\/$/, "")
const SECRET = process.env.RTMP_RELAY_SECRET || ""
const DVR_DIR = process.env.DVR_DIR || "/mnt/dvr"
const SRS_API = (process.env.SRS_API || "http://127.0.0.1:1985").replace(/\/$/, "")
const FLV_BASE = (process.env.FLV_BASE || "http://127.0.0.1:8080/live").replace(/\/$/, "")
const POLL_MS = (parseInt(process.env.POLL_SECONDS || "8", 10) || 8) * 1000

// Só gravamos chaves de ingestão MTM (evita gravar republicações/forwards).
const KEY_RE = /^mtm_[a-z0-9]+_[a-f0-9]+$/i

const recorders = new Map() // key -> { proc, file }
const recentStops = new Map() // key -> timestamp do último stop (evita corrida stop→start)
// Não reiniciar (nem apagar o ficheiro) de uma gravação que parou há pouco: quando o
// publisher sai, o SRS ainda lista o stream por 1-2 ticks → sem isto, um restart imediato
// apagava a gravação acabada de fazer (linha do rmSync). > POLL para cobrir o lag do SRS.
const RESTART_COOLDOWN_MS = 12000

function log(...a) { console.log(new Date().toISOString(), ...a) }

async function srsStreams() {
  try {
    const r = await fetch(`${SRS_API}/api/v1/streams/`, { signal: AbortSignal.timeout(5000) })
    const j = await r.json()
    return Array.isArray(j?.streams) ? j.streams : []
  } catch { return null } // null = SRS não respondeu (não mexemos nas gravações)
}

async function registerOnDvr(key, file) {
  try {
    const r = await fetch(`${API}/api/live-sessions/dvr/on-dvr?secret=${encodeURIComponent(SECRET)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "on_dvr", app: "live", stream: key, file }),
      signal: AbortSignal.timeout(10000),
    })
    log("on-dvr", key, "→", r.status)
  } catch (e) { log("on-dvr falhou", key, e.message) }
}

function startRecording(key) {
  const file = path.join(DVR_DIR, `${key}.mp4`)
  // Remove ficheiro anterior antes de gravar (o dir é 777 → conseguimos apagar mesmo
  // ficheiros de outro dono; evita "Permission denied" ao reabrir com -y).
  try { fs.rmSync(file, { force: true }) } catch {}
  // -c copy: sem transcode. Fragmentado → o ficheiro fica sempre válido mesmo se interrompido.
  const args = [
    "-nostdin", "-hide_banner", "-loglevel", "error",
    "-fflags", "+genpts",
    "-i", `${FLV_BASE}/${key}.flv`,
    "-c", "copy",
    "-movflags", "+frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4", "-y", file,
  ]
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] })
  recorders.set(key, { proc, file })
  log("REC start", key, "→", file)
  proc.stderr.on("data", (d) => process.stderr.write(`[rec ${key}] ${d}`))
  proc.on("exit", (code) => {
    recorders.delete(key)
    recentStops.set(key, Date.now()) // marca o stop → bloqueia restart imediato (corrida)
    log("REC stop", key, `(code ${code})`)
    // regista a gravação no site (só se o ficheiro existe e tem tamanho)
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 100000) registerOnDvr(key, file)
    } catch {}
  })
}

async function tick() {
  const streams = await srsStreams()
  if (streams === null) return
  const publishing = new Set(
    streams
      .map((s) => String(s?.name || "").replace(/\.flv$/i, ""))
      .filter((k) => KEY_RE.test(k)),
  )
  // arranca gravação p/ novos publishers (com cooldown p/ não reiniciar/apagar logo após um stop)
  for (const key of publishing) {
    if (recorders.has(key)) continue
    const stoppedAt = recentStops.get(key)
    if (stoppedAt && Date.now() - stoppedAt < RESTART_COOLDOWN_MS) continue // evita corrida stop→start (apagava a gravação)
    recentStops.delete(key)
    startRecording(key)
  }
  // limpa marcas de stop antigas de streams que já não publicam (novo publish futuro grava logo)
  for (const [key, ts] of recentStops) {
    if (!publishing.has(key) && Date.now() - ts > RESTART_COOLDOWN_MS) recentStops.delete(key)
  }
  // termina gravadores cujo publisher já saiu (o ffmpeg costuma sair sozinho quando o FLV acaba;
  // isto é a rede de segurança para o finalizar graciosamente)
  for (const [key, rec] of recorders) {
    if (!publishing.has(key)) {
      try { rec.proc.kill("SIGINT") } catch {}
    }
  }
}

async function main() {
  if (!SECRET) { console.error("RTMP_RELAY_SECRET em falta"); process.exit(1) }
  fs.mkdirSync(DVR_DIR, { recursive: true })
  log(`DVR recorder iniciado — SRS=${SRS_API} DVR_DIR=${DVR_DIR} poll=${POLL_MS / 1000}s`)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await tick() } catch (e) { log("tick erro:", e.message) }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}
process.on("SIGTERM", () => { for (const [, r] of recorders) { try { r.proc.kill("SIGINT") } catch {} } ; setTimeout(() => process.exit(0), 1500) })
main()
