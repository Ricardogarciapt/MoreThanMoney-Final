#!/usr/bin/env node
/**
 * MTM — Gestor de legendas ao vivo (corre no VPS, arranca 1x por systemd).
 *
 * Sonda periodicamente o site por sessões AO VIVO com legendas ligadas e mantém um
 * caption-worker por sessão (arranca quando fica live, mata quando termina). Assim os
 * educadores não precisam de fazer nada — basta a sessão estar live + captions_enabled.
 *
 * Uso: MTM_API_BASE=... LMS_CAPTION_WORKER_SECRET=... OPENAI_API_KEY=... node caption-manager.js
 */
const { spawn } = require("child_process")
const path = require("path")

const API = (process.env.MTM_API_BASE || "https://www.morethanmoney.pt").replace(/\/$/, "")
const SECRET = process.env.LMS_CAPTION_WORKER_SECRET
const POLL = Number(process.env.CAPTION_POLL_SECONDS || 15) * 1000
const WORKER = path.join(__dirname, "caption-worker.js")

if (!SECRET || !(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY)) {
  console.error("[caption-manager] falta LMS_CAPTION_WORKER_SECRET ou uma key ASR (GROQ_API_KEY grátis / OPENAI_API_KEY)")
  process.exit(1)
}

const workers = new Map() // stream_id -> child process

function start(job) {
  console.log(`[caption-manager] START ${job.id} (${job.source_language})`)
  const child = spawn("node", [WORKER], {
    env: {
      ...process.env,
      STREAM_ID: job.id,
      STREAM_KEY: job.stream_key,
      SOURCE_LANG: job.source_language,
    },
    stdio: "inherit",
  })
  child.on("exit", () => {
    if (workers.get(job.id) === child) workers.delete(job.id)
  })
  workers.set(job.id, child)
}

async function poll() {
  try {
    const r = await fetch(`${API}/api/live-sessions/captions/jobs`, {
      headers: { "x-caption-secret": SECRET },
    })
    if (!r.ok) {
      console.error("[caption-manager] jobs", r.status)
      return
    }
    const { jobs = [] } = await r.json()
    const live = new Set(jobs.map((j) => j.id))
    for (const j of jobs) if (j.stream_key && !workers.has(j.id)) start(j)
    for (const [id, child] of workers) {
      if (!live.has(id)) {
        console.log(`[caption-manager] STOP ${id}`)
        child.kill("SIGTERM")
        workers.delete(id)
      }
    }
  } catch (e) {
    console.error("[caption-manager] poll:", e.message)
  }
}

console.log(`[caption-manager] a sondar ${API} a cada ${POLL / 1000}s`)
setInterval(poll, POLL)
poll()

process.on("SIGTERM", () => {
  for (const [, c] of workers) c.kill("SIGTERM")
  process.exit(0)
})
