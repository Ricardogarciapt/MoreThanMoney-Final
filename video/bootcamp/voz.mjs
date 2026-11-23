// Narra um bootcamp com um clone Fish: o do Ricardo por omissão; o guião pode fixar outro ("voz": "<id Fish>",
// ex.: o curso do Ruben com a voz dele) e --voz=<id> manda sempre. A mesma voz em todas as línguas.
// Uso (no Mac, onde vive a chave): node video/bootcamp/voz.mjs <estrategia> <video|all> pt en
// Cache por texto: só volta a gastar na cena cuja fala mudou.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ENVF = process.env.MTM_ENV || '/Volumes/Disco externo/Ollama para a MTM/MTM-Videoframes-projetos/educador-estrategias/.env.local'
const ENV = fs.existsSync(ENVF) ? fs.readFileSync(ENVF, 'utf8') : ''
const env = k => process.env[k] || (ENV.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
const VOZ_RICARDO = '1e0fa8b490c744acba94da72710e6db2'
const [est, qual, ...langs] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const VOZ_ARG = (process.argv.find(a => a.startsWith('--voz=')) || '').split('=')[1]

for (const lang of langs) {
  const G = JSON.parse(fs.readFileSync(path.join(DIR, 'guioes', `${est}.${lang}.json`), 'utf8'))
  const pron = G.pronuncia || []
  // curso de outro educador (ex.: Ruben): nunca cai na voz do Ricardo por omissão
  if (G.vozObrigatoria && !VOZ_ARG && !G.voz) throw new Error(`${est}: falta a voz do educador ("voz" no guião ou --voz=<id Fish>)`)
  const VOZ = VOZ_ARG || G.voz || VOZ_RICARDO
  for (const [vi, V] of G.videos.entries()) {
    if (qual !== 'all' && Number(qual) !== vi + 1) continue
    const dir = path.join(DIR, 'voz', est, `v${vi + 1}`, lang)
    fs.mkdirSync(dir, { recursive: true })
    for (const c of V.cenas.filter(c => c.fala)) {
      const texto = pron.reduce((t, [a, b]) => t.split(a).join(b), c.fala)
      const mp3 = path.join(dir, `${c.id}.mp3`), marca = mp3 + '.txt', chave = `${VOZ}\n${texto}`
      if (fs.existsSync(mp3) && fs.existsSync(marca) && fs.readFileSync(marca, 'utf8') === chave) continue
      for (let tentativa = 1; ; tentativa++) {
        const res = await fetch('https://api.fish.audio/v1/tts', {
          method: 'POST',
          headers: { ...(env('FISH_API_KEY') ? { Authorization: `Bearer ${env('FISH_API_KEY')}` } : {}), 'Content-Type': 'application/json', model: env('FISH_MODEL') || 's2.1-pro-free' },
          body: JSON.stringify({ text: texto, reference_id: VOZ, format: 'mp3', mp3_bitrate: 128, normalize: true, latency: 'normal' }),
        })
        if (res.ok) { fs.writeFileSync(mp3, Buffer.from(await res.arrayBuffer())); break }
        const erro = `Fish ${res.status}: ${(await res.text()).slice(0, 200)}`
        if (tentativa >= 4) throw new Error(erro)
        console.log(erro, '— nova tentativa'); await new Promise(r => setTimeout(r, 4000 * tentativa))
      }
      fs.writeFileSync(marca, chave)
      console.log(est, `v${vi + 1}`, lang, c.id)
    }
  }
}
