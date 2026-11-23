// Entrada musical («sting») dos vídeos de curso: ~9 s sintetizados aqui mesmo, sem samples nem direitos de terceiros.
// Boom grave + acorde quente (Lá menor 9 → Fá maior 7) + sinos dourados em arpejo + fecho suave.
// Uso: import { gerarEntrada } from './entrada.mjs'; gerarEntrada(destino.wav) — gera uma vez e reaproveita.
// Sozinho: node video/bootcamp/entrada.mjs /tmp/entrada.wav
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 48000, DUR = 9
const f = n => 440 * Math.pow(2, (n - 69) / 12) // MIDI → Hz

export function gerarEntrada(destino) {
  if (fs.existsSync(destino)) return destino
  const N = SR * DUR, L = new Float32Array(N), R = new Float32Array(N)
  const soma = (i, v, pan = 0) => { L[i] += v * (1 - pan) * 0.5 * 2; R[i] += v * (1 + pan) * 0.5 * 2 }

  // 1) boom grave com queda de altura (impacto de abertura)
  let fase = 0
  for (let i = 0; i < SR * 2.5; i++) {
    const t = i / SR, hz = 42 + 48 * Math.exp(-t * 6)
    fase += 2 * Math.PI * hz / SR
    const env = Math.min(1, t / 0.008) * Math.exp(-t * 1.6)
    soma(i, 0.55 * env * Math.sin(fase))
  }

  // 2) acordes de fundo (pad): três vozes ligeiramente desafinadas por nota, ataque lento
  const acordes = [
    { ini: 0.15, fim: 4.6, notas: [45, 52, 57, 60, 67, 71] }, // Lá m9
    { ini: 4.2, fim: DUR, notas: [41, 48, 57, 64, 69, 72] },  // Fá maj7 (resolve)
  ]
  for (const a of acordes) {
    a.notas.forEach((n, k) => {
      const pan = ((k % 2) ? 1 : -1) * (0.15 + 0.1 * k)
      for (const d of [-0.12, 0, 0.12]) {
        const hz = f(n + d), ph = Math.random() * 6.28
        for (let i = Math.floor(a.ini * SR); i < Math.min(N, a.fim * SR); i++) {
          const t = i / SR - a.ini, resto = a.fim - i / SR
          const env = Math.min(1, t / 1.1) * Math.min(1, resto / 1.4)
          const w = 2 * Math.PI * hz * (i / SR) + ph
          soma(i, 0.028 * env * (Math.sin(w) + 0.25 * Math.sin(2 * w) + 0.08 * Math.sin(3 * w)), pan)
        }
      }
    })
  }

  // 3) sinos dourados em arpejo (o «brilho» da marca)
  const sinos = [[0.55, 81], [0.85, 84], [1.15, 88], [1.45, 91], [1.9, 93], [4.3, 81], [4.6, 84], [4.9, 88], [5.3, 93], [5.8, 96]]
  sinos.forEach(([t0, n], k) => {
    const hz = f(n), pan = (k % 2 ? 0.45 : -0.45)
    for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + 2.6) * SR); i++) {
      const t = i / SR - t0, env = Math.min(1, t / 0.004) * Math.exp(-t * 2.2)
      const w = 2 * Math.PI * hz * t
      soma(i, 0.06 * env * (Math.sin(w) + 0.35 * Math.sin(2.76 * w) * Math.exp(-t * 4)), pan)
    }
  })

  // 4) segundo impacto, mais leve, na resolução
  fase = 0
  for (let i = Math.floor(4.2 * SR); i < Math.min(N, 6.5 * SR); i++) {
    const t = i / SR - 4.2, hz = 48 + 30 * Math.exp(-t * 7)
    fase += 2 * Math.PI * hz / SR
    soma(i, 0.32 * Math.min(1, t / 0.01) * Math.exp(-t * 1.9) * Math.sin(fase))
  }

  // eco simples (sala) + normalização a -1 dBFS + fade final
  for (const [atr, g] of [[0.19, 0.28], [0.31, 0.18]]) {
    const d = Math.floor(atr * SR)
    for (let i = N - 1; i >= d; i--) { L[i] += g * R[i - d]; R[i] += g * L[i - d] }
  }
  let pico = 0
  for (let i = 0; i < N; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]))
  const ganho = 0.89 / (pico || 1)
  const buf = Buffer.alloc(44 + N * 4)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40)
  for (let i = 0; i < N; i++) {
    const fade = Math.min(1, (N - i) / (SR * 1.5))
    buf.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, L[i] * ganho * fade))), 44 + i * 4)
    buf.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, R[i] * ganho * fade))), 46 + i * 4)
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino, buf)
  return destino
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(gerarEntrada(process.argv[2] || '/tmp/entrada.wav'))
