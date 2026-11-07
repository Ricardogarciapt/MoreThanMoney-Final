// Publica no YouTube os vídeos de bootcamp prontos (marcador .v3) que ainda não subiram (marcador .yt).
// Por vídeo: upload público, miniatura (capa), legendas (.vtt) e entrada na playlist da estratégia.
// Ordem em cada playlist: vídeos com "posicao":"inicio" no guião (ex.: os 3 explicativos do DEFY) no topo,
// depois os vídeos que já lá estavam, e os módulos do bootcamp no FIM, por ordem.
// Uso (no Mac, na raiz do worktree): node video/bootcamp/publicar-youtube.mjs
//   --refazer <est> [<est>…] --tag <t>   apaga os vídeos já publicados dessas estratégias (no YouTube, na próxima
//                                         passagem com credenciais) e limpa os marcadores para a fila os voltar a fazer;
//                                         com --tag só corre uma vez por estratégia (marcador saida/.refeito-<est>-<t>)
//   Os títulos "tituloPlaylist" dos guiões são aplicados às playlists (ex.: «Estratégias MTM - Defy»).
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
const registo = path.join(SAIDA, 'publicados.json')
const pub = fs.existsSync(registo) ? JSON.parse(fs.readFileSync(registo, 'utf8')) : {}
const grava = () => { fs.mkdirSync(SAIDA, { recursive: true }); fs.writeFileSync(registo, JSON.stringify(pub, null, 2)) }
const guiao = (est, lang) => { const f = path.join(DIR, 'guioes', `${est}.${lang}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null }
const parte = f => { const m = f.match(/^bootcamp-(.+)-(\d+)-(pt|en)\.mp4$/); return m && { est: m[1], n: Number(m[2]), lang: m[3] } }

// refazer: local, não precisa de credenciais (a fila chama isto antes de voltar a desenhar os vídeos)
const iR = process.argv.indexOf('--refazer')
if (iR > 0) {
  const iT = process.argv.indexOf('--tag'), tag = iT > 0 ? (process.argv[iT + 1] || '') : ''
  const ests = process.argv.slice(iR + 1).filter(a => !a.startsWith('--') && a !== tag)
  pub._apagar = pub._apagar || []
  for (const est of ests) {
    const marca = path.join(SAIDA, `.refeito-${est}-${tag}`)
    if (tag && fs.existsSync(marca)) { console.log(`refazer ${est}: já feito (${tag})`); continue }
    const dir = path.join(SAIDA, est); let n = 0
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      if (!/\.mp4$/.test(f)) continue
      const mp4 = path.join(dir, f), id = pub[f]?.id || (fs.existsSync(mp4 + '.yt') && fs.readFileSync(mp4 + '.yt', 'utf8').trim())
      if (id) { pub._apagar.push(id); n++ }
      delete pub[f]
      for (const x of [mp4, mp4 + '.yt', mp4 + '.v3']) fs.rmSync(x, { force: true })
    }
    if (tag) fs.writeFileSync(marca, new Date().toISOString())
    console.log(`refazer ${est}: ${n} vídeo(s) do YouTube para apagar, marcadores limpos`)
  }
  grava(); process.exit(0)
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
// arruma uma playlist: «inicio» no topo (por n), o resto como está, módulos do bootcamp no fim (por n)
async function arrumar(pl) {
  const itens = []
  for (let p = ''; ;) { const j = await (await chk(await fetch(`${API}/playlistItems?part=snippet&maxResults=50&playlistId=${pl}${p ? '&pageToken=' + p : ''}`, { headers: H }), 'listar playlist')).json(); itens.push(...(j.items || [])); if (!(p = j.nextPageToken)) break }
  const meu = {}
  for (const [f, v] of Object.entries(pub)) { const x = parte(f); if (!x || !v || v.playlist !== pl) continue; const G = guiao(x.est, x.lang); meu[v.id] = { ...x, topo: G?.posicao === 'inicio' } }
  const k = it => meu[it.snippet.resourceId.videoId]
  const topo = itens.filter(it => k(it)?.topo).sort((a, b) => k(a).n - k(b).n)
  const fim = itens.filter(it => k(it) && !k(it).topo).sort((a, b) => k(a).n - k(b).n)
  const quer = [...topo, ...itens.filter(it => !k(it)), ...fim]
  let atual = [...itens], mov = 0
  for (let i = 0; i < quer.length; i++) {
    if (atual[i].id === quer[i].id) continue
    await chk(await fetch(`${API}/playlistItems?part=snippet`, { method: 'PUT', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ id: quer[i].id, snippet: { playlistId: pl, position: i, resourceId: quer[i].snippet.resourceId } }) }), 'mover na playlist')
    atual = atual.filter(x => x.id !== quer[i].id); atual.splice(i, 0, quer[i]); mov++
  }
  if (mov) console.log(`playlist ${pl}: ${mov} vídeo(s) reordenados`)
}
function ficha(txt) { const sec = n => (txt.split(`\n${n}\n`)[1] || '').split(/\n\n[A-ZÇÃÍ]+\n/)[0].trim(); return { titulo: txt.split('\n')[1].trim(), etiquetas: sec('ETIQUETAS').split(',').map(s => s.trim()).filter(Boolean), descricao: txt.split('\nDESCRIÇÃO\n')[1].trim() } }

let pend = 0
try {
  // vídeos substituídos (--refazer): apagar do canal
  for (const id of [...(pub._apagar || [])]) {
    const r = await fetch(`${API}/videos?id=${id}`, { method: 'DELETE', headers: H })
    if (r.ok || r.status === 404) { pub._apagar = pub._apagar.filter(x => x !== id); grava(); console.log(`apagado do YouTube: ${id}`) }
    else await chk(r, 'apagar vídeo')
  }
  // nomes das playlists pedidos nos guiões
  for (const f of fs.readdirSync(path.join(DIR, 'guioes')).filter(f => /\.pt\.json$/.test(f))) {
    const est = f.replace('.pt.json', '')
    for (const lang of ['pt', 'en']) { const G = guiao(est, lang), novo = G?.tituloPlaylist?.[lang]; if (!novo) continue
      const id = await playlistDe(G.playlist || est, G.estrategia, lang), p = minhas.find(x => x.id === id)
      if (!p || p.snippet.title === novo) continue
      await chk(await fetch(`${API}/playlists?part=snippet`, { method: 'PUT', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ id, snippet: { title: novo, description: p.snippet.description || '', defaultLanguage: p.snippet.defaultLanguage || (lang === 'en' ? 'en' : 'pt-PT') } }) }), 'renomear playlist')
      console.log(`playlist renomeada: ${p.snippet.title} → ${novo}`); p.snippet.title = novo }
  }
  // corrigir a ordem das playlists que já têm vídeos nossos (os primeiros entraram no topo por engano)
  for (const pl of new Set(Object.values(pub).map(v => v && v.playlist).filter(Boolean))) await arrumar(pl)
  for (const est of fs.existsSync(SAIDA) ? fs.readdirSync(SAIDA).filter(d => fs.statSync(path.join(SAIDA, d)).isDirectory()) : []) {
    const files = fs.readdirSync(path.join(SAIDA, est)).filter(f => /-\d+-(pt|en)\.mp4$/.test(f)).sort()
    for (const f of files) {
      const mp4 = path.join(SAIDA, est, f), base = mp4.replace(/\.mp4$/, '')
      if (!fs.existsSync(mp4 + '.v3') || fs.existsSync(mp4 + '.yt')) continue
      const [, n, lang] = f.match(/-(\d+)-(pt|en)\.mp4$/)
      if (!fs.existsSync(base + '-youtube.txt')) continue
      pend++
      const G = guiao(est, lang)
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
      grava()
      const extra = []
      const capa = path.join(SAIDA, est, `capa-${n}-${lang}.jpg`)
      if (fs.existsSync(capa)) await fetch(`${UP}/thumbnails/set?videoId=${id}`, { method: 'POST', headers: { ...H, 'content-type': 'image/jpeg' }, body: fs.readFileSync(capa) }).then(r => extra.push(r.ok ? 'capa' : `capa ${r.status}`))
      if (fs.existsSync(base + '.vtt')) {
        const bnd = 'mtmbootcamp' + Date.now(), meta = JSON.stringify({ snippet: { videoId: id, language: lg, name: lang === 'en' ? 'English' : 'Português' } })
        const corpo = `--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${bnd}\r\nContent-Type: text/vtt\r\n\r\n${fs.readFileSync(base + '.vtt', 'utf8')}\r\n--${bnd}--`
        await fetch(`${UP}/captions?uploadType=multipart&part=snippet`, { method: 'POST', headers: { ...H, 'content-type': `multipart/related; boundary=${bnd}` }, body: corpo }).then(r => extra.push(r.ok ? 'legendas' : `legendas ${r.status}`))
      }
      const pl = await playlistDe(G.playlist || est, G.estrategia, lang)
      // sem «position» entra no fim; o arrumar põe os «inicio» no topo e os módulos por ordem
      await fetch(`${API}/playlistItems?part=snippet`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ snippet: { playlistId: pl, resourceId: { kind: 'youtube#video', videoId: id } } }) })
        .then(async r => extra.push(r.ok ? 'playlist' : `playlist ${r.status}`))
      pub[f].playlist = pl
      grava()
      await arrumar(pl).catch(e => { if (e instanceof Quota) throw e; extra.push('ordem por acertar') })
      console.log(`PUBLICADO ${f} https://youtu.be/${id} (${extra.join(', ')})`)
      pend--
    }
  }
} catch (e) {
  if (e instanceof Quota) { console.log('QUOTA do YouTube esgotada por hoje; retoma amanhã sozinho.'); process.exit(3) }
  throw e
}
console.log(`publicação: ${pend} por publicar`)
