// Monta um vídeo de bootcamp: cenas.html desenhada frame a frame (Playwright) + narração na voz do Ricardo.
// Uso: node video/bootcamp/render.mjs <estrategia> <video> <pt|en> [--preview] [--de=SEG --ate=SEG] [--legendas]
//   ex.: node video/bootcamp/render.mjs defy 1 pt
// Guião: guioes/<estrategia>.<lang>.json · Voz: voz/<estrategia>/v<n>/<lang>/<cena>.mp3 (gerada por voz.mjs)
// Sem voz usa durações estimadas e sai sem áudio (para rever o ritmo). As legendas saem em .vtt para as CC do YouTube.
import { createRequire } from 'node:module'
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const DIR = path.dirname(fileURLToPath(import.meta.url))
const [est, nv, lang = 'pt'] = process.argv.slice(2)
const arg = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1]
const preview = process.argv.includes('--preview')
const FPS = preview ? 8 : 25
const ABRE = 0.5, RESPIRO = 0.7
// Velocidade da narração: o Ricardo pediu +10% (06/11). --vel=1 volta ao normal.
const VEL = Number(arg('vel') || 1.1)

const G = JSON.parse(fs.readFileSync(path.join(DIR, 'guioes', `${est}.${lang}.json`), 'utf8'))
const V = G.videos[Number(nv) - 1]
if (!V) throw new Error(`sem vídeo ${nv} em ${est}`)
const vozDir = path.join(DIR, 'voz', est, `v${nv}`, lang)
const duracao = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())

let t = ABRE, temVoz = true
const TL = V.cenas.map(c => {
  const f = path.join(vozDir, `${c.id}.mp3`)
  if (!c.fala) { const cena = { id: c.id, ini: t, dur: c.semVoz || 4, fala: 0, frases: [], audio: null }; t += cena.dur; return cena }
  let fala
  if (fs.existsSync(f)) fala = duracao(f) / VEL
  else { temVoz = false; fala = c.fala.split(/\s+/).length / 2.5 }
  const frases = c.fala.match(/[^.!?]+[.!?]*/g).map(s => s.trim()).filter(Boolean)
  const tot = frases.reduce((a, s) => a + s.length, 0)
  let fi = t
  const fr = frases.map(s => { const d = fala * s.length / tot; const o = { t: s, ini: fi, fim: fi + d }; fi += d; return o })
  const cena = { id: c.id, ini: t, dur: fala + (c.respiro ?? RESPIRO), fala, frases: fr, audio: fs.existsSync(f) ? f : null }
  t += cena.dur
  return cena
})
const total = t + 1
console.log(`[${est} v${nv} ${lang}] ${TL.length} cenas, ${(total / 60).toFixed(1)} min${temVoz ? '' : ' (durações estimadas, sem voz)'}`)

const out = path.join(DIR, 'saida', est)
fs.mkdirSync(out, { recursive: true })
const base = `bootcamp-${est}-${nv}-${lang}`
const audio = path.join(out, `${base}.wav`)
const falas = TL.filter(c => c.audio)
if (falas.length) {
  // concatena em blocos para não abrir centenas de entradas no mesmo ffmpeg
  const ins = [], filt = []
  falas.forEach((c, i) => { ins.push('-i', c.audio); filt.push(`[${i}:a]aresample=48000,atempo=${VEL},adelay=${Math.round(c.ini * 1000)}:all=1[a${i}]`) })
  const musica = path.join(DIR, 'musica.mp3'), temMusica = fs.existsSync(musica)
  filt.push(`${falas.map((_, i) => `[a${i}]`).join('')}amix=inputs=${falas.length}:normalize=0,apad=whole_dur=${total.toFixed(2)},loudnorm=I=-16:TP=-1.5,aresample=48000${temMusica ? ',asplit[voz][chave]' : '[out]'}`)
  if (temMusica) {
    ins.push('-stream_loop', '-1', '-i', musica)
    filt.push(`[${falas.length}:a]aresample=48000,atrim=0:${total.toFixed(2)},loudnorm=I=-30,aresample=48000,afade=t=in:d=1,afade=t=out:st=${(total - 4).toFixed(2)}:d=4[m]`,
      `[m][chave]sidechaincompress=threshold=0.015:ratio=8:attack=20:release=500[md]`,
      `[voz][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89[out]`)
  }
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...ins, '-filter_complex', filt.join(';'), '-map', '[out]', '-ac', '2', audio])
}

const de = Number(arg('de') || 0), ate = Number(arg('ate') || total)
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }))
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto('file://' + path.join(DIR, 'cenas.html'))
const cenas = Object.fromEntries(V.cenas.map(c => [c.id, c]))
await page.evaluate(([tl, leg, dados, tot]) => { window.TOTAL = tot; window.iniciar(tl, leg, dados) },
  [TL, process.argv.includes('--legendas'), { cenas, ui: G.ui, cores: G.cores, marca: `${G.marca} · ${V.rotulo}`, nome: G.estrategia, plano: G.plano, est, lang }, total])
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(400)

const mp4 = path.join(out, `${base}${preview ? '-preview' : ''}.mp4`)
const args = ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-']
if (falas.length) args.push('-ss', String(de), '-i', audio)
args.push('-c:v', 'libx264', '-preset', preview ? 'veryfast' : 'medium', '-crf', preview ? '30' : '22', '-pix_fmt', 'yuv420p', '-r', String(FPS))
if (falas.length) args.push('-c:a', 'aac', '-b:a', '160k', '-shortest')
args.push('-movflags', '+faststart', mp4)
const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] })
const n0 = Math.floor(de * FPS), n1 = Math.ceil(Math.min(ate, total) * FPS)
for (let i = n0; i < n1; i++) {
  await page.evaluate(x => window.renderAt(x), i / FPS)
  const buf = await page.screenshot({ type: 'jpeg', quality: 90 })
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
  if (i % (FPS * 30) === 0) process.stdout.write(`  ${(i / FPS / 60).toFixed(1)}/${(total / 60).toFixed(1)} min\n`)
}
ff.stdin.end()
await new Promise(r => ff.on('close', r))
await browser.close()

const hms = s => new Date(s * 1000).toISOString().slice(11, 23)
fs.writeFileSync(path.join(out, `${base}.vtt`), 'WEBVTT\n\n' + TL.flatMap(c => c.frases).map((f, i) => `${i + 1}\n${hms(f.ini)} --> ${hms(f.fim)}\n${f.t}\n`).join('\n'))
// capítulos para a descrição do YouTube (cada cena de tipo «capitulo» abre um)
const caps = TL.filter(c => cenas[c.id].tipo === 'capitulo' || cenas[c.id].tipo === 'abertura')
fs.writeFileSync(path.join(out, `${base}-capitulos.txt`), caps.map((c, i) => `${new Date((i ? c.ini : 0) * 1000).toISOString().slice(i ? 14 : 14, 19)} ${cenas[c.id].titulo.replace(/<[^>]+>/g, '')}`).join('\n') + '\n')
console.log('feito:', mp4)
