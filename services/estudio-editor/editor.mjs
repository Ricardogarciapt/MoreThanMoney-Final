#!/usr/bin/env node
// EDITOR DO ESTÚDIO — corre no Mac. Pega nos takes que o Ricardo marcou como «Escolher» em
// /estudio, edita-os e devolve o reel pronto, que entra na fila do Instagram como rascunho
// (o AG-OPERADOR aprova). Fala só com https://www.morethanmoney.pt/api/estudio/motor.
//
// Edição base (sempre, sem custo): corta o silêncio do início, enquadra em 1080x1920,
// 30 fps, som normalizado a -14 LUFS, H.264 com faststart. Se ESTUDIO_EDIT_CMD estiver definido,
// corre esse comando em vez da edição base, com {in} {out} {guiao} substituídos (ex.: um
// `claude -p` com a skill /video-edit). Um trabalho de cada vez e com prioridade baixa: o Mac
// não aguenta mais de 2 processos pesados.
//
// Variáveis: CRON_SECRET e/ou LMS_CAPTION_WORKER_SECRET (pelo menos um), MTM_SITE (omissão https://www.morethanmoney.pt),
//            ESTUDIO_EDIT_CMD (opcional), ESTUDIO_INTERVALO_S (omissão 120).
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SITE = (process.env.MTM_SITE || 'https://www.morethanmoney.pt').replace(/\/$/, '')
const SEGREDO = process.env.CRON_SECRET?.trim()
const INTERVALO = Math.max(30, Number(process.env.ESTUDIO_INTERVALO_S) || 120) * 1000
const SEGREDO_WORKER = process.env.LMS_CAPTION_WORKER_SECRET?.trim()
if (!SEGREDO && !SEGREDO_WORKER) { console.error('Falta CRON_SECRET ou LMS_CAPTION_WORKER_SECRET'); process.exit(1) }

const auth = {
  ...(SEGREDO ? { authorization: `Bearer ${SEGREDO}` } : {}),
  ...(SEGREDO_WORKER ? { 'x-caption-secret': SEGREDO_WORKER } : {}),
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toISOString(), ...a)

function correr(cmd, args, opts = {}) {
  return new Promise((ok, falha) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], ...opts })
    p.on('error', falha)
    p.on('exit', (c) => (c === 0 ? ok() : falha(new Error(`${cmd} saiu com ${c}`))))
  })
}

async function edicaoBase(entrada, saida) {
  const filtroVideo = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p'
  const filtroAudio = 'loudnorm=I=-14:TP=-1.5:LRA=11'
  // Corta o silêncio do início (até ao primeiro som) nos dois fluxos de uma vez, com -ss.
  const inicio = await primeiroSom(entrada)
  await correr('nice', ['-n', '15', 'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-threads', '2',
    ...(inicio > 0.2 ? ['-ss', String(Math.max(0, inicio - 0.15))] : []),
    '-i', entrada, '-vf', filtroVideo, '-af', filtroAudio,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart', saida])
}

function primeiroSom(entrada) {
  return new Promise((ok) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-i', entrada, '-af', 'silencedetect=noise=-45dB:d=0.2', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => { err += d })
    p.on('exit', () => {
      const ini = err.match(/silence_start: (-?[\d.]+)/)
      const fim = err.match(/silence_end: ([\d.]+)/)
      ok(ini && Number(ini[1]) <= 0.05 && fim ? Number(fim[1]) : 0)
    })
  })
}

async function umTrabalho() {
  const r = await fetch(`${SITE}/api/estudio/motor`, { headers: auth })
  if (!r.ok) throw new Error(`motor GET ${r.status}`)
  const { trabalho: t } = await r.json()
  if (!t) return false
  log('a editar', t.id, t.marca)
  const pasta = await mkdtemp(join(tmpdir(), 'mtm-estudio-'))
  try {
    const ext = t.bruto_mime === 'video/webm' ? 'webm' : t.bruto_mime === 'video/quicktime' ? 'mov' : 'mp4'
    const entrada = join(pasta, `bruto.${ext}`)
    const saida = join(pasta, 'editado.mp4')
    const guiao = join(pasta, 'guiao.json')
    const d = await fetch(t.bruto_url)
    if (!d.ok) throw new Error(`descarga ${d.status}`)
    await writeFile(entrada, Buffer.from(await d.arrayBuffer()))
    await writeFile(guiao, JSON.stringify({ marca: t.marca, ...t.guiao }, null, 2))

    if (process.env.ESTUDIO_EDIT_CMD) {
      const cmd = process.env.ESTUDIO_EDIT_CMD.replaceAll('{in}', entrada).replaceAll('{out}', saida).replaceAll('{guiao}', guiao)
      await correr('nice', ['-n', '15', '/bin/zsh', '-lc', cmd])
    } else {
      await edicaoBase(entrada, saida)
    }

    const corpo = await readFile(saida)
    const s = await fetch(t.subir_url, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'x-upsert': 'true' }, body: corpo })
    if (!s.ok) throw new Error(`upload ${s.status}`)
    const f = await fetch(`${SITE}/api/estudio/motor`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ id: t.id, ok: true }) })
    log('pronto', t.id, await f.text())
  } catch (e) {
    log('falhou', t.id, e.message)
    await fetch(`${SITE}/api/estudio/motor`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ id: t.id, ok: false, erro: e.message }) }).catch(() => {})
  } finally {
    await rm(pasta, { recursive: true, force: true })
  }
  return true
}

for (;;) {
  try {
    while (await umTrabalho()) { /* esvaziar a fila, um de cada vez */ }
  } catch (e) {
    log('erro', e.message)
  }
  await dormir(INTERVALO)
}
