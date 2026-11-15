// Gera os áudios da narração (DEFY, RocketNova…) com o clone Fish do Ricardo (PT e EN) e o duracoes.json.
// Uso no Mac, na pasta do repo:  node docs/<scanner>/narracao/gerar-audios.mjs landing-pt landing-en
// (sem argumentos gera todos os .txt desta pasta). Cada linha do .txt = uma cena = um mp3.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ENVF = process.env.MTM_ENV || '/Volumes/Disco externo/Ollama para a MTM/MTM-Videoframes-projetos/educador-estrategias/.env.local'
const ENV = fs.existsSync(ENVF) ? fs.readFileSync(ENVF, 'utf8') : ''
const env = k => process.env[k] || (ENV.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
const VOZ_RICARDO = '1e0fa8b490c744acba94da72710e6db2'
const KEY = env('FISH_API_KEY')
if (!KEY) { console.error('Falta FISH_API_KEY (procurei em', ENVF, ')'); process.exit(1) }

const nomes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(DIR).filter(f => f.endsWith('.txt')).map(f => f.replace(/\.txt$/, ''))
const durFile = path.join(DIR, 'duracoes.json')
const dur = fs.existsSync(durFile) ? JSON.parse(fs.readFileSync(durFile, 'utf8')) : {}

for (const nome of nomes) {
  const linhas = fs.readFileSync(path.join(DIR, `${nome}.txt`), 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
  const out = path.join(DIR, nome)
  fs.mkdirSync(out, { recursive: true })
  dur[nome] = []
  for (const [i, texto] of linhas.entries()) {
    const mp3 = path.join(out, `${String(i + 1).padStart(2, '0')}.mp3`)
    for (let t = 1; ; t++) {
      const res = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', model: env('FISH_MODEL') || 's2.1-pro-free' },
        body: JSON.stringify({ text: texto, reference_id: VOZ_RICARDO, format: 'mp3', mp3_bitrate: 128, normalize: true, latency: 'normal' }),
      })
      if (res.ok) { fs.writeFileSync(mp3, Buffer.from(await res.arrayBuffer())); break }
      const erro = `Fish ${res.status}: ${(await res.text()).slice(0, 200)}`
      if (t >= 4) throw new Error(erro)
      console.log(erro, '— nova tentativa'); await new Promise(r => setTimeout(r, 4000 * t))
    }
    const seg = Math.round((fs.statSync(mp3).size * 8 / 128000) * 100) / 100 // 128 kbps CBR
    dur[nome].push({ cena: i + 1, ficheiro: `${nome}/${path.basename(mp3)}`, segundos: seg })
    console.log(nome, i + 1, seg + 's')
  }
  fs.writeFileSync(durFile, JSON.stringify(dur, null, 2))
}
console.log('Feito. Agora: git add docs/defy/narracao && git commit -m "DEFY: áudios da narração" && git push origin claude/project-thread-v2cyst')
