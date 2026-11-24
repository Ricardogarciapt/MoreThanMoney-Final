// Curso do Ruben «A Primeira Chave»: sobe para o YouTube, como NÃO LISTADAS, as aulas com voz já renderizadas
// (marcador .vel093 ao lado do .mp4) e regista os links para o Skool e para a sala do curso.
// Uso (no Mac, na raiz do repo):
//   node video/bootcamp/publicar-curso-ruben-youtube.mjs            uma passagem
//   nohup caffeinate -dims node video/bootcamp/publicar-curso-ruben-youtube.mjs --vigiar > ~/curso-ruben-yt.log 2>&1 &
//       repete sozinho: de 20 em 20 min enquanto há aulas novas; quando a quota do YouTube acaba, espera e retoma.
// Ordem: PT, EN, ES, FR, aula a aula. Uma playlist não listada por língua («A Primeira Chave · PT», …).
// Quota da API: cada upload custa 1.600 de 10.000 unidades/dia, ou seja ~6 aulas por dia. Sem legendas
// (400 cada) para caberem mais aulas; o .vtt fica ao lado para se juntar depois, se for preciso.
// Links: <DEST>/youtube-links.json e site_settings.curso_primeira_chave_videos ({ pt: { "1": url }, … }).
// Credenciais YOUTUBE_* e SUPABASE das .env.local (as mesmas do publicar-youtube.mjs).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(DIR, '../..')
const DEST = process.env.CURSO_DEST || '/Volumes/Disco externo/Ricardo/Bootcamp Ruben/20 aulas com voz'
const VERSAO = 'vel093'
const LINGUAS = ['pt', 'en', 'es', 'fr']
const NOME_LINGUA = { pt: 'PT', en: 'EN', es: 'ES', fr: 'FR' }
const LG = { pt: 'pt-PT', en: 'en', es: 'es', fr: 'fr' }
const AVISO = {
  pt: 'Conteúdo educativo, não constitui consultoria financeira. Investir em cripto envolve risco de perda.',
  en: 'Educational content, not financial advice. Investing in crypto involves risk of loss.',
  es: 'Contenido educativo, no constituye asesoramiento financiero. Invertir en cripto implica riesgo de pérdida.',
  fr: "Contenu éducatif, ne constitue pas un conseil financier. Investir en crypto comporte un risque de perte.",
}
const CURSO = 'https://www.morethanmoney.pt/cursos/a-primeira-chave'

for (const f of [process.env.MTM_ENV, path.join(RAIZ, '.env.local'), path.join(RAIZ, '../SITE-MORETHANMONEY-FINAL/.env.local'), path.join(RAIZ, '../SITE-MORETHANMONEY-FINAL/.env.vercel')].filter(Boolean)) {
  if (!fs.existsSync(f)) continue
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = l.match(/^\s*(YOUTUBE_[A-Z_]+|GOOGLE_CLIENT_(?:ID|SECRET)|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*"?([^"\n]*)"?/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}
// na Vercel o par OAuth chama-se GOOGLE_CLIENT_ID/SECRET (o refresh token é YOUTUBE_REFRESH_TOKEN)
process.env.YOUTUBE_CLIENT_ID ||= process.env.GOOGLE_CLIENT_ID
process.env.YOUTUBE_CLIENT_SECRET ||= process.env.GOOGLE_CLIENT_SECRET

const API = 'https://www.googleapis.com/youtube/v3', UP = 'https://www.googleapis.com/upload/youtube/v3'
class Quota extends Error {}
async function chk(r, o) { if (r.ok) return r; const t = await r.text(); if (r.status === 403 && /quota/i.test(t)) throw new Quota(t.slice(0, 200)); throw new Error(`${o} ${r.status}: ${t.slice(0, 300)}`) }
const espera = ms => new Promise(r => setTimeout(r, ms))

const REGISTO = path.join(DEST, 'youtube-links.json')
const links = fs.existsSync(REGISTO) ? JSON.parse(fs.readFileSync(REGISTO, 'utf8')) : {}
links._playlists ||= {}
const grava = () => fs.writeFileSync(REGISTO, JSON.stringify(links, null, 2))

async function token() {
  const { YOUTUBE_CLIENT_ID: c, YOUTUBE_CLIENT_SECRET: s, YOUTUBE_REFRESH_TOKEN: r } = process.env
  if (!c || !s || !r) { console.log('ERRO credenciais YOUTUBE_* não encontradas (põe MTM_ENV=<ficheiro .env> ou exporta-as)'); process.exit(2) }
  const j = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c, client_secret: s, refresh_token: r, grant_type: 'refresh_token' }) })).json()
  if (!j.access_token) { console.log('ERRO token do YouTube:', JSON.stringify(j).slice(0, 200)); process.exit(2) }
  return j.access_token
}

// espelho dos links no site (para a sala do curso e para o thread do Skool lerem sem passar pelo Mac)
async function espelhar() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return console.log('aviso: sem credenciais Supabase, links só no ficheiro local')
  const value = {}
  for (const l of LINGUAS) for (const [n, v] of Object.entries(links[l] || {})) (value[l] ||= {})[n] = v.url
  value.playlists = Object.fromEntries(Object.entries(links._playlists).map(([l, id]) => [l, `https://www.youtube.com/playlist?list=${id}`]))
  const r = await fetch(`${url}/rest/v1/site_settings?on_conflict=key`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: 'curso_primeira_chave_videos', value, description: 'Links YouTube (não listados) das aulas do curso A Primeira Chave, por língua e número' }),
  })
  if (!r.ok) console.log('aviso: espelho no site falhou', r.status, (await r.text()).slice(0, 200))
}

async function passagem() {
  const pendentes = []
  for (const l of LINGUAS) for (let n = 1; n <= 20; n++) {
    const mp4 = path.join(DEST, l, `aula-${String(n).padStart(2, '0')}-${l}.mp4`)
    if (fs.existsSync(mp4) && fs.existsSync(mp4.replace(/\.mp4$/, `.${VERSAO}`)) && !links[l]?.[n]) pendentes.push({ l, n, mp4 })
  }
  if (!pendentes.length) return 0
  const H = { Authorization: `Bearer ${await token()}` }
  for (const { l, n, mp4 } of pendentes) {
    const G = JSON.parse(fs.readFileSync(path.join(DIR, 'guioes', `curso-a-primeira-chave.${l}.json`), 'utf8'))
    const V = G.videos[n - 1] || {}
    const tema = String(V.titulo || '').replace(/^\d+\s*·\s*/, '')
    const titulo = `A Primeira Chave · ${n}/20 · ${tema}`.slice(0, 100)
    const desc = [`${V.rotulo || `A Primeira Chave · ${n}`} · Ruben`, '', `${CURSO}?l=${l}`, '', AVISO[l]].join('\n')
    const video = fs.readFileSync(mp4)
    console.log(`a subir ${path.basename(mp4)} (${(video.length / 1e6).toFixed(0)} MB)`)
    const abre = await chk(await fetch(`${UP}/videos?uploadType=resumable&part=snippet,status`, {
      method: 'POST', headers: { ...H, 'content-type': 'application/json', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(video.length) },
      body: JSON.stringify({ snippet: { title: titulo, description: desc, tags: ['cripto', 'bitcoin', 'MoreThanMoney', 'A Primeira Chave'], categoryId: '27', defaultLanguage: LG[l], defaultAudioLanguage: LG[l] }, status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false } }),
    }), 'abrir upload')
    const { id } = await (await chk(await fetch(abre.headers.get('location'), { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: video }), 'upload')).json()
    ;(links[l] ||= {})[n] = { id, url: `https://youtu.be/${id}`, titulo }
    grava()
    if (!links._playlists[l]) {
      const p = await (await chk(await fetch(`${API}/playlists?part=snippet,status`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ snippet: { title: `A Primeira Chave · ${NOME_LINGUA[l]}`, description: `${CURSO}?l=${l}\n\n${AVISO[l]}`, defaultLanguage: LG[l] }, status: { privacyStatus: 'unlisted' } }) }), 'criar playlist')).json()
      links._playlists[l] = p.id; grava()
    }
    await fetch(`${API}/playlistItems?part=snippet`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ snippet: { playlistId: links._playlists[l], position: Object.keys(links[l]).length - 1, resourceId: { kind: 'youtube#video', videoId: id } } }) })
      .then(r => r.ok || console.log(`aviso: playlist ${r.status}`))
    console.log(`PUBLICADO ${l} aula ${n} https://youtu.be/${id}`)
    await espelhar()
  }
  return pendentes.length
}

const vigiar = process.argv.includes('--vigiar')
do {
  try {
    const n = await passagem()
    const feitas = LINGUAS.reduce((s, l) => s + Object.keys(links[l] || {}).length, 0)
    console.log(`${new Date().toISOString()} passagem: ${n} subidas · ${feitas}/80 no YouTube`)
    if (feitas >= 80) break
    if (vigiar) await espera(20 * 60e3)
  } catch (e) {
    if (!(e instanceof Quota)) { console.log('ERRO', e.message); if (!vigiar) process.exit(1); await espera(10 * 60e3); continue }
    console.log(`${new Date().toISOString()} QUOTA do YouTube esgotada; retoma daqui a 3 h`)
    if (!vigiar) process.exit(3)
    await espera(3 * 3600e3)
  }
} while (vigiar)
console.log('fim')
