#!/usr/bin/env node
/**
 * Academia de Vendas MTM — render de uma aula (16:9, 30 fps, -14 LUFS pelo motor único).
 *
 *   node --experimental-strip-types video/formacao/render.mjs <numero> <pt|en> <narracao.wav> [saida.mp4]
 *
 * A narração é a voz clone do Ricardo (HeyGen «Ricardo Garcia PT-PT (Fish)», uma chamada por aula com o
 * texto de `narracao(aula, lingua)` de `lib/backoffice-formacao.ts`). As cenas dividem o áudio na
 * proporção do texto de cada fala e o corte encosta ao silêncio mais próximo (silencedetect), para a
 * imagem mudar quando a voz respira e não a meio de uma palavra.
 *
 * Cada cena é uma página (cenas.mjs) que o Playwright fotografa a 15 fps com as animações pausadas e
 * avançadas à mão; o ffmpeg duplica para 30 fps e o `finalizar` do motor põe o volume e o codec da casa.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { htmlCena } from './cenas.mjs'
import { finalizar, verificar, medirLufs } from '../motor/motor.mjs'

const require = createRequire(import.meta.url)
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const FPS_CAPTURA = 15

const [numero, L, audio, saidaArg] = process.argv.slice(2)
if (!numero || !['pt', 'en'].includes(L) || !audio) {
  console.error('uso: render.mjs <numero> <pt|en> <narracao.wav> [saida.mp4]')
  process.exit(1)
}
const { AULAS } = await import(path.join(RAIZ, 'lib/backoffice-formacao.ts'))
const aula = AULAS.find((a) => a.numero === Number(numero))
if (!aula) throw new Error(`aula ${numero} não existe`)

const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audio]).toString())

// silêncios da narração (fim de cada pausa = bom sítio para cortar)
let silencios = []
try {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', audio, '-af', 'silencedetect=noise=-32dB:d=0.28', '-f', 'null', '-'], { encoding: 'utf8' })
  const ini = [...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1])
  const fim = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1])
  silencios = ini.map((s, i) => ({ s, e: fim[i] ?? s })).filter((x) => x.e > x.s)
} catch {}

// cortes proporcionais ao texto, encostados ao meio do silêncio mais próximo (±2,5 s)
const pesos = aula.cenas.map((c) => c.fala[L].length + 40)
const soma = pesos.reduce((a, b) => a + b, 0)
const cortes = [0]
let acc = 0
for (let i = 0; i < pesos.length - 1; i++) {
  acc += pesos[i]
  const alvo = (acc / soma) * dur
  let melhor = null
  for (const s of silencios) {
    const meio = (s.s + s.e) / 2
    if (Math.abs(meio - alvo) <= 2.5 && meio > cortes[cortes.length - 1] + 1.5 && (!melhor || Math.abs(meio - alvo) < Math.abs(melhor - alvo))) melhor = meio
  }
  cortes.push(melhor ?? alvo)
}
const FIM_EXTRA = 1.2 // respiro no fim, com o último ecrã parado
cortes.push(dur + FIM_EXTRA)
const duracoes = cortes.slice(1).map((c, i) => c - cortes[i])

const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', `formacao-${numero}-${L}-`))
const { chromium } = require('playwright')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

const segmentos = []
for (let i = 0; i < aula.cenas.length; i++) {
  const d = duracoes[i]
  const html = htmlCena({ cena: aula.cenas[i], aula, total: aula.cenas.length, indice: i, L, dur: d, raiz: RAIZ })
  const fhtml = path.join(tmp, `c${i}.html`)
  fs.writeFileSync(fhtml, html)
  await page.goto(`file://${fhtml}`)
  await page.evaluate(() => document.fonts.ready)
  const pasta = path.join(tmp, `f${i}`)
  fs.mkdirSync(pasta)
  const n = Math.max(1, Math.round(d * FPS_CAPTURA))
  for (let k = 0; k < n; k++) {
    const t = k / FPS_CAPTURA
    await page.evaluate((tt) => {
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = tt * 1000 }
      window.__tempo && window.__tempo(tt)
    }, t)
    await page.screenshot({ path: path.join(pasta, `${String(k).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 })
  }
  const seg = path.join(tmp, `s${i}.mp4`)
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS_CAPTURA), '-i', path.join(pasta, '%05d.jpg'),
    '-vf', `fps=30,format=yuv420p`, '-t', d.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', seg])
  segmentos.push(seg)
  fs.rmSync(pasta, { recursive: true })
  console.log(`cena ${i + 1}/${aula.cenas.length} (${aula.cenas[i].tipo}) ${d.toFixed(1)} s`)
}
await browser.close()

// junta as cenas com um fundido curto e mete a narração (com o respiro final em silêncio)
const lista = path.join(tmp, 'lista.txt')
fs.writeFileSync(lista, segmentos.map((s) => `file '${s}'`).join('\n'))
const cru = path.join(tmp, 'cru.mp4')
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-i', audio,
  '-filter_complex', `[1:a]apad=pad_dur=${FIM_EXTRA}[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', cru])

// o loudnorm de uma passagem fica curto em fala com pausas: leva-se primeiro o cru a -14 com ganho medido
const lufsCru = medirLufs(cru)
const cru2 = path.join(tmp, 'cru2.mp4')
const ganho = lufsCru === null ? 0 : Math.max(-6, Math.min(12, -14 - lufsCru))
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', cru, '-af', `volume=${ganho.toFixed(2)}dB,alimiter=limit=0.89`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', cru2])

const saida = saidaArg || path.join(RAIZ, `out/formacao/${aula.slug}-${L}.mp4`)
await finalizar(cru2, saida, { formato: 'youtube', nice: 0 })
const v = verificar(saida, 'youtube')
console.log(JSON.stringify({ saida, duracao: v.duracao, lufs: v.lufs, ok: v.ok, problemas: v.problemas }))
fs.rmSync(tmp, { recursive: true, force: true })
