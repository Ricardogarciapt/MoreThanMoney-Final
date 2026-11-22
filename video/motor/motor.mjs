#!/usr/bin/env node
// MOTOR DE VÍDEO ÚNICO da MTM. Todos os motores (editor do /estudio, reels do clone, Conteúdo
// Magnético, reels dos educadores, bootcamps, stories, apresentação, cinemático Remotion) vão buscar
// aqui o que tem de ser igual: formatos, codificação, volume, grades de cor, pastas de saída e o
// PERFIL DE MARCA. Cada produto só decide a sua cena; a renderização final é sempre esta.
//
//   import * as motor from '../../video/motor/motor.mjs'      (no repositório)
//   import * as motor from './motor-video/motor.mjs'          (cópia instalada no Mac/VPS)
//
// Fontes da verdade: formatos.json e marcas/*.json (lidos também por motor.py e lib/video/motor.ts).
// CLI:
//   node video/motor/motor.mjs marcas
//   node video/motor/motor.mjs saida <marca> <produto> <slug>
//   node video/motor/motor.mjs pasta <marca> <produto>
//   node video/motor/motor.mjs finalizar <entrada> <saida> [--formato=reel] [--qualidade=final]
//   node video/motor/motor.mjs verificar <ficheiro> [--formato=reel]
//   node video/motor/motor.mjs gemeo <base.mp4> <saida.mp4> [--formato=youtube] [--look=mentor] [--estimar]   (gemeo.mjs)
//   node video/motor/motor.mjs gemeo-pip <base.mp4> <avatar.mp4> <saida.mp4> [--formato=youtube]
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DIR = path.dirname(fileURLToPath(import.meta.url))
export const CFG = JSON.parse(fs.readFileSync(path.join(DIR, 'formatos.json'), 'utf8'))
export const FPS = CFG.fps

// ---------- marcas ----------
export const MARCAS = Object.fromEntries(
  fs.readdirSync(path.join(DIR, 'marcas'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, 'marcas', f), 'utf8')))
    .map((m) => [m.id, m]),
)

/** Perfil de marca por id ou alias («ricardogarciapt» → ricardo-garcia). Desconhecida → morethanmoney. */
export function marca(id = 'morethanmoney') {
  const k = String(id || '').trim().toLowerCase()
  if (MARCAS[k]) return MARCAS[k]
  const m = Object.values(MARCAS).find((x) => (x.aliases || []).includes(k))
  return m || MARCAS.morethanmoney
}

/** Caminho absoluto de uma fonte da marca (papel: titulo, texto, etiqueta, nota). null se for de sistema. */
export function fonte(idMarca, papel = 'titulo') {
  const f = marca(idMarca).fontes?.[papel]
  return f?.ficheiro ? path.join(DIR, f.ficheiro) : null
}
export const PASTA_FONTES = path.join(DIR, 'fontes')

/** #RRGGBB → &H00BBGGRR (cor ASS/libass). `alfa` 0 = opaco, 255 = transparente. */
export function corAss(hex, alfa = 0) {
  const h = String(hex).replace('#', '')
  return `&H${alfa.toString(16).padStart(2, '0').toUpperCase()}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase()
}
/** #RRGGBB → 0xRRGGBB (cor do ffmpeg). */
export const corFF = (hex) => `0x${String(hex).replace('#', '')}`

// ---------- formatos e codificação ----------
/** Formato por nome ou alias ('9:16', 'story', 'reel'…) → { nome, largura, altura }. */
export function formato(nome = 'reel') {
  const k = String(nome || 'reel').toLowerCase()
  for (const [id, f] of Object.entries(CFG.formatos)) {
    if (id === k || (f.aliases || []).includes(k)) return { nome: id, largura: f.largura, altura: f.altura }
  }
  return { nome: 'reel', ...CFG.formatos.reel }
}

/** Filtro que enche o formato (corta o que sobra) a 30 fps em yuv420p. */
export function enquadrar(nomeFormato = 'reel') {
  const { largura: W, altura: H } = formato(nomeFormato)
  return `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS},format=yuv420p`
}

/** Grade de cor da marca (ou pelo nome) → filtro ffmpeg ('' se nenhuma). */
export function grade(nomeOuMarca) {
  if (CFG.grades[nomeOuMarca] !== undefined) return CFG.grades[nomeOuMarca]
  return CFG.grades[marca(nomeOuMarca).grade] || ''
}
export const GRADES = CFG.grades

const V = CFG.volume
/** Normalização final: -14 LUFS, pico -1,5 dBTP. */
export const LOUDNORM = `loudnorm=I=${V.lufs}:TP=${V.true_peak}:LRA=${V.lra}`

/** Argumentos de vídeo H.264. `qualidade`: mestre | final | rapido | rascunho | intermedio. */
export function codecVideo(qualidade = 'final', { threads } = {}) {
  const q = CFG.qualidade[qualidade] || CFG.qualidade.final
  return ['-c:v', CFG.video.codec, '-preset', q.preset, '-crf', String(q.crf), '-pix_fmt', CFG.video.pix_fmt,
    ...(qualidade === 'intermedio' ? [] : ['-profile:v', CFG.video.profile]),
    ...(threads ? ['-threads', String(threads)] : [])]
}
/** Argumentos de áudio AAC 192k 48 kHz estéreo. */
export function codecAudio() {
  const a = CFG.audio
  return ['-c:a', a.codec, '-b:a', a.bitrate, '-ar', String(a.sample_rate), '-ac', String(a.canais)]
}
/** Vídeo + áudio + faststart: o fim de qualquer comando que escreve um MP4 final. */
export function codificar(qualidade = 'final', opts = {}) {
  return [...codecVideo(qualidade, opts), ...(opts.semAudio ? [] : codecAudio()), '-movflags', '+faststart']
}

// ---------- pastas ----------
const existe = (p) => { try { return fs.existsSync(p) } catch { return false } }
/** Raiz dos renders: MTM_RENDERS > disco externo do Mac > pasta do projeto > video/saida do repo. */
export function raizRenders() {
  if (process.env.MTM_RENDERS) return process.env.MTM_RENDERS
  const s = CFG.saida
  if (existe(path.dirname(s.raiz_mac))) return s.raiz_mac
  if (existe(path.dirname(s.raiz_nuvem))) return s.raiz_nuvem
  return path.join(DIR, '..', 'saida')
}
/** Raiz dos ativos partilhados (stock, música, capturas): MTM_ASSETS > disco externo > pasta do projeto. */
export function raizAtivos() {
  if (process.env.MTM_ASSETS) return process.env.MTM_ASSETS
  const s = CFG.saida
  if (existe(s.ativos_mac)) return s.ativos_mac
  return s.ativos_nuvem
}
export const ativo = (...rel) => path.join(raizAtivos(), ...rel)

const slugar = (s) => String(s || 'video').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'video'

/** Caminho final de um render: <raiz>/<marca>/<produto>/<AAAA-MM-DD>-<slug>.<ext> (cria a pasta). */
export function saida({ marca: m = 'morethanmoney', produto = 'estudio', slug = 'video', ext = 'mp4', data = new Date(), raiz } = {}) {
  const pasta = path.join(raiz || raizRenders(), marca(m).id, slugar(produto))
  fs.mkdirSync(pasta, { recursive: true })
  const dia = (data instanceof Date ? data : new Date(data)).toISOString().slice(0, 10)
  return path.join(pasta, `${dia}-${slugar(slug)}.${ext}`)
}
/** Chave no Storage para o mesmo render: renders/<marca>/<produto>/<ficheiro>. */
export function chaveStorage({ marca: m = 'morethanmoney', produto = 'estudio', ficheiro }) {
  return [CFG.saida.prefixo_storage, marca(m).id, slugar(produto), path.basename(ficheiro)].join('/')
}

// ---------- execução ----------
export function correr(args, { nice = 15, stdin = 'ignore' } = {}) {
  return new Promise((ok, falha) => {
    const cmd = nice ? 'nice' : 'ffmpeg'
    const p = spawn(cmd, nice ? ['-n', String(nice), 'ffmpeg', ...args] : args, { stdio: [stdin, 'inherit', 'inherit'] })
    p.on('error', falha)
    p.on('exit', (c) => (c === 0 ? ok() : falha(new Error(`ffmpeg saiu com ${c}`))))
  })
}

/**
 * Passo final comum: enquadra no formato, normaliza o som a -14 LUFS e codifica com o perfil da casa.
 * Usa-se quando um motor produz um vídeo «cru» (ex.: Remotion, HeyGen) e é preciso o mestre canónico.
 */
export async function finalizar(entrada, destino, { formato: f = 'reel', qualidade = 'final', audio = null, audioDesde = 0, nice = 15 } = {}) {
  const info = sondar(entrada)
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', entrada]
  // o áudio externo fica com a duração do vídeo (e começa em audioDesde s), para o -14 LUFS medir o troço certo
  if (audio) args.push(...(audioDesde ? ['-ss', String(audioDesde)] : []), '-t', info.duracao.toFixed(3), '-i', audio)
  const temAudio = audio || info.audio
  args.push('-vf', enquadrar(f))
  if (temAudio) args.push('-af', LOUDNORM)
  args.push('-map', '0:v:0')
  if (temAudio) args.push('-map', audio ? '1:a:0' : '0:a:0', '-shortest')
  // 22/11 (Ricardo, regras novas do Instagram sobre conteúdo IA): o ficheiro final sai sem metadados herdados
  // (nada de etiquetas de ferramentas/IA nos átomos do mp4) — o vídeo vive de fotos e voz reais montadas aqui.
  args.push('-map_metadata', '-1', '-map_chapters', '-1')
  args.push(...codificar(qualidade, { semAudio: !temAudio }), destino)
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  await correr(args, { nice })
  return destino
}

/** ffprobe síncrono: { largura, altura, fps, duracao, audio }. */
export function sondar(ficheiro) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate:format=duration', '-of', 'json', ficheiro]).toString())
  const v = (j.streams || []).find((s) => s.codec_type === 'video') || {}
  const [n, d] = String(v.r_frame_rate || '0/1').split('/').map(Number)
  return { largura: v.width, altura: v.height, fps: d ? Math.round((n / d) * 100) / 100 : 0, duracao: Number(j.format?.duration || 0), audio: (j.streams || []).some((s) => s.codec_type === 'audio') }
}

/** Mede o volume integrado (LUFS) com o ebur128 do ffmpeg. */
export function medirLufs(ficheiro) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', ficheiro, '-filter_complex', 'ebur128=framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 << 20 })
  return lufsDe(String(r.stderr || ''))
}
const lufsDe = (txt) => { const m = [...txt.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop(); return m ? Number(m[1]) : null }

/** Confere um render contra o padrão: formato, 30 fps e -14 LUFS (±1,5). Devolve { ok, problemas, ... }. */
export function verificar(ficheiro, nomeFormato = null) {
  const i = sondar(ficheiro)
  const problemas = []
  if (nomeFormato) {
    const f = formato(nomeFormato)
    if (i.largura !== f.largura || i.altura !== f.altura) problemas.push(`resolução ${i.largura}×${i.altura}, devia ser ${f.largura}×${f.altura}`)
  }
  if (Math.abs(i.fps - FPS) > 0.5) problemas.push(`${i.fps} fps, devia ser ${FPS}`)
  const lufs = i.audio ? medirLufs(ficheiro) : null
  if (i.audio && lufs !== null && Math.abs(lufs - V.lufs) > 1.5) problemas.push(`som a ${lufs} LUFS, devia ser ${V.lufs}`)
  return { ok: problemas.length === 0, problemas, ...i, lufs }
}

// ---------- CLI ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [cmd, ...r] = process.argv.slice(2)
  const opt = (k, d) => (r.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d
  const pos = r.filter((a) => !a.startsWith('--'))
  if (cmd === 'marcas') {
    for (const m of Object.values(MARCAS)) console.log(`${m.id.padEnd(16)} ${m.arroba.padEnd(20)} destaque ${m.cores.destaque}  grade ${m.grade}${m.daCasa ? '' : '  (cliente)'}`)
  } else if (cmd === 'pasta') {
    const d = path.dirname(saida({ marca: pos[0], produto: pos[1] }))
    console.log(d)
  } else if (cmd === 'saida') {
    console.log(saida({ marca: pos[0], produto: pos[1], slug: pos[2] }))
  } else if (cmd === 'finalizar') {
    await finalizar(pos[0], pos[1], { formato: opt('formato', 'reel'), qualidade: opt('qualidade', 'final') })
    console.log(JSON.stringify(verificar(pos[1], opt('formato', 'reel'))))
  } else if (cmd === 'gemeo' || cmd === 'gemeo-pip') {
    // gemeo.mjs importa este módulo: corre noutro processo para não haver import circular
    const c = spawnSync(process.execPath, [path.join(DIR, 'gemeo.mjs'), cmd, ...r], { stdio: 'inherit' })
    process.exit(c.status ?? 1)
  } else if (cmd === 'verificar') {
    const v = verificar(pos[0], opt('formato', null))
    console.log(JSON.stringify(v, null, 2))
    process.exit(v.ok ? 0 : 1)
  } else {
    console.log('uso: motor.mjs marcas | pasta <marca> <produto> | saida <marca> <produto> <slug> | finalizar <in> <out> [--formato=reel] [--qualidade=final] | verificar <f> [--formato=reel] | gemeo <base> <saida> [--look=mentor] [--estimar] | gemeo-pip <base> <avatar> <saida>')
  }
}
