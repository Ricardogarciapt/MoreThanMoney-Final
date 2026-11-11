#!/usr/bin/env node
/**
 * MOTOR DE RENDER do MTM Conteúdo Magnético — as fases 2 a 6 da especificação «Magnetic.IA PRO
 * MAX», feitas com ffmpeg em vez de MoviePy/ImageMagick, e FORA da Vercel (VPS ou Mac).
 *
 *   Fase 2  voz        edge-tts (pt-PT, grátis) → gTTS como reserva
 *   Fase 3  visual     cartão da marca (desenhado pelo site) · foto do apresentador · vídeo Pexels
 *                      (lip-sync de avatar fica de fora: precisa de GPU; ver LEIA-ME)
 *   Fase 4  b-roll     API do Pexels (PEXELS_API_KEY, grátis), vertical
 *   Fase 5  tempos     palavra a palavra, proporcional ao comprimento de cada palavra dentro da
 *                      duração REAL da fala de cada segmento (sem Whisper: poupa RAM e minutos)
 *   Fase 6  montagem   zoom lento por segmento, legendas ASS em karaoke, efeitos nos cortes
 *                      (boom/whoosh/click sintetizados) e música com ducking (sidechain)
 *
 * Sem dependências npm: Node 18+ e ffmpeg/ffprobe no PATH.
 *
 * Variáveis:
 *   SITE_URL         https://www.morethanmoney.pt
 *   CRON_SECRET      o mesmo da Vercel (é a chave da porta /api/conteudo-magnetico/motor)
 *   MOTOR_NOME       vps | mac (aparece no trabalho)
 *   PEXELS_API_KEY   opcional — sem ela, os segmentos b_roll usam o cartão da marca
 *   MUSICA_DIR       opcional — pasta com .mp3 livres de direitos; sem ela, não há música
 *   TTS_VOZ          pt-PT-DuarteNeural (omissão) · pt-PT-RaquelNeural
 *   FISH_API_KEY + FISH_VOICE_RICARDO   opcional — a marca ricardo-garcia fala com o clone de voz
 *                    do Ricardo (Fish Audio); se falhar, cai para o edge-tts. FISH_MODEL opcional.
 *   FFMPEG_THREADS   2 (omissão). No Mac, 2 chega: o Mac tem 16 GB e vive com o swap cheio.
 *   INTERVALO_S      20 — de quanto em quanto tempo pergunta se há trabalho
 *   TTS_TESTE=1      só para testes sem rede: fala substituída por silêncio
 *
 * Uso:  node motor.mjs            (fica a correr, um trabalho de cada vez)
 *       node motor.mjs --uma      (faz um trabalho e sai)
 *       node motor.mjs --local guiao.json saida.mp4   (render de um guião local, sem fila)
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SITE = (process.env.SITE_URL || 'https://www.morethanmoney.pt').replace(/\/+$/, '')
const SEGREDO = process.env.CRON_SECRET || ''
// No Mac o CRON_SECRET é o do cortador; o site aceita também o segredo dos workers.
const SEGREDO_WORKER = process.env.LMS_CAPTION_WORKER_SECRET || ''
const AUTH = {
  ...(SEGREDO ? { authorization: `Bearer ${SEGREDO}` } : {}),
  ...(SEGREDO_WORKER ? { 'x-caption-secret': SEGREDO_WORKER } : {}),
}
const MOTOR = process.env.MOTOR_NOME || os.hostname()
const THREADS = String(process.env.FFMPEG_THREADS || '2')
const VOZ = process.env.TTS_VOZ || 'pt-PT-DuarteNeural'
const INTERVALO = Number(process.env.INTERVALO_S || 20) * 1000
const W = 1080
const H = 1920
const FPS = 30

const log = (...a) => console.log(new Date().toISOString(), '[cm-motor]', ...a)

function correr(cmd, args, { silencioso = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => {
      err += d
      if (err.length > 20000) err = err.slice(-10000)
    })
    p.on('error', reject)
    p.on('close', (c) => {
      if (c === 0) resolve(out)
      else reject(new Error(`${cmd} saiu com ${c}: ${silencioso ? err.slice(-800) : err}`))
    })
  })
}
const ff = (args) => correr('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])

async function duracao(f) {
  const out = await correr('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f])
  return Number(String(out).trim()) || 0
}

// ── Fase 2: voz ────────────────────────────────────────────────────────────────────────────────
async function fishRicardo(texto, tmp) {
  const chave = process.env.FISH_API_KEY
  const voz = process.env.FISH_VOICE_RICARDO
  if (!chave || !voz) return false
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const r = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', model: process.env.FISH_MODEL || 'speech-1.6' },
      body: JSON.stringify({ text: texto, reference_id: voz, format: 'mp3', mp3_bitrate: 128, normalize: true, latency: 'normal' }),
      signal: AbortSignal.timeout(60_000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }))
    if (r.ok) {
      await fs.writeFile(tmp, Buffer.from(await r.arrayBuffer()))
      return true
    }
    log(`Fish ${r.status} (tentativa ${tentativa}):`, String(await r.text()).slice(0, 160))
    await new Promise((ok) => setTimeout(ok, 3000 * tentativa))
  }
  return false
}

async function falar(texto, destino, marcaId) {
  if (process.env.TTS_TESTE === '1') {
    const seg = Math.max(1.6, texto.split(/\s+/).length / 2.7)
    await ff(['-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', seg.toFixed(2), destino])
    return
  }
  const tmp = destino.replace(/\.wav$/, '.mp3')
  // A marca do Ricardo fala com a voz dele (clone Fish); se não houver chave ou falhar, edge-tts.
  if (marcaId === 'ricardo-garcia' && (await fishRicardo(texto, tmp))) {
    await ff(['-i', tmp, '-af', 'apad=pad_dur=0.25', '-ar', '44100', '-ac', '1', destino])
    return
  }
  try {
    await correr('edge-tts', ['--voice', VOZ, '--rate', '+6%', '--text', texto, '--write-media', tmp])
  } catch (e) {
    log('edge-tts falhou, a tentar gTTS:', e.message.slice(0, 120))
    await correr('gtts-cli', [texto, '--lang', 'pt', '--tld', 'pt', '--output', tmp])
  }
  // Normaliza para wav mono 44.1k e acrescenta 0,25 s de respiro no fim.
  await ff(['-i', tmp, '-af', 'apad=pad_dur=0.25', '-ar', '44100', '-ac', '1', destino])
}

// ── Fase 3/4: visual de cada segmento ──────────────────────────────────────────────────────────
async function cartao(trabalho, seg, i, destino) {
  const r = await fetch(`${SITE}/api/conteudo-magnetico/imagem`, {
    method: 'POST',
    headers: { ...AUTH, 'content-type': 'application/json' },
    body: JSON.stringify({
      formato: 'reel',
      marcaResolvida: trabalho.marca,
      lamina: { papel: i === 0 ? 'capa' : 'meio', antetitulo: '', titulo: seg.texto_ecra, destaque: '', corpo: '' },
      // Sem contador «02 / 03» nem assinatura: num vídeo não fazem sentido (a arroba vai nas legendas).
      indice: 0,
      total: 1,
      fundo_url: i === 0 ? trabalho.fundo_url : null,
      aviso: false,
      assinatura: false,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!r.ok) throw new Error(`cartão ${i + 1}: HTTP ${r.status}`)
  await fs.writeFile(destino, Buffer.from(await r.arrayBuffer()))
}

async function baixar(url, destino, limite = 60_000_000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(90_000) })
  if (!r.ok) throw new Error(`download HTTP ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.byteLength > limite) throw new Error('ficheiro grande demais')
  await fs.writeFile(destino, buf)
}

async function pexels(busca, destino) {
  const chave = process.env.PEXELS_API_KEY
  if (!chave || !busca) return false
  const u = `https://api.pexels.com/videos/search?query=${encodeURIComponent(busca)}&orientation=portrait&per_page=6&size=medium`
  const r = await fetch(u, { headers: { Authorization: chave }, signal: AbortSignal.timeout(20_000) })
  if (!r.ok) return false
  const j = await r.json()
  for (const v of j.videos || []) {
    const ficheiros = (v.video_files || [])
      .filter((f) => f.file_type === 'video/mp4' && f.height >= 1280 && f.height > f.width)
      .sort((a, b) => a.height - b.height)
    if (ficheiros[0]) {
      await baixar(ficheiros[0].link, destino)
      return true
    }
  }
  return false
}

/** Zoom lento (Ken Burns) numa imagem → clip de vídeo sem som. */
async function clipDeImagem(img, dur, zoom, destino) {
  const frames = Math.max(1, Math.round(dur * FPS))
  const passo = zoom === 'zoom_in' ? 0.0016 : zoom === 'close_up' ? 0.0006 : 0.0008
  const inicio = zoom === 'close_up' ? 1.18 : 1.0
  const z = `min(${inicio}+${passo}*on,${inicio + 0.25})`
  await ff([
    '-loop', '1', '-i', img,
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},format=yuv420p`,
    '-frames:v', String(frames),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', THREADS,
    destino,
  ])
}

async function clipDeVideo(video, dur, destino, { inicio = 0, proprio = false } = {}) {
  // Clip do próprio: começa noutro ponto de cada vez que se repete e o recorte vertical sobe um
  // pouco (a cara fica no terço de cima), sem escurecer.
  let ss = 0
  if (inicio > 0) {
    const total = await duracao(video).catch(() => 0)
    ss = total > dur + 0.5 ? inicio % Math.max(0.1, total - dur) : 0
  }
  const recorte = proprio ? `crop=${W}:${H}:(iw-${W})/2:(ih-${H})*0.35` : `crop=${W}:${H}`
  const cor = proprio ? 'eq=saturation=1.05' : 'eq=brightness=-0.08:saturation=1.1'
  await ff([
    '-stream_loop', '-1', ...(ss > 0 ? ['-ss', ss.toFixed(3)] : []), '-i', video, '-t', dur.toFixed(3),
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,${recorte},fps=${FPS},${cor},format=yuv420p`,
    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', THREADS,
    destino,
  ])
}

// ── efeitos sonoros (sintetizados: nada para licenciar) ────────────────────────────────────────
async function sfx(tipo, destino) {
  const src = {
    boom: "sine=f=48:d=1.1,volume=2.2,afade=t=out:st=0.05:d=1.0",
    whoosh: 'anoisesrc=d=0.55:c=pink:a=0.6,highpass=f=500,lowpass=f=5000,afade=t=in:d=0.25,afade=t=out:st=0.3:d=0.25',
    click: 'sine=f=1700:d=0.06,afade=t=out:st=0.01:d=0.05',
  }[tipo]
  if (!src) return false
  await ff(['-f', 'lavfi', '-i', src, '-ar', '44100', '-ac', '1', destino])
  return true
}

// ── Fase 5: legendas ASS (karaoke palavra a palavra) ───────────────────────────────────────────
function corAss(hex, alfa = '00') {
  const h = String(hex || '#ffffff').replace('#', '')
  return `&H${alfa}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase()
}
const tempoAss = (s) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = (s % 60).toFixed(2).padStart(5, '0')
  return `${h}:${String(m).padStart(2, '0')}:${sec}`
}
const escaparAss = (t) => t.replace(/\\/g, '').replace(/[{}]/g, '')

export function legendas(segmentos, marca) {
  const destaque = corAss(marca.destaque2 || marca.destaque || '#D2A63C')
  const linhas = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 0', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Primary = palavra já dita (cor da marca); Secondary = ainda por dizer (branco).
    `Style: palavra_a_palavra,Anton,96,${destaque},&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,1,0,1,6,2,2,80,80,430,1`,
    `Style: impacto,Anton,128,${destaque},&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,1,0,1,8,3,2,70,70,520,1`,
    `Style: simples,Anton,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,1,0,1,5,2,2,80,80,430,1`,
    `Style: assinatura,Anton,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,1,0,1,3,0,3,60,60,70,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]
  let fim = 0
  for (const s of segmentos) {
    const palavras = s.fala.split(/\s+/).filter(Boolean)
    const util = Math.max(0.3, s.duracao - 0.25) // o respiro do fim não tem palavras
    const pesos = palavras.map((p) => Math.max(2, p.replace(/[^\p{L}\p{N}]/gu, '').length) + 1.5)
    const soma = pesos.reduce((a, b) => a + b, 0)
    const porLinha = s.legenda_estilo === 'impacto' ? 2 : 3
    let t = s.inicio
    for (let k = 0; k < palavras.length; k += porLinha) {
      const grupo = palavras.slice(k, k + porLinha)
      const dur = grupo.map((_, j) => (pesos[k + j] / soma) * util)
      const ini = t
      const total = dur.reduce((a, b) => a + b, 0)
      const texto =
        s.legenda_estilo === 'simples'
          ? escaparAss(grupo.join(' ').toUpperCase())
          : grupo.map((p, j) => `{\\k${Math.max(1, Math.round(dur[j] * 100))}}${escaparAss(p.toUpperCase())}`).join(' ')
      const pop = s.legenda_estilo === 'impacto' ? '{\\fscx80\\fscy80\\t(0,120,\\fscx100\\fscy100)}' : ''
      linhas.push(`Dialogue: 0,${tempoAss(ini)},${tempoAss(ini + total)},${s.legenda_estilo},,0,0,0,,${pop}${texto}`)
      t += total
    }
    fim = s.inicio + s.duracao
  }
  linhas.push(`Dialogue: 0,${tempoAss(0)},${tempoAss(fim)},assinatura,,0,0,0,,${escaparAss(marca.arroba || '')}`)
  return linhas.join('\n') + '\n'
}

function escolherMusica(termo) {
  const dir = process.env.MUSICA_DIR
  if (!dir || !existsSync(dir)) return null
  const todas = readdirSync(dir).filter((f) => /\.(mp3|m4a|wav)$/i.test(f))
  if (!todas.length) return null
  const palavras = String(termo || '').toLowerCase().split(/\W+/).filter(Boolean)
  const pontos = (f) => palavras.filter((p) => f.toLowerCase().includes(p)).length
  todas.sort((a, b) => pontos(b) - pontos(a) || Math.random() - 0.5)
  return path.join(dir, todas[0])
}

// ── Fase 6: montagem ───────────────────────────────────────────────────────────────────────────
export async function render(trabalho, saida) {
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-'))
  try {
    const segs = trabalho.guiao?.reel?.segmentos || []
    if (!segs.length) throw new Error('guião sem segmentos')

    // A fonte das legendas vem do próprio site — a mesma das peças.
    const fontes = path.join(pasta, 'fontes')
    await fs.mkdir(fontes)
    await baixar(`${SITE}/fonts/Anton-Regular.ttf`, path.join(fontes, 'Anton-Regular.ttf'), 2_000_000).catch(() => log('sem fonte Anton: legendas na fonte do sistema'))

    let fotoApresentador = null
    if (trabalho.fundo_url) {
      fotoApresentador = path.join(pasta, 'apresentador.img')
      await baixar(trabalho.fundo_url, fotoApresentador, 10_000_000).catch(() => (fotoApresentador = null))
    }

    const linha = []
    let t = 0
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]
      const voz = path.join(pasta, `voz-${i}.wav`)
      await falar(s.fala, voz, trabalho.marca?.id)
      const dur = await duracao(voz)
      const clip = path.join(pasta, `clip-${i}.mp4`)
      let feito = false
      // Media gerada fora (ArtCraft, Higgsfield… via MCP), já copiada para o nosso Storage.
      if (s.media_url) {
        const ehVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(s.media_url)
        const bruto = path.join(pasta, `media-${i}.${ehVideo ? 'mp4' : 'img'}`)
        try {
          await baixar(s.media_url, bruto, ehVideo ? 250_000_000 : 15_000_000)
          if (ehVideo) await clipDeVideo(bruto, dur, clip, { inicio: Number(s.media_inicio) || 0, proprio: /\/estudio\//.test(s.media_url) })
          else await clipDeImagem(bruto, dur, s.zoom, clip)
          feito = true
        } catch (e) {
          log(`media do segmento ${i + 1} falhou (${e.message}): sigo sem ela`)
        }
      }
      if (!feito && s.visual === 'b_roll' && s.b_roll_busca) {
        const bruto = path.join(pasta, `broll-${i}.mp4`)
        if (await pexels(s.b_roll_busca, bruto).catch(() => false)) {
          await clipDeVideo(bruto, dur, clip)
          feito = true
        }
      }
      if (!feito && s.visual === 'apresentador' && fotoApresentador) {
        await clipDeImagem(fotoApresentador, dur, s.zoom, clip)
        feito = true
      }
      if (!feito) {
        const png = path.join(pasta, `cartao-${i}.png`)
        await cartao(trabalho, s, i, png)
        await clipDeImagem(png, dur, s.zoom, clip)
      }
      linha.push({ ...s, voz, clip, inicio: t, duracao: dur })
      log(`segmento ${i + 1}/${segs.length} (${s.visual}, ${dur.toFixed(1)}s)`)
      t += dur
    }

    // Vídeo: concatenação sem re-codificar (todos os clips saem com os mesmos parâmetros).
    const lista = path.join(pasta, 'lista.txt')
    await fs.writeFile(lista, linha.map((s) => `file '${s.clip}'`).join('\n'))
    const video = path.join(pasta, 'video.mp4')
    await ff(['-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', video])

    // Áudio: voz contínua + efeitos nos cortes + música com ducking.
    const entradas = []
    const filtros = []
    linha.forEach((s, k) => {
      entradas.push('-i', s.voz)
    })
    filtros.push(`${linha.map((_, k) => `[${k}:a]`).join('')}concat=n=${linha.length}:v=0:a=1[voz]`)
    let n = linha.length
    const efeitos = []
    for (const s of linha) {
      const f = path.join(pasta, `sfx-${s.id}.wav`)
      if (s.sfx && s.sfx !== 'nenhum' && (await sfx(s.sfx, f))) {
        entradas.push('-i', f)
        const atraso = Math.max(0, Math.round((s.inicio - (s.sfx === 'whoosh' ? 0.2 : 0)) * 1000))
        filtros.push(`[${n}:a]adelay=${atraso}|${atraso},volume=0.55[e${n}]`)
        efeitos.push(`[e${n}]`)
        n++
      }
    }
    const musica = escolherMusica(trabalho.guiao?.reel?.musica_termo)
    filtros.push(`[voz]asplit=2[vozA][vozB]`)
    let base = '[vozA]'
    if (musica) {
      const db = Number(trabalho.guiao?.reel?.musica_volume_db ?? -24)
      entradas.push('-stream_loop', '-1', '-i', musica)
      filtros.push(`[${n}:a]volume=${db}dB,aformat=channel_layouts=mono:sample_rates=44100,atrim=0:${t.toFixed(2)},afade=t=out:st=${Math.max(0, t - 1.5).toFixed(2)}:d=1.5[mus]`)
      filtros.push(`[mus][vozB]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[musd]`)
      base = '[vozA][musd]'
      n++
    } else {
      filtros.push('[vozB]anullsink')
    }
    const nMix = base.split('][').length + efeitos.length
    filtros.push(`${base}${efeitos.join('')}amix=inputs=${nMix}:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`)
    const audio = path.join(pasta, 'audio.m4a')
    await ff([...entradas, '-filter_complex', filtros.join(';'), '-map', '[aout]', '-ar', '44100', '-c:a', 'aac', '-b:a', '160k', audio])

    const ass = path.join(pasta, 'legendas.ass')
    await fs.writeFile(ass, legendas(linha, trabalho.marca || {}))
    await ff([
      '-i', video, '-i', audio,
      '-vf', `ass=${ass}:fontsdir=${fontes}`,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-threads', THREADS, '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', '-shortest', '-movflags', '+faststart',
      saida,
    ])
    return { duracao: t }
  } finally {
    await fs.rm(pasta, { recursive: true, force: true }).catch(() => {})
  }
}

// ── a fila ─────────────────────────────────────────────────────────────────────────────────────
async function api(metodo, corpo) {
  const r = await fetch(`${SITE}/api/conteudo-magnetico/motor?motor=${encodeURIComponent(MOTOR)}`, {
    method: metodo,
    headers: { ...AUTH, 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`motor ${metodo}: HTTP ${r.status} ${j.erro || ''}`)
  return j
}

async function umTrabalho() {
  const j = await api('GET')
  if (!j.trabalho) return false
  const tr = j.trabalho
  log(`trabalho ${tr.id}: ${tr.guiao?.reel?.segmentos?.length ?? 0} segmentos`)
  const saida = path.join(os.tmpdir(), `cm-${tr.id}.mp4`)
  try {
    const { duracao: d } = await render(tr, saida)
    const bytes = await fs.readFile(saida)
    const up = await fetch(j.upload.url, {
      method: 'PUT',
      headers: { 'content-type': 'video/mp4', 'x-upsert': 'true' },
      body: bytes,
      signal: AbortSignal.timeout(180_000),
    })
    if (!up.ok) throw new Error(`upload HTTP ${up.status}: ${(await up.text()).slice(0, 200)}`)
    await api('POST', { id: tr.id, estado: 'pronto' })
    log(`pronto ${tr.id} (${d.toFixed(1)}s, ${(bytes.byteLength / 1e6).toFixed(1)} MB)`)
  } catch (e) {
    log(`erro ${tr.id}:`, e.message)
    await api('POST', { id: tr.id, estado: 'erro', erro: e.message }).catch(() => {})
  } finally {
    await fs.rm(saida, { force: true }).catch(() => {})
  }
  return true
}

async function principal() {
  const args = process.argv.slice(2)
  if (args[0] === '--local') {
    const g = JSON.parse(await fs.readFile(args[1], 'utf8'))
    const tr = g.guiao ? g : { guiao: g, marca: g.marcaResolvida || { arroba: '@morethanmoney.pt', destaque: '#D2A63C', destaque2: '#E9C46A', id: 'morethanmoney' }, fundo_url: g.fundo_url || null }
    const r = await render(tr, args[2] || 'saida.mp4')
    log(`feito: ${args[2] || 'saida.mp4'} (${r.duracao.toFixed(1)}s)`)
    return
  }
  if (!SEGREDO && !SEGREDO_WORKER) throw new Error('falta CRON_SECRET ou LMS_CAPTION_WORKER_SECRET')
  if (args.includes('--uma')) {
    await umTrabalho()
    return
  }
  log(`a ouvir ${SITE} como «${MOTOR}» (threads=${THREADS})`)
  for (;;) {
    let houve = false
    try {
      houve = await umTrabalho()
    } catch (e) {
      log('fila:', e.message)
    }
    if (!houve) await new Promise((r) => setTimeout(r, INTERVALO))
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
