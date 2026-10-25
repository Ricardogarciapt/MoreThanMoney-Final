// Monta o vídeo de apresentação: cenas.html desenhada frame a frame (Playwright) + narração.
// Uso: node video/apresentacao/render.mjs pt|en [--preview] [--so=s05-scanners] [--sem-legendas]
// Sem a narração em voz/<lang>/, usa durações estimadas e sai sem áudio (para rever o ritmo).
import { createRequire } from 'node:module'
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const DIR = path.dirname(fileURLToPath(import.meta.url))
const lang = process.argv[2] || 'pt'
const preview = process.argv.includes('--preview')
const so = (process.argv.find(a => a.startsWith('--so=')) || '').slice(5)
const legendas = !process.argv.includes('--sem-legendas')
const FPS = preview ? 12 : 30
const W = 1920, H = 1080
const ABRE = 0.6, RESPIRO = 1.1 // segundos antes da 1.ª fala e entre cenas

const guiao = JSON.parse(fs.readFileSync(path.join(DIR, 'guiao.json'), 'utf8')).cenas
const vozDir = path.join(DIR, 'voz', lang)
const duracao = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())

// linha do tempo a partir das durações reais da voz (ou estimadas)
let t = ABRE, temVoz = true
const TL = guiao.filter(c => !so || c.id === so).map(c => {
  const f = path.join(vozDir, `${c.id}.mp3`)
  let fala
  if (fs.existsSync(f)) fala = duracao(f)
  else { temVoz = false; fala = c[lang].split(/\s+/).length / 2.8 }
  const frases = c[lang].match(/[^.!?]+[.!?]*/g).map(s => s.trim()).filter(Boolean)
  const tot = frases.reduce((a, s) => a + s.length, 0)
  let fi = t
  const fr = frases.map(s => { const d = fala * s.length / tot; const o = { t: s, ini: fi, fim: fi + d }; fi += d; return o })
  const cena = { id: c.id, ini: t, dur: fala + (c.id === 's14-fecho' ? 3.5 : RESPIRO), fala, frases: fr, audio: f }
  t += cena.dur
  return cena
})
const total = t + 1.2
console.log(`[${lang}] ${TL.length} cenas, ${total.toFixed(1)} s${temVoz ? '' : ' (durações estimadas, sem voz)'}`)

// áudio: cada fala no seu início, num só ficheiro
const out = path.join(DIR, 'saida')
fs.mkdirSync(out, { recursive: true })
const audio = path.join(out, `voz-${lang}${so ? '-' + so : ''}.wav`)
if (temVoz) {
  const ins = [], filt = []
  TL.forEach((c, i) => { ins.push('-i', c.audio); filt.push(`[${i}:a]aresample=48000,adelay=${Math.round(c.ini * 1000)}:all=1[a${i}]`) })
  filt.push(`${TL.map((_, i) => `[a${i}]`).join('')}amix=inputs=${TL.length}:normalize=0,apad=whole_dur=${total.toFixed(2)},loudnorm=I=-16:TP=-1.5[out]`)
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...ins, '-filter_complex', filt.join(';'), '-map', '[out]', '-ac', '2', audio])
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.goto('file://' + path.join(DIR, `cenas.html?lang=${lang}`))
await page.evaluate(([tl, leg]) => window.iniciar(tl, leg), [TL, legendas])
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(500)

const mp4 = path.join(out, `apresentacao-${lang}${preview ? '-preview' : ''}${so ? '-' + so : ''}.mp4`)
const args = ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-']
if (temVoz) args.push('-i', audio)
args.push('-c:v', 'libx264', '-preset', preview ? 'veryfast' : 'slow', '-crf', preview ? '30' : '23', '-pix_fmt', 'yuv420p', '-r', String(FPS))
if (temVoz) args.push('-c:a', 'aac', '-b:a', '160k', '-shortest')
args.push('-movflags', '+faststart', mp4)
const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] })

const n = Math.ceil(total * FPS)
for (let i = 0; i < n; i++) {
  await page.evaluate(x => window.renderAt(x), i / FPS)
  const buf = await page.screenshot({ type: 'jpeg', quality: 92 })
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
  if (i % (FPS * 10) === 0) process.stdout.write(`  ${(i / FPS).toFixed(0)}s/${total.toFixed(0)}s\n`)
}
ff.stdin.end()
await new Promise(r => ff.on('close', r))
await browser.close()
fs.writeFileSync(path.join(out, `linha-${lang}.json`), JSON.stringify(TL.map(({ audio, ...c }) => c), null, 1))

// O vídeo de vendas vai à velocidade normal: a 1,12× o Ricardo achou-o rápido (25/10, 20:16).
// Os tutoriais curtos continuam a 1,12× (ver memória videos-voz-velocidade).
const VELOCIDADE = 1
if (temVoz && !preview) {
  const final = path.join(out, `apresentacao-${lang}-final.mp4`)
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', mp4, '-filter_complex', `[0:v]setpts=PTS/${VELOCIDADE}[v];[0:a]atempo=${VELOCIDADE}[a]`,
    '-map', '[v]', '-map', '[a]', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', final])
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String((TL[TL.length - 1].ini + 2) / VELOCIDADE), '-i', final, '-frames:v', '1', '-vf', 'scale=1280:-1', '-q:v', '3', path.join(out, `poster-${lang}.jpg`)])
  console.log('feito:', final)
} else console.log('feito:', mp4)
