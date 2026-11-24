#!/usr/bin/env node
// Gera a narração frase a frase (voz clone do Ricardo, Fish) e os tempos exatos de cada frase.
// Uso: node gerar-frases.mjs <script-narracao.txt> <pasta-saida>
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const [, , ficheiroTxt, saida] = process.argv
const VOZ = '1e0fa8b490c744acba94da72710e6db2'
const MODELO = process.env.FISH_MODEL || 'speech-1.6'
const KEY = (process.env.FISH_API_KEY || '').trim()
const PAUSA = 0.35
const PRON = [[/\bMT5\b/g, 'ême-tê-cinco'], [/\bMTM\b/g, 'ême-tê-ême'], [/\bPU Prime\b/g, 'pê-u práime'], [/\bXAU\/USD\b/g, 'ouro dólar'], [/\bEUR\/USD\b/g, 'euro dólar'], [/\bUSD\/JPY\b/g, 'dólar iene']]
const pt = (t) => PRON.reduce((s, [re, p]) => s.replace(re, p), t).replace(/(\d+),(\d+)/g, '$1 vírgula $2')

const texto = fs.readFileSync(ficheiroTxt, 'utf8').replace(/\s+/g, ' ').trim()
const frases = texto.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g).map((f) => f.trim()).filter(Boolean)
fs.mkdirSync(saida, { recursive: true })

async function sintetizar(t, f) {
  const corpo = JSON.stringify({ text: pt(t), reference_id: VOZ, format: 'wav', normalize: true, latency: 'normal' })
  for (let i = 1; i <= 3; i++) {
    try {
      const args = ['-s', '-f', '-X', 'POST', 'https://api.fish.audio/v1/tts', '-H', 'Content-Type: application/json', '-H', `model: ${MODELO}`, '--max-time', '120', '-d', corpo, '-o', f]
      if (KEY) args.push('-H', `Authorization: Bearer ${KEY}`)
      execFileSync('curl', args)
      if (fs.statSync(f).size > 200) return
    } catch (e) { /* tenta de novo */ }
    await new Promise((res) => setTimeout(res, 2000 * i))
  }
  throw new Error('falhou: ' + t.slice(0, 60))
}
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())

const silencio = path.join(saida, 'pausa.wav')
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(PAUSA), silencio])
const tempos = []; let t0 = 0; const lista = []
for (let i = 0; i < frases.length; i++) {
  const f = path.join(saida, `f${String(i + 1).padStart(3, '0')}.wav`)
  if (!fs.existsSync(f)) await sintetizar(frases[i], f)
  const d = dur(f)
  tempos.push({ i, texto: frases[i], inicio: +t0.toFixed(3), fim: +(t0 + d).toFixed(3) })
  lista.push(`file '${f}'`, `file '${silencio}'`)
  t0 += d + PAUSA
}
fs.writeFileSync(path.join(saida, 'lista.txt'), lista.join('\n'))
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(saida, 'lista.txt'), '-c:a', 'pcm_s16le', path.join(saida, 'narracao-frases.wav')])
fs.writeFileSync(path.join(saida, 'tempos.json'), JSON.stringify({ total: +t0.toFixed(3), frases: tempos }, null, 2))
console.log('frases', frases.length, 'total', t0.toFixed(2), 's')
