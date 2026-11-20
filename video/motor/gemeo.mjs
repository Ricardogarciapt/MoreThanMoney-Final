// O GÉMEO DO RICARDO COMO APRESENTADOR (20/11/2026). Passo do motor único para pôr o clone HeyGen
// a falar, em lip sync, num círculo com aro da marca por cima de um vídeo que JÁ EXISTE, sem voltar
// a renderizar o vídeo (apresentações, cursos, bootcamps, demos).
//
//   import { gemeoPip, heygenGemeo, gemeoApresentador } from './gemeo.mjs'
//
//   gemeoPip(base, avatar, destino, opções)    só monta: círculo do avatar sobre a base (áudio da base)
//   heygenGemeo(audio, destino, opções)        só HeyGen: envia o áudio, gera o gémeo a falar, descarrega
//   gemeoApresentador(base, destino, opções)   tudo: áudio da base → HeyGen → círculo → finalizar
//
// CLI (o mesmo pelo motor.mjs):
//   node video/motor/motor.mjs gemeo <base.mp4> <saida.mp4> [--formato=youtube] [--marca=morethanmoney]
//        [--look=mentor|<id>] [--motor=avatar_iii] [--avatar=<mp4 já gerado>] [--canto=inferior-esquerdo] [--estimar]
//   → stdout JSON { ok, saida, heygenVideoId, minutos, creditos } (com --estimar: { minutos, creditosEstimados }, sem gastar)
//   node video/motor/motor.mjs gemeo-pip <base.mp4> <avatar.mp4> <saida.mp4> [--formato=…] [--marca=…]
//
// HEYGEN_API_KEY no ambiente (ou no .env.local do repositório). Custo medido a 20/11: o motor
// `avatar_iii` gasta ≈ 7 créditos/min; o Avatar 6 Turbo da HeyGen ≈ 20/min. Por omissão vai o III.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DIR, marca, sondar, finalizar, verificar } from './motor.mjs'

// Looks horizontais do clone (os mesmos de lib/estudio/heygen-looks.ts). Não são segredos.
export const LOOKS_HORIZONTAIS = {
  mentor: { id: 'e3b7d1109fad41ed8b03a768cb288744', tipo: 'talking_photo', nome: 'Blazer, escritório escuro com gráficos' },
  trader: { id: '9e6c76cd63024df880c51db41908b72f', tipo: 'talking_photo', nome: 'Trader na secretária' },
  podcast: { id: '03fbd5fc42a4466190f59f17a0da8906', tipo: 'talking_photo', nome: 'Podcast' },
  twin: { id: '3d43ebba9ad248e1984401c6997a6d1e', tipo: 'avatar', nome: 'Digital Twin (estúdio)' },
}

const API = 'https://api.heygen.com'
const UPLOAD = 'https://upload.heygen.com/v1/asset'

function chaveHeygen() {
  if (process.env.HEYGEN_API_KEY) return process.env.HEYGEN_API_KEY.trim()
  for (const f of [path.resolve(DIR, '../../.env.local'), path.resolve(DIR, '../../../SITE-MORETHANMONEY-FINAL/.env.local')]) {
    if (!fs.existsSync(f)) continue
    const m = fs.readFileSync(f, 'utf8').match(/^\s*HEYGEN_API_KEY\s*=\s*"?([^"\n]+)"?/m)
    if (m) return m[1].trim()
  }
  throw new Error('HEYGEN_API_KEY em falta (ambiente ou .env.local)')
}

const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg saiu com ${r.status}`)
}

/**
 * Monta o gémeo num círculo com aro da marca por cima da base. O tamanho é relativo à altura da base
 * (26 % da altura, aro 0,6 %, margem 4 %), por isso serve 720p, 1080p e vertical. Fica com o áudio
 * da base. Devolve o destino (codificação intermédia de alta qualidade: passa depois por finalizar()).
 */
export function gemeoPip(base, avatar, destino, { marca: idMarca = 'morethanmoney', canto = 'inferior-esquerdo', tamanho = 0.264, recorte = 0.56 } = {}) {
  const { altura: h, largura: w } = sondar(base)
  const curto = Math.min(w, h)
  const D = Math.round((curto * tamanho) / 2) * 2
  const B = Math.max(2, Math.round(curto * 0.0056))
  const M = Math.round(curto * 0.039)
  const T = D + 2 * B
  const x = canto.includes('direito') ? w - T - M : M
  const y = canto.includes('superior') ? M : h - T - M
  const cor = String(marca(idMarca).cores?.destaque || '#D2A63C').replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(cor.slice(i, i + 2), 16))
  const fc = [
    `[1:v]fps=30,crop=ih*${recorte}:ih*${recorte}:(iw-ih*${recorte})/2:0,scale=${D}:${D},format=rgba,`
      + `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${D / 2},Y-${D / 2}),${D / 2 - 1}),255,0)'[av]`,
    `color=c=0x${cor}:s=${T}x${T},format=rgba,geq=r='${r}':g='${g}':b='${b}':a='if(lte(hypot(X-${T / 2},Y-${T / 2}),${T / 2}),255,0)'[aro]`,
    `[aro][av]overlay=${B}:${B}[cracha]`,
    `[0:v][cracha]overlay=${x}:${y}:eof_action=pass[v]`,
  ].join(';')
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  ff(['-i', base, '-i', avatar, '-filter_complex', fc, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'copy', '-movflags', '+faststart', destino])
  return destino
}

/** Envia um áudio à HeyGen e devolve o MP4 do gémeo a falar em lip sync (16:9, 720p chega para o círculo). */
export async function heygenGemeo(audio, destino, { look = 'mentor', motor = 'avatar_iii', titulo = path.basename(destino), aspecto = '16:9', esperaMin = 40 } = {}) {
  const chave = chaveHeygen()
  const L = LOOKS_HORIZONTAIS[look] || { id: look, tipo: 'talking_photo' }
  // 1) áudio → asset
  const up = await fetch(UPLOAD, { method: 'POST', headers: { 'x-api-key': chave, 'content-type': 'audio/mpeg' }, body: fs.readFileSync(audio) })
  const ju = await up.json().catch(() => ({}))
  const assetId = ju?.data?.id
  if (!up.ok || !assetId) throw new Error(`heygen upload ${up.status}: ${JSON.stringify(ju).slice(0, 200)}`)
  // 2) pedir o vídeo
  // API v3 (a v2 foi retirada a 20/11/2026). Os IDs dos looks servem de avatar_id.
  const corpo = { type: 'avatar', avatar_id: L.id, title: titulo.slice(0, 100), audio_asset_id: assetId, engine: { type: motor === 'avatar_iv' ? 'avatar_iv' : 'avatar_iii' }, aspect_ratio: aspecto === '9:16' ? '9:16' : '16:9', resolution: '720p' }
  const r = await fetch(`${API}/v3/videos`, { method: 'POST', headers: { 'x-api-key': chave, 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
  const jr = await r.json().catch(() => ({}))
  const id = (jr?.data ?? jr)?.video_id ?? (jr?.data ?? jr)?.id
  if (!r.ok || !id) throw new Error(`heygen generate ${r.status}: ${JSON.stringify(jr).slice(0, 300)}`)
  console.log(`[gemeo] heygen ${id} (${look}, ${motor})`)
  // 3) esperar
  const fim = Date.now() + esperaMin * 60e3
  while (Date.now() < fim) {
    await new Promise((ok) => setTimeout(ok, 30e3))
    let s = await fetch(`${API}/v3/videos/${id}`, { headers: { 'x-api-key': chave } }).then((x) => x.json()).catch(() => ({}))
    if (!(s?.data ?? s)?.status) s = await fetch(`${API}/v1/video_status.get?video_id=${id}`, { headers: { 'x-api-key': chave } }).then((x) => x.json()).catch(() => ({}))
    const d = s?.data ?? s ?? {}
    d.status = String(d.status || '').toLowerCase()
    if (d.status === 'failed') throw new Error(`heygen ${id} falhou: ${JSON.stringify(d.failure_message || d.error || '').slice(0, 200)}`)
    if (d.status === 'completed' && d.video_url) {
      const v = await fetch(d.video_url)
      if (!v.ok) throw new Error(`descarregar ${id}: ${v.status}`)
      fs.mkdirSync(path.dirname(destino), { recursive: true })
      fs.writeFileSync(destino, Buffer.from(await v.arrayBuffer()))
      return { id, destino }
    }
  }
  throw new Error(`heygen ${id} ainda não acabou ao fim de ${esperaMin} min (retomar com --avatar=<mp4> depois de o descarregar)`)
}

/**
 * Tudo de uma vez: tira o áudio da base, gera o gémeo na HeyGen (ou usa `avatar` já gerado), monta o
 * círculo e passa pelo finalizar() do motor. Devolve o resultado do verificar().
 */
export const CREDITOS_MIN = { avatar_iii: 7, avatar_iv: 20 }
export function estimarGemeo(base, motor = 'avatar_iii') {
  const minutos = Math.round((sondar(base).duracao / 60) * 100) / 100
  return { minutos, creditosEstimados: Math.ceil(minutos * (CREDITOS_MIN[motor] ?? 20)), motor }
}

/** Igual a gemeoApresentador, com objeto: gemeo({ base, saida, marca, look, formato, motor, avatar, estimar }). */
export const gemeo = ({ base, saida, ...o }) => gemeoApresentador(base, saida, o)

export async function gemeoApresentador(base, destino, { formato = 'youtube', marca: idMarca = 'morethanmoney', look = 'mentor', motor = 'avatar_iii', avatar = null, canto = 'inferior-esquerdo', estimar = false } = {}) {
  const est = estimarGemeo(base, motor)
  if (estimar) return { ok: true, estimar: true, ...est }
  let heygenVideoId = null
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gemeo-'))
  try {
    let av = avatar
    if (!av) {
      const mp3 = path.join(tmp, 'voz.mp3')
      ff(['-i', base, '-vn', '-ac', '1', '-ar', '44100', '-b:a', '128k', mp3])
      const g = await heygenGemeo(mp3, path.join(tmp, 'avatar.mp4'), { look, motor, titulo: path.basename(destino) })
      av = g.destino; heygenVideoId = g.id
    }
    const pip = gemeoPip(base, av, path.join(tmp, 'pip.mp4'), { marca: idMarca, canto })
    await finalizar(pip, destino, { formato })
    const v = verificar(destino, formato)
    return { ok: v.ok, saida: destino, heygenVideoId, minutos: est.minutos, creditos: av === avatar ? 0 : est.creditosEstimados, verificar: v }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

// ---------- CLI (chamado pelo motor.mjs gemeo|gemeo-pip, ou directamente) ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [cmd, ...r] = process.argv.slice(2)
  const opt = (k, d) => (r.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d
  const pos = r.filter((a) => !a.startsWith('--'))
  const o = { formato: opt('formato', 'youtube'), marca: opt('marca', 'morethanmoney'), look: opt('look', 'mentor'), motor: opt('motor', 'avatar_iii'), avatar: opt('avatar', null), canto: opt('canto', 'inferior-esquerdo'), estimar: r.includes('--estimar') }
  if (cmd === 'gemeo-pip') {
    const tmp = pos[2] + '.pip.mp4'
    gemeoPip(pos[0], pos[1], tmp, o); await finalizar(tmp, pos[2], { formato: o.formato }); fs.rmSync(tmp, { force: true })
    const v = verificar(pos[2], o.formato)
    console.log(JSON.stringify({ ok: v.ok, saida: pos[2], verificar: v })); process.exit(v.ok ? 0 : 1)
  } else if (cmd === 'gemeo') {
    const res = await gemeoApresentador(pos[0], pos[1], o)
    console.log(JSON.stringify(res)); process.exit(res.ok ? 0 : 1)
  } else {
    console.log('uso: gemeo.mjs gemeo <base> <saida> [--look=mentor] [--motor=avatar_iii] [--avatar=mp4] [--estimar] | gemeo-pip <base> <avatar> <saida>')
  }
}
