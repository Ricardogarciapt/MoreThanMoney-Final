// Narra o guião da apresentação (Fish Audio) para uma ou mais línguas.
// Uso: node video/apresentacao/voz.mjs pt en es de it nl pl
// PT usa o clone do Ricardo; as outras línguas usam vozes nativas da biblioteca Fish (ver MTM-Videoframes-projetos/vozes.md).
// Cache por texto e voz (voz/<lang>/<id>.mp3.txt): só gasta créditos na cena cuja fala mudou.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ENV = fs.readFileSync('/Volumes/Disco externo/Ollama para a MTM/MTM-Videoframes-projetos/educador-estrategias/.env.local', 'utf8')
const env = k => (ENV.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
const G = JSON.parse(fs.readFileSync(path.join(DIR, 'guiao.json'), 'utf8'))
const langs = process.argv.slice(2)

for (const lang of langs) {
  const voz = G.vozes[lang]
  if (!voz) throw new Error(`sem voz para ${lang}`)
  const dir = path.join(DIR, 'voz', lang)
  fs.mkdirSync(dir, { recursive: true })
  const falar = s => (G.pronuncia[lang] || []).reduce((t, [a, b]) => t.split(a).join(b), s)
  for (const c of G.cenas) {
    const mp3 = path.join(dir, `${c.id}.mp3`), marca = mp3 + '.txt', chave = `${voz}\n${c[lang]}`
    if (fs.existsSync(mp3) && fs.existsSync(marca) && fs.readFileSync(marca, 'utf8') === chave) continue
    for (let tentativa = 1; ; tentativa++) {
      const res = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env('FISH_API_KEY')}`, 'Content-Type': 'application/json', model: env('FISH_MODEL') || 's2.1-pro-free' },
        body: JSON.stringify({ text: falar(c[lang]), reference_id: voz, format: 'mp3', mp3_bitrate: 128, normalize: true, latency: 'normal' }),
      })
      if (res.ok) { fs.writeFileSync(mp3, Buffer.from(await res.arrayBuffer())); break }
      const erro = `Fish ${res.status}: ${(await res.text()).slice(0, 200)}`
      if (tentativa >= 4) throw new Error(erro)
      console.log(erro, '— nova tentativa'); await new Promise(r => setTimeout(r, 4000 * tentativa))
    }
    fs.writeFileSync(marca, chave)
    console.log(lang, c.id)
  }
}
