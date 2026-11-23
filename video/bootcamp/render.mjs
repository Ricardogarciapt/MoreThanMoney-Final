// Monta um vídeo de bootcamp: cenas.html desenhada frame a frame (Playwright) + narração na voz do Ricardo.
// Uso: node video/bootcamp/render.mjs <estrategia> <video> <pt|en> [--preview] [--de=SEG --ate=SEG] [--legendas] [--gemeo[=look]]
//   --gemeo: depois do render, o gémeo do Ricardo narra a aula num círculo com aro dourado (passo «gemeo» do
//   motor único: lip sync HeyGen sobre esta mesma narração). Sai <base>-gemeo.mp4 ao lado. ~7 créditos/min.
//   --gemeo-estimar: só mostra quantos créditos gastaria, sem gastar.
//   ex.: node video/bootcamp/render.mjs defy 1 pt
// Guião: guioes/<estrategia>.<lang>.json · Voz: voz/<estrategia>/v<n>/<lang>/<cena>.mp3 (gerada por voz.mjs)
// Sem voz usa durações estimadas e sai sem áudio (para rever o ritmo). As legendas saem em .vtt para as CC do YouTube.
import { createRequire } from 'node:module'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as motorVideo from '../motor/motor.mjs'
import { gerarEntrada } from './entrada.mjs'

const { chromium } = createRequire(import.meta.url)('playwright')
const DIR = path.dirname(fileURLToPath(import.meta.url))
const [est, nv, lang = 'pt'] = process.argv.slice(2)
const arg = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1]
const preview = process.argv.includes('--preview')
const FPS = preview ? 8 : motorVideo.FPS
const ABRE = 0.5, RESPIRO = 0.7
// Velocidade da narração: +10% pedido a 06/11 15:26, depois -7% a 20:08 → 1.03. --vel=1 volta ao normal.

const G = JSON.parse(fs.readFileSync(path.join(DIR, 'guioes', `${est}.${lang}.json`), 'utf8'))
const V = G.videos[Number(nv) - 1]
// o guião pode fixar a sua velocidade (tutoriais 1,12×: bootcamp do WebTrader); --vel manda sempre
const VEL = Number(arg('vel') || G.vel || 1.03)
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
// entrada musical (guião com "entrada": true): sting sintetizado nos primeiros ~9 s, com ou sem voz
const entrada = G.entrada && !process.argv.includes('--sem-entrada') ? gerarEntrada(path.join(out, 'entrada.wav')) : null
const temAudio = falas.length > 0 || !!entrada
if (!falas.length && entrada) {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', entrada, '-filter_complex',
    `[0:a]aresample=48000,volume=-6dB,apad=whole_dur=${total.toFixed(2)}[out]`, '-map', '[out]', '-ac', '2', audio])
}
if (falas.length) {
  // concatena em blocos para não abrir centenas de entradas no mesmo ffmpeg
  const ins = [], filt = []
  falas.forEach((c, i) => { ins.push('-i', c.audio); filt.push(`[${i}:a]aresample=48000,atempo=${VEL},adelay=${Math.round(c.ini * 1000)}:all=1[a${i}]`) })
  const musica = path.join(DIR, 'musica.mp3'), temMusica = fs.existsSync(musica)
  filt.push(`${falas.map((_, i) => `[a${i}]`).join('')}amix=inputs=${falas.length}:normalize=0,apad=whole_dur=${total.toFixed(2)},${motorVideo.LOUDNORM},aresample=48000${temMusica ? ',asplit[voz][chave]' : '[out]'}`)
  if (temMusica) {
    ins.push('-stream_loop', '-1', '-i', musica)
    filt.push(`[${falas.length}:a]aresample=48000,atrim=0:${total.toFixed(2)},loudnorm=I=-30,aresample=48000,afade=t=in:d=1,afade=t=out:st=${(total - 4).toFixed(2)}:d=4[m]`,
      `[m][chave]sidechaincompress=threshold=0.015:ratio=8:attack=20:release=500[md]`,
      `[voz][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89[out]`)
  }
  if (entrada) {
    // a entrada fica por cima da mistura final: soa sozinha antes da 1.ª fala e baixa por baixo da voz
    const ult = filt.pop().replace(/\[out\]$/, '[pre]')
    filt.push(ult)
    ins.push('-i', entrada)
    const k = ins.filter(x => x === '-i').length - 1
    filt.push(`[${k}:a]aresample=48000,volume=-8dB,apad=whole_dur=${total.toFixed(2)}[ent]`, `[pre][ent]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89[out]`)
  }
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...ins, '-filter_complex', filt.join(';'), '-map', '[out]', '-ac', '2', audio])
}

const de = Number(arg('de') || 0), ate = Number(arg('ate') || total)
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }))
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto('file://' + path.join(DIR, 'cenas.html'))
// gráfico fiel ao Pine da estratégia, quando existe (video/bootcamp/<motor>.js)
const motorJs = path.join(DIR, `${G.motor || est}.js`)
// animações por tema (ex.: primeira-chave-temas.js), carregadas antes do motor
const temasJs = path.join(DIR, `${G.motor || est}-temas.js`)
if (fs.existsSync(temasJs)) await page.addScriptTag({ path: temasJs })
if (fs.existsSync(motorJs)) await page.addScriptTag({ path: motorJs })
const cenas = Object.fromEntries(V.cenas.map(c => [c.id, c]))
await page.evaluate(([tl, leg, dados, tot]) => { window.TOTAL = tot; window.iniciar(tl, leg, dados) },
  [TL, process.argv.includes('--legendas'), { cenas, ui: G.ui, cores: G.cores, marca: `${G.marca} · ${V.rotulo}`, nome: G.estrategia, plano: G.plano, est, motor: G.motor || est, lang }, total])
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(400)

const mp4 = path.join(out, `${base}${preview ? '-preview' : ''}.mp4`)
const args = ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-']
if (temAudio) args.push('-ss', String(de), '-i', audio)
args.push('-r', String(FPS), ...motorVideo.codificar(preview ? 'rascunho' : 'final', { semAudio: !temAudio }))
if (temAudio) args.push('-shortest')
args.push(mp4)
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

// Aulas de cursos narradas pelo gémeo (pedido do Ricardo 20/11): o passo vive no motor único, não aqui.
const gemeoArg = process.argv.find(a => a === '--gemeo' || a.startsWith('--gemeo=') || a === '--gemeo-estimar')
if (gemeoArg && !preview && falas.length) {
  const look = gemeoArg.startsWith('--gemeo=') ? gemeoArg.split('=')[1] : 'mentor'
  const destino = mp4.replace(/\.mp4$/, '-gemeo.mp4')
  const args = [path.join(DIR, '..', 'motor', 'motor.mjs'), 'gemeo', mp4, destino, '--formato=youtube', `--marca=${G.marcaVideo || 'morethanmoney'}`, `--look=${look}`]
  if (gemeoArg === '--gemeo-estimar') args.push('--estimar')
  const r = spawnSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  process.stdout.write(r.stdout || '')
  if (r.status !== 0) { console.error('gémeo falhou (o vídeo sem gémeo ficou feito):', mp4); process.exitCode = 3 }
}
