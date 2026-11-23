#!/usr/bin/env node
/**
 * Academia de Vendas — narração com a VOZ DA CASA (clone Fish do Ricardo, PT-PT).
 *
 *   [FISH_API_KEY=…] node --experimental-strip-types video/formacao/narrar.mjs <pasta-saida> [n…] [--en]
 *
 * Gera `0N-pt.wav` (e `0N-en.wav` com --en) a partir de `lib/backoffice-formacao.ts`. Usa a mesma voz,
 * modelo e pistas de pronúncia PT-PT de `lib/voz` (siglas soletradas à portuguesa), parte o texto por
 * parágrafos e junta tudo com ffmpeg. Não imprime a chave.
 *
 * Porque não o HeyGen: a voz HeyGen não tem sotaque regional e escorrega para brasileiro/espanhol
 * (queixa do Ricardo a 23/11). A Fish é a voz oficial da casa.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { AULAS, narracao } = await import(path.join(RAIZ, 'lib/backoffice-formacao.ts'))

const VOZ_RICARDO = '1e0fa8b490c744acba94da72710e6db2'
const MODELO = process.env.FISH_MODEL || 'speech-1.6'
const KEY = (process.env.FISH_API_KEY || '').trim()
// Sem FISH_API_KEY no processo, conta-se com a chave posta como «network secret» do ambiente da nuvem
// (o proxy acrescenta o cabeçalho Authorization nos pedidos a api.fish.audio).
if (!KEY) console.error('sem FISH_API_KEY: a usar a chave injectada pelo ambiente para api.fish.audio')

// Pistas de dicção PT-PT só para a síntese (o ecrã mantém a grafia normal).
const PRONUNCIA_PT = [
  [/\bDCA\b/g, 'dê cê á'],
  [/\bGarcia\b/g, 'Gârcia'],
  [/\bIBs\b/g, 'ís-bês'],
  [/\bIB\b/g, 'í-bê'],
  [/\bUID\b/g, 'u-í-dê'],
  [/\bCRM\b/g, 'cê-érre-éme'],
  [/\bMTM\b/g, 'ême-tê-ême'],
  [/\bIA\b/g, 'í-á'],
  [/\bPU Prime\b/g, 'pê-u práime'],
  [/\bapp\b/g, 'aplicação'],
  [/\bback-office\b/g, 'béque-ófice'],
]
const pt = (t) => PRONUNCIA_PT.reduce((s, [re, por]) => s.replace(re, por), t)

const args = process.argv.slice(2)
const saida = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) || path.join(RAIZ, 'out/formacao/audio')
const numeros = args.filter((a) => /^\d+$/.test(a)).map(Number)
const linguas = args.includes('--en') ? ['pt', 'en'] : ['pt']
fs.mkdirSync(saida, { recursive: true })

async function sintetizar(texto, ficheiro) {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const res = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}), 'Content-Type': 'application/json', model: MODELO },
      body: JSON.stringify({ text: texto, reference_id: VOZ_RICARDO, format: 'wav', normalize: true, latency: 'normal' }),
    })
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > 200) return fs.writeFileSync(ficheiro, buf)
    }
    console.error(`  Fish ${res.status} (tentativa ${tentativa})`)
    await new Promise((r) => setTimeout(r, 2000 * tentativa))
  }
  throw new Error(`Fish falhou: ${ficheiro}`)
}

for (const a of AULAS.filter((x) => !numeros.length || numeros.includes(x.numero))) {
  for (const L of linguas) {
    const paragrafos = narracao(a, L).split(/\n\n+/).map((p) => (L === 'pt' ? pt(p) : p).trim()).filter(Boolean)
    const tmp = fs.mkdtempSync(path.join(saida, '.p-'))
    const partes = []
    for (const [i, p] of paragrafos.entries()) {
      const f = path.join(tmp, `${String(i).padStart(2, '0')}.wav`)
      await sintetizar(p, f)
      partes.push(f)
    }
    // pausa de 0,45 s entre parágrafos: dá respiração e ajuda os cortes de cena a cair nos silêncios
    const lista = partes.map((f) => `file '${f}'\nfile '${path.join(tmp, 'pausa.wav')}'`).join('\n')
    execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.45', '-y', path.join(tmp, 'pausa.wav')])
    fs.writeFileSync(path.join(tmp, 'lista.txt'), lista)
    const final = path.join(saida, `${String(a.numero).padStart(2, '0')}-${L}.wav`)
    execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'lista.txt'), '-ar', '44100', '-ac', '1', '-y', final])
    fs.rmSync(tmp, { recursive: true })
    console.log(final)
  }
}
