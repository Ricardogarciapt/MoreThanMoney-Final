// Monta o vídeo de apresentação: cenas.html desenhada frame a frame (Playwright) + narração.
// Uso: node video/apresentacao/render.mjs pt|en|es|de|it|nl|pl [--preview] [--so=s05-scanners] [--sem-legendas]
// O b-roll vem de broll/ (ligação para MTM-Assets/stock/fotogramas) e a música, se existir, de musica.mp3.
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
  if (c.semVoz) { // abertura só com imagem e música
    const cena = { id: c.id, ini: t, dur: c.semVoz, fala: 0, frases: [], audio: null }
    t += cena.dur
    return cena
  }
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
if (!TL.some(c => c.audio)) temVoz = false
console.log(`[${lang}] ${TL.length} cenas, ${total.toFixed(1)} s${temVoz ? '' : ' (durações estimadas, sem voz)'}`)

// áudio: cada fala no seu início, num só ficheiro
const out = path.join(DIR, 'saida')
fs.mkdirSync(out, { recursive: true })
const audio = path.join(out, `voz-${lang}${so ? '-' + so : ''}.wav`)
if (temVoz) {
  const ins = [], filt = []
  const falas = TL.filter(c => c.audio)
  falas.forEach((c, i) => { ins.push('-i', c.audio); filt.push(`[${i}:a]aresample=48000,adelay=${Math.round(c.ini * 1000)}:all=1[a${i}]`) })
  const musica = path.join(DIR, 'musica.mp3'), temMusica = fs.existsSync(musica) && !so
  filt.push(`${falas.map((_, i) => `[a${i}]`).join('')}amix=inputs=${falas.length}:normalize=0,apad=whole_dur=${total.toFixed(2)},loudnorm=I=-16:TP=-1.5,aresample=48000${temMusica ? ',asplit[voz][chave]' : '[out]'}`)
  if (temMusica) {
    // Música com energia: cheia na abertura e nas pausas, baixa sozinha por baixo da voz (ducking pela própria voz).
    // Nível de base ~-20 LUFS; com voz desce cerca de 10 dB, para a fala ficar sempre à frente.
    ins.push('-i', musica)
    filt.push(`[${falas.length}:a]aresample=48000,atrim=0:${total.toFixed(2)},loudnorm=I=-16,aresample=48000,volume=0.6,afade=t=in:d=0.3,afade=t=out:st=${(total - 4).toFixed(2)}:d=4[m]`,
      `[m][chave]sidechaincompress=threshold=0.015:ratio=10:attack=15:release=450:makeup=1[md]`,
      `[voz][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89[out]`)
  }
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...ins, '-filter_complex', filt.join(';'), '-map', '[out]', '-ac', '2', audio])
}

const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' })) // sem o Chromium do Playwright, usa o Chrome instalado
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.goto('file://' + path.join(DIR, `cenas.html?lang=${lang}`))
const N = {}
for (const d of fs.existsSync(path.join(DIR, 'broll')) ? fs.readdirSync(path.join(DIR, 'broll')) : []) N[d] = fs.readdirSync(path.join(DIR, 'broll', d)).filter(f => f.endsWith('.jpg')).length
await page.evaluate(([tl, leg, n]) => window.iniciar(tl, leg, n), [TL, legendas, N])
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(500)

const mp4 = path.join(out, `apresentacao-${lang}${preview ? '-preview' : ''}${so ? '-' + so : ''}.mp4`)
const args = ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-']
if (temVoz) args.push('-i', audio)
args.push('-c:v', 'libx264', '-preset', preview ? 'veryfast' : 'slow', '-crf', preview ? '30' : '25', '-pix_fmt', 'yuv420p', '-r', String(FPS))
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

// Legendas em WebVTT, para o <track> da página e para as CC do YouTube.
const hms = s => new Date(s * 1000).toISOString().slice(11, 23)
fs.writeFileSync(path.join(out, `apresentacao-${lang}.vtt`), 'WEBVTT\n\n' + TL.flatMap(c => c.frases).map((f, i) => `${i + 1}\n${hms(f.ini)} --> ${hms(f.fim)}\n${f.t}\n`).join('\n'))

// O vídeo de vendas vai à velocidade normal (1,0×): a 1,12× o Ricardo achou-o rápido (25/10, 20:16).
if (temVoz && !preview && !so) {
  const final = path.join(out, `apresentacao-${lang}-final.mp4`)
  fs.copyFileSync(mp4, final)
  const fecho = TL.find(c => c.id === 's14-fecho')
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(fecho.ini + 1.6), '-i', final, '-frames:v', '1', '-vf', 'scale=1280:-1', '-q:v', '3', path.join(out, `poster-${lang}.jpg`)])
  console.log('feito:', final)
} else console.log('feito:', mp4)
