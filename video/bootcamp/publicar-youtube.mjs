// Publica no YouTube os vídeos de bootcamp prontos (marcador .v3) que ainda não subiram (marcador .yt).
// Por vídeo: upload público, miniatura (capa), legendas (.vtt) e entrada na playlist da estratégia.
// Uso (no Mac, na raiz do worktree): node video/bootcamp/publicar-youtube.mjs
// Credenciais YOUTUBE_CLIENT_ID / _SECRET / _REFRESH_TOKEN (as mesmas do videocliper), lidas do ambiente,
// de $MTM_ENV ou dos .env.local vizinhos. Sai com código 3 quando a quota diária do YouTube acaba.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const SAIDA = path.join(DIR, 'saida')
const RAIZ = path.resolve(DIR, '../..')
for (const f of [process.env.MTM_ENV, path.join(RAIZ, '.env.local'), path.join(RAIZ, '../SITE-MORETHANMONEY-FINAL/.env.local'), path.join(RAIZ, '../MTM-Videoframes-projetos/educador-estrategias/.env.local'), path.join(RAIZ, '../SITE-MORETHANMONEY-FINAL/.env.vercel')].filter(Boolean)) {
  if (!fs.existsSync(f)) continue
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) { const m = l.match(/^\s*(YOUTUBE_[A-Z_]+)\s*=\s*"?([^"\n]*)"?/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim() }
}
const API = 'https://www.googleapis.com/youtube/v3', UP = 'https://www.googleapis.com/upload/youtube/v3'
class Quota extends Error {}
async function chk(r, o) { if (r.ok) return r; const t = await r.text(); if (r.status === 403 && /quota/i.test(t)) throw new Quota(t.slice(0, 200)); throw new Error(`${o} ${r.status}: ${t.slice(0, 300)}`) }

async function token() {
  const { YOUTUBE_CLIENT_ID: c, YOUTUBE_CLIENT_SECRET: s, YOUTUBE_REFRESH_TOKEN: r } = process.env
  if (!c || !s || !r) { console.log('ERRO credenciais YOUTUBE_* não encontradas (põe MTM_ENV=<ficheiro .env> ou exporta-as)'); process.exit(2) }
  const j = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c, client_secret: s, refresh_token: r, grant_type: 'refresh_token' }) })).json()
  if (!j.access_token) { console.log('ERRO token do YouTube:', JSON.stringify(j).slice(0, 200)); process.exit(2) }
  return j.access_token
}

const T = await token()
const H = { Authorization: `Bearer ${T}` }
// playlists do canal (para casar com os links de lib/estrategias-mtm.ts e não criar duplicadas)
const minhas = []
for (let p = ''; ;) { const j = await (await chk(await fetch(`${API}/playlists?part=snippet&mine=true&maxResults=50${p ? '&pageToken=' + p : ''}`, { headers: H }), 'playlists')).json(); minhas.push(...(j.items || [])); if (!(p = j.nextPageToken)) break }
const lib = fs.readFileSync(path.join(RAIZ, 'lib/estrategias-mtm.ts'), 'utf8')
async function playlistDe(est, nome, lang) {
  const bloco = lib.split(`slug: "${est}"`)[1] || ''
  const m = bloco.match(/playlist: \{ pt: (null|"[^"]+"), en: (null|"[^"]+") \}/) || []
  const link = (lang === 'pt' ? m[1] : m[2]) || 'null'
  const id = (link.match(/list=([\w-]+)/) || [])[1]
  let p = id && minhas.find(x => x.id === id || x.id.startsWith(id))
  if (!p) { const marca = lang === 'en' ? /\b(EN|English|Inglês)\b/i : /\b(PT|Português)\b/i; p = minhas.find(x => x.snippet.title.toLowerCase().includes(nome.toLowerCase()) && marca.test(x.snippet.title)) }
  if (p) return p.id
  const titulo = `${nome} · Bootcamp ${lang === 'en' ? 'EN' : 'PT'}`
  const j = await (await chk(await fetch(`${API}/playlists?part=snippet,status`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ snippet: { title: titulo, description: lang === 'en' ? `${nome} strategy by MoreThanMoney. Educational content, not financial advice.` : `Estratégia ${nome} da MoreThanMoney. Conteúdo educativo, não constitui consultoria financeira.`, defaultLanguage: lang === 'en' ? 'en' : 'pt-PT' }, status: { privacyStatus: 'public' } }) }), 'criar playlist')).json()
  console.log(`playlist criada: ${titulo} https://www.youtube.com/playlist?list=${j.id}`)
  minhas.push(j)
  return j.id
}
function ficha(txt) { const sec = n => (txt.split(`\n${n}\n`)[1] || '').split(/\n\n[A-ZÇÃÍ]+\n/)[0].trim(); return { titulo: txt.split('\n')[1].trim(), etiquetas: sec('ETIQUETAS').split(',').map(s => s.trim()).filter(Boolean), descricao: txt.split('\nDESCRIÇÃO\n')[1].trim() } }

const registo = path.join(SAIDA, 'publicados.json')
const pub = fs.existsSync(registo) ? JSON.parse(fs.readFileSync(registo, 'utf8')) : {}
let pend = 0
try {
  for (const est of fs.existsSync(SAIDA) ? fs.readdirSync(SAIDA).filter(d => fs.statSync(path.join(SAIDA, d)).isDirectory()) : []) {
    const files = fs.readdirSync(path.join(SAIDA, est)).filter(f => /-\d+-(pt|en)\.mp4$/.test(f)).sort()
    for (const f of files) {
      const mp4 = path.join(SAIDA, est, f), base = mp4.replace(/\.mp4$/, '')
      if (!fs.existsSync(mp4 + '.v3') || fs.existsSync(mp4 + '.yt')) continue
      const [, n, lang] = f.match(/-(\d+)-(pt|en)\.mp4$/)
      if (!fs.existsSync(base + '-youtube.txt')) continue
      pend++
      const G = JSON.parse(fs.readFileSync(path.join(DIR, 'guioes', `${est}.${lang}.json`), 'utf8'))
      const F = ficha(fs.readFileSync(base + '-youtube.txt', 'utf8'))
      const lg = lang === 'en' ? 'en' : 'pt-PT'
      const video = fs.readFileSync(mp4)
      console.log(`a subir ${f} (${(video.length / 1e6).toFixed(0)} MB)`)
      const abre = await chk(await fetch(`${UP}/videos?uploadType=resumable&part=snippet,status`, { method: 'POST', headers: { ...H, 'content-type': 'application/json', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(video.length) },
        body: JSON.stringify({ snippet: { title: F.titulo.slice(0, 100), description: F.descricao.slice(0, 5000), tags: F.etiquetas, categoryId: '27', defaultLanguage: lg, defaultAudioLanguage: lg }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } }) }), 'abrir upload')
      const up = await (await chk(await fetch(abre.headers.get('location'), { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: video }), 'upload')).json()
      const id = up.id
      fs.writeFileSync(mp4 + '.yt', id)
      pub[f] = { id, url: `https://youtu.be/${id}` }
      fs.writeFileSync(registo, JSON.stringify(pub, null, 2))
      const extra = []
      const capa = path.join(SAIDA, est, `capa-${n}-${lang}.jpg`)
      if (fs.existsSync(capa)) await fetch(`${UP}/thumbnails/set?videoId=${id}`, { method: 'POST', headers: { ...H, 'content-type': 'image/jpeg' }, body: fs.readFileSync(capa) }).then(r => extra.push(r.ok ? 'capa' : `capa ${r.status}`))
      if (fs.existsSync(base + '.vtt')) {
        const bnd = 'mtmbootcamp' + Date.now(), meta = JSON.stringify({ snippet: { videoId: id, language: lg, name: lang === 'en' ? 'English' : 'Português' } })
        const corpo = `--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${bnd}\r\nContent-Type: text/vtt\r\n\r\n${fs.readFileSync(base + '.vtt', 'utf8')}\r\n--${bnd}--`
        await fetch(`${UP}/captions?uploadType=multipart&part=snippet`, { method: 'POST', headers: { ...H, 'content-type': `multipart/related; boundary=${bnd}` }, body: corpo }).then(r => extra.push(r.ok ? 'legendas' : `legendas ${r.status}`))
      }
      const pl = await playlistDe(est, G.estrategia, lang)
      await fetch(`${API}/playlistItems?part=snippet`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ snippet: { playlistId: pl, position: Number(n) - 1, resourceId: { kind: 'youtube#video', videoId: id } } }) })
        .then(async r => extra.push(r.ok ? 'playlist' : `playlist ${r.status}`))
      pub[f].playlist = pl
      fs.writeFileSync(registo, JSON.stringify(pub, null, 2))
      console.log(`PUBLICADO ${f} https://youtu.be/${id} (${extra.join(', ')})`)
      pend--
    }
  }
} catch (e) {
  if (e instanceof Quota) { console.log('QUOTA do YouTube esgotada por hoje; retoma amanhã sozinho.'); process.exit(3) }
  throw e
}
console.log(`publicação: ${pend} por publicar`)
