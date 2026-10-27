// Desenha os stories MTM (9:16, 30 fps) com narração Fish e banda sonora própria.
// Uso: node video/stories-mtm/render.mjs <peca|todas> <pt|en|de|todas> [--preview] [--saida=dir]
// Cada cena dura o tempo da sua fala (voz/<peca>/<lang>/<id>.mp3) + respiro. Sem mp3, estima pela
// contagem de caracteres (só serve para pré-visualizar).
import { createRequire } from 'node:module'
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const DIR = path.dirname(fileURLToPath(import.meta.url))
const G = JSON.parse(fs.readFileSync(path.join(DIR, 'guiao.json'), 'utf8'))
const T = JSON.parse(fs.readFileSync(path.join(DIR, 'textos.json'), 'utf8'))
const [, , pecaArg = 'todas', langArg = 'todas'] = process.argv
const PREVIEW = process.argv.includes('--preview')
const SAIDA = (process.argv.find((a) => a.startsWith('--saida=')) || '').split('=')[1] || path.join(DIR, 'saida')
const pecas = pecaArg === 'todas' ? Object.keys(G.pecas) : [pecaArg]
const langs = langArg === 'todas' ? Object.keys(G.vozes) : [langArg]
const ENTRA = 0.3, RESPIRO = 0.45, FECHO = 2.6
fs.mkdirSync(SAIDA, { recursive: true })

const durMp3 = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())

function linhaDoTempo(peca, lang) {
  const D = {}, falas = []
  let s = 0
  const cenas = G.pecas[peca]
  cenas.forEach((c, i) => {
    const mp3 = path.join(DIR, 'voz', peca, lang, `${c.id}.mp3`)
    const tem = fs.existsSync(mp3)
    const dur = tem ? durMp3(mp3) : c[lang].length / 14
    const len = Math.max(2.4, ENTRA + dur + RESPIRO) + (i === cenas.length - 1 ? FECHO : 0)
    D[c.id] = [s, s + len]
    if (tem) falas.push([mp3, s + ENTRA])
    s += len
  })
  return { D, falas, total: s }
}

const browser = await chromium.launch()
for (const peca of pecas) for (const lang of langs) {
  const { D, falas, total } = linhaDoTempo(peca, lang)
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } })
  await page.goto('file://' + path.join(DIR, 'stories.html'))
  await page.evaluate(([p, tx, d]) => window.iniciar(p, tx, d), [peca, T[peca][lang], D])
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  const nome = `${peca}-${lang}`
  if (PREVIEW) {
    const dir = path.join(SAIDA, 'preview'); fs.mkdirSync(dir, { recursive: true })
    let i = 0
    for (const [a, o] of Object.values(D)) {
      await page.evaluate((x) => window.renderAt(x), Math.min(o - .4, a + (o - a) * .72))
      await page.screenshot({ path: path.join(dir, `${nome}-${String(i++).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 70 })
    }
    console.log('preview', nome, total.toFixed(1), 's')
    await page.close(); continue
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'story-'))
  const ids = Object.keys(D)
  const sec = { drop: D[ids[0]][1], pausa: D[ids[ids.length - 2]][0], final: D[ids[ids.length - 1]][0] }
  const musica = path.join(tmp, 'musica.wav')
  execFileSync('python3', [path.join(DIR, 'musica.py'), musica, String(total), JSON.stringify(sec)])
  // Voz: cada fala no seu sítio; a música baixa por baixo da voz (sidechain).
  const voz = path.join(tmp, 'voz.wav')
  if (falas.length) {
    const ins = falas.flatMap(([f]) => ['-i', f])
    const fil = falas.map(([, t0], i) => `[${i}]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(t0 * 1000)}:all=1[v${i}]`).join(';') +
      `;${falas.map((_, i) => `[v${i}]`).join('')}amix=inputs=${falas.length}:normalize=0,apad=whole_dur=${total.toFixed(2)},atrim=0:${total.toFixed(2)}[v]`
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...ins, '-filter_complex', fil, '-map', '[v]', voz])
  }
  const audio = path.join(tmp, 'audio.wav')
  if (falas.length) {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', musica, '-i', voz, '-filter_complex',
      '[1]asplit[vs][vm];[0]volume=0.55[m];[m][vs]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[md];[vm]volume=1.6,acompressor=threshold=0.1:ratio=3[vv];[md][vv]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]',
      '-map', '[a]', audio])
  } else fs.copyFileSync(musica, audio)

  const mp4 = path.join(SAIDA, `${nome}.mp4`)
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-i', audio,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(2), '-movflags', '+faststart', mp4], { stdio: ['pipe', 'inherit', 'inherit'] })
  const n = Math.ceil(total * 30)
  for (let i = 0; i < n; i++) {
    await page.evaluate((x) => window.renderAt(x), i / 30)
    const buf = await page.screenshot({ type: 'jpeg', quality: 90 })
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
  }
  ff.stdin.end()
  const code = await new Promise((r) => ff.on('close', r))
  if (code !== 0) throw new Error(`ffmpeg saiu com ${code}`)
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(D[ids[0]][1] - .5), '-i', mp4, '-frames:v', '1', '-q:v', '3', path.join(SAIDA, `${nome}-capa.jpg`)])
  fs.rmSync(tmp, { recursive: true, force: true })
  await page.close()
  console.log('ok', mp4, total.toFixed(1), 's', falas.length ? `${falas.length} falas` : 'SEM VOZ')
}
await browser.close()
