// RENDER DOS PROJECTOS DO EDITOR (/estudio → Editor). Importado pelo editor.mjs no Mac.
// Contrato: lib/estudio/projeto.ts. Passos:
//   1. cada clip vira um segmento normalizado (W×H, 30 fps, AAC 48 kHz estéreo): aparar, velocidade
//      (setpts + atempo), zoom/enquadramento, espelho, filtro de cor; imagens com zoompan; fundo
//      desfocado/da marca quando o material não enche o formato;
//   2. junta os segmentos: corte seco = concat, o resto = xfade + acrossfade;
//   3. textos e legendas (karaoke a partir do Whisper de cada take) num .ass queimado com libass;
//      logótipo no canto; música em loop com duck por sidechain; som a -14 LUFS.
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const FORMATOS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '16:9': [1920, 1080] }
export const FILTROS_FF = {
  nenhum: '',
  ouro: 'colorchannelmixer=rr=1.05:gg=0.97:bb=0.82,eq=contrast=1.08:saturation=1.2',
  teal: 'colorchannelmixer=rr=0.9:gg=1.02:bb=1.08,eq=contrast=1.06:saturation=1.1',
  quente: 'colorbalance=rs=.08:gs=.02:bs=-.08,eq=saturation=1.15',
  frio: 'colorbalance=rs=-.06:bs=.08',
  pb: 'hue=s=0,eq=contrast=1.1',
  cinema: 'eq=contrast=1.18:saturation=0.85:brightness=-0.03',
  vivo: 'eq=saturation=1.45:contrast=1.05',
  suave: 'eq=contrast=0.9:brightness=0.04:saturation=0.9',
}
const MARCA = {
  morethanmoney: { fundo: '0x0b0b0c', acento: '&H003CA6D2', claro: '&H006AC4E9' },
  'ricardo-garcia': { fundo: '0x0b0b0c', acento: '&H00B29700', claro: '&H00D8C25A' },
}

function correr(cmd, args) {
  return new Promise((ok, falha) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => { err += d })
    p.on('error', falha)
    p.on('exit', (c) => (c === 0 ? ok() : falha(new Error(`${cmd} saiu com ${c}: ${err.slice(-400)}`))))
  })
}
function sondar(ficheiro) {
  return new Promise((ok) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', ficheiro], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    p.stdout.on('data', (d) => { out += d })
    p.on('exit', () => {
      try {
        const j = JSON.parse(out)
        const v = (j.streams || []).find((s) => s.codec_type === 'video')
        ok({ w: v?.width || 0, h: v?.height || 0, audio: (j.streams || []).some((s) => s.codec_type === 'audio'), dur: Number(j.format?.duration) || 0 })
      } catch { ok({ w: 0, h: 0, audio: false, dur: 0 }) }
    })
  })
}

/** atempo só aceita 0,5–2; velocidades fora disso encadeiam-se. */
const atempo = (v) => (v === 1 ? '' : v < 0.5 ? `atempo=0.5,atempo=${(v / 0.5).toFixed(3)}` : `atempo=${v}`)
export const duracaoClip = (c) => (c.ate - c.de) / c.velocidade

/** Enquadramento: «cover» se o material tem quase o mesmo formato; senão fundo + material inteiro. */
export function filtroEnquadrar(W, H, fonte, fundo, cor, zoom = 1) {
  const cover = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`
  const z = zoom > 1.001 ? `,scale=iw*${zoom.toFixed(3)}:ih*${zoom.toFixed(3)},crop=${W}:${H}` : ''
  const ra = fonte.w && fonte.h ? fonte.w / fonte.h : W / H
  if (Math.abs(ra - W / H) / (W / H) < 0.15) return { simples: true, f: `${cover}${z},setsar=1` }
  const fg = `scale=${W}:${H}:force_original_aspect_ratio=decrease${z ? `,scale=iw*${zoom.toFixed(3)}:ih*${zoom.toFixed(3)}` : ''}`
  if (fundo === 'desfoque') {
    return { simples: false, f: `split=2[bg][fg];[bg]${cover},boxblur=30:3,eq=brightness=-0.12[bgb];[fg]${fg}[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,crop=${W}:${H},setsar=1` }
  }
  const c = fundo === 'marca' ? cor : '0x000000'
  return { simples: true, f: `${fg},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${c},crop=${W}:${H},setsar=1` }
}

function filtroImagemFmt(animacao, dur, W, H) {
  const N = Math.max(2, Math.round(dur * 30))
  const base = `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},setsar=1`
  const meio = { x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' }
  const m = {
    zoom_in: { z: `1+0.18*on/${N}`, ...meio },
    zoom_out: { z: `1.18-0.18*on/${N}`, ...meio },
    pan_esq: { z: '1.15', x: `(iw-iw/zoom)*(1-on/${N})`, y: meio.y },
    pan_dir: { z: '1.15', x: `(iw-iw/zoom)*on/${N}`, y: meio.y },
    sobe: { z: '1.15', x: meio.x, y: `(ih-ih/zoom)*(1-on/${N})` },
  }[animacao]
  if (!m) return `${base},scale=${W}:${H},fps=30`
  return `${base},zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=${N}:s=${W}x${H}:fps=30`
}

/** Um clip → segmento normalizado. `ficheiro` é o material já descarregado. */
export async function renderSegmento(c, ficheiro, saida, { W, H, fundo, cor, volumeGeral = 1 }) {
  const dur = duracaoClip(c)
  const cores = [FILTROS_FF[c.filtro] || '', c.espelhar ? 'hflip' : ''].filter(Boolean).join(',')
  const fim = `${cores ? `,${cores}` : ''},fps=30,format=yuv420p`
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '2']
  let fc
  if (c.media === 'imagem') {
    args.push('-loop', '1', '-t', dur.toFixed(3), '-i', ficheiro, '-f', 'lavfi', '-t', dur.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo')
    fc = `[0:v]${filtroImagemFmt(c.animacao, dur, W, H)}${fim},trim=duration=${dur.toFixed(3)}[v];[1:a]anull[a]`
  } else {
    const info = await sondar(ficheiro)
    const enq = filtroEnquadrar(W, H, info, fundo, cor, c.zoom)
    args.push('-ss', c.de.toFixed(3), '-t', (c.ate - c.de).toFixed(3), '-i', ficheiro)
    const vel = c.velocidade !== 1 ? `setpts=PTS/${c.velocidade},` : ''
    const v = enq.simples ? `[0:v]${vel}${enq.f}${fim}[v]` : `[0:v]${vel}${enq.f.replace(/^split=2\[bg\]\[fg\]/, 'split=2[bg][fg]')}[env];[env]null${fim}[v]`
    const vol = Math.max(0, c.volume * volumeGeral)
    if (info.audio && vol > 0) {
      fc = `${v};[0:a]${[atempo(c.velocidade), `volume=${vol.toFixed(2)}`, 'aresample=48000', 'aformat=channel_layouts=stereo'].filter(Boolean).join(',')}[a]`
    } else {
      args.push('-f', 'lavfi', '-t', dur.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo')
      fc = `${v};[1:a]anull[a]`
    }
  }
  args.push('-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-t', dur.toFixed(3),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', saida)
  await correr('nice', ['-n', '15', 'ffmpeg', ...args])
  return dur
}

/** Filtro que junta os segmentos: corte = concat, transição = xfade + acrossfade. */
export function filtroJuntar(clips, duracoes) {
  const f = []
  let v = '0:v', a = '0:a', acum = duracoes[0]
  for (let i = 1; i < clips.length; i++) {
    const c = clips[i]
    const nv = `vj${i}`, na = `aj${i}`
    if (c.transicao && c.transicao !== 'corte') {
      const d = Math.min(c.trans_dur || 0.4, duracoes[i] / 2, acum / 2)
      f.push(`[${v}][${i}:v]xfade=transition=${c.transicao}:duration=${d.toFixed(3)}:offset=${(acum - d).toFixed(3)}[${nv}]`)
      f.push(`[${a}][${i}:a]acrossfade=d=${d.toFixed(3)}[${na}]`)
      acum += duracoes[i] - d
    } else {
      f.push(`[${v}][${a}][${i}:v][${i}:a]concat=n=2:v=1:a=1[${nv}][${na}]`)
      acum += duracoes[i]
    }
    v = nv; a = na
  }
  return { filtro: f.join(';'), v, a, total: acum }
}

/** Início de cada clip na timeline final (igual a iniciosDosClips do site). */
export function inicios(clips) {
  const out = []
  let t = 0
  clips.forEach((c, i) => {
    const d = duracaoClip(c)
    if (i > 0 && c.transicao !== 'corte') t -= Math.min(c.trans_dur || 0.4, d / 2)
    out.push(Math.max(0, t))
    t += d
  })
  return out
}

const tempoAss = (s) => {
  const x = Math.max(0, s)
  const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), sec = (x % 60).toFixed(2).padStart(5, '0')
  return `${h}:${String(m).padStart(2, '0')}:${sec}`
}
const limparAss = (t) => String(t).replace(/[{}]/g, '').replace(/\n/g, '\\N')

/** O .ass com os textos sobrepostos e as legendas. */
export function gerarAss(projeto, palavrasPorTake, { W, H, marca }) {
  const cor = MARCA[marca] || MARCA.morethanmoney
  const k = W / 1080
  const sz = (n) => Math.round(n * k)
  const estilos = [
    `Style: titulo,Arial,${sz(78)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${sz(5)},${sz(2)},8,${sz(60)},${sz(60)},${sz(230)},1`,
    `Style: legenda,Arial,${sz(52)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${sz(4)},${sz(1)},2,${sz(60)},${sz(60)},${sz(260)},1`,
    `Style: destaque,Arial,${sz(62)},&H00000000,&H00000000,${cor.acento},${cor.acento},-1,0,0,0,100,100,0,0,3,${sz(18)},0,5,${sz(60)},${sz(60)},${sz(60)},1`,
    `Style: cta,Arial,${sz(60)},${cor.claro},${cor.claro},&H00000000,&HB4000000,-1,0,0,0,100,100,0,0,3,${sz(16)},0,2,${sz(60)},${sz(60)},${sz(300)},1`,
    `Style: karaoke,Arial,${sz(64)},${cor.claro},&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${sz(5)},${sz(2)},2,${sz(60)},${sz(60)},${sz(420)},1`,
  ]
  const alinh = { cima: 8, meio: 5, baixo: 2 }
  const ev = []
  for (const x of projeto.textos || []) {
    const an = `\\an${alinh[x.posicao] || 5}`
    if (x.animacao === 'escrever') {
      const palavras = String(x.texto).split(/\s+/).filter(Boolean)
      const passo = Math.min(0.25, (x.fim - x.inicio) / Math.max(1, palavras.length) / 2)
      palavras.forEach((_, i) => {
        const ini = x.inicio + i * passo
        const fim = i === palavras.length - 1 ? x.fim : x.inicio + (i + 1) * passo
        ev.push(`Dialogue: 2,${tempoAss(ini)},${tempoAss(fim)},${x.estilo},,0,0,0,,{${an}}${limparAss(palavras.slice(0, i + 1).join(' '))}`)
      })
      continue
    }
    const anim = x.animacao === 'aparecer' ? '\\fad(300,200)' : x.animacao === 'subir' ? `\\fad(250,200)\\move(${W / 2},${x.posicao === 'cima' ? H * 0.12 + 40 * k : x.posicao === 'baixo' ? H * 0.86 + 40 * k : H / 2 + 40 * k},${W / 2},${x.posicao === 'cima' ? H * 0.12 : x.posicao === 'baixo' ? H * 0.86 : H / 2},0,300)` : ''
    ev.push(`Dialogue: 2,${tempoAss(x.inicio)},${tempoAss(x.fim)},${x.estilo},,0,0,0,,{${an}${anim}}${limparAss(x.texto)}`)
  }
  if (projeto.legendas && projeto.legendas !== 'nenhuma') {
    const ini = inicios(projeto.clips)
    projeto.clips.forEach((c, i) => {
      if (c.media !== 'video' || c.fonte?.tipo !== 'take' || !c.volume) return
      const ws = (palavrasPorTake[c.fonte.ref] || []).filter((w) => w.ini >= c.de - 0.05 && w.fim <= c.ate + 0.05)
      const mapa = (s) => ini[i] + (s - c.de) / c.velocidade
      for (let g = 0; g < ws.length; g += 3) {
        const grupo = ws.slice(g, g + 3)
        const a = mapa(grupo[0].ini), b = mapa(grupo[grupo.length - 1].fim) + 0.08
        const corpo = projeto.legendas === 'karaoke'
          ? grupo.map((w) => `{\\k${Math.max(1, Math.round(((w.fim - w.ini) / c.velocidade) * 100))}}${limparAss(w.w)}`).join(' ')
          : limparAss(grupo.map((w) => w.w).join(' '))
        ev.push(`Dialogue: 1,${tempoAss(a)},${tempoAss(b)},${projeto.legendas === 'karaoke' ? 'karaoke' : 'legenda'},,0,0,0,,${corpo}`)
      }
    })
  }
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${estilos.join('\n')}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${ev.join('\n')}\n`
}

/**
 * Monta o projecto. `ficheiros` mapeia o URL de cada fonte para o ficheiro local; `logo` (opcional)
 * é o PNG da marca. Devolve { duracao }.
 */
export async function renderProjeto(projeto, { pasta, ficheiros, palavras = {}, marca = 'morethanmoney', logo = null, saida }) {
  const [W, H] = FORMATOS[projeto.formato] || FORMATOS['9:16']
  const cor = (MARCA[marca] || MARCA.morethanmoney).fundo
  const clips = (projeto.clips || []).filter((c) => ficheiros[c.fonte?.url])
  if (!clips.length) throw new Error('nenhum clip com material descarregado')
  const segs = [], duracoes = []
  for (const [i, c] of clips.entries()) {
    const s = join(pasta, `seg-${i}.mp4`)
    duracoes.push(await renderSegmento(c, ficheiros[c.fonte.url], s, { W, H, fundo: projeto.fundo, cor, volumeGeral: projeto.volume_geral ?? 1 }))
    segs.push(s)
  }
  const j = filtroJuntar(clips, duracoes)
  const ass = join(pasta, 'textos.ass')
  await writeFile(ass, gerarAss({ ...projeto, clips }, palavras, { W, H, marca }))

  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '2']
  segs.forEach((s) => args.push('-i', s))
  let n = segs.length
  const f = j.filtro ? [j.filtro] : []
  let v = j.v, a = j.a
  const assEsc = ass.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
  f.push(`[${v}]subtitles='${assEsc}'[vs]`); v = 'vs'
  if (projeto.marca_dagua && logo) {
    args.push('-i', logo)
    f.push(`[${n}:v]scale=${Math.round(W * 0.14)}:-1,format=rgba,colorchannelmixer=aa=0.75[lg]`, `[${v}][lg]overlay=W-w-${Math.round(W * 0.04)}:${Math.round(W * 0.04)}[vl]`)
    v = 'vl'; n++
  }
  const mus = projeto.musica && ficheiros[projeto.musica.fonte?.url]
  if (mus) {
    args.push('-stream_loop', '-1', '-i', mus)
    f.push(`[${n}:a]volume=${(projeto.musica.volume ?? 0.25).toFixed(2)},aresample=48000,aformat=channel_layouts=stereo[mu]`)
    if (projeto.musica.duck) {
      f.push(`[${a}]asplit=2[av][sc]`, '[mu][sc]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[md]', '[av][md]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[am]')
    } else f.push(`[${a}][mu]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[am]`)
    a = 'am'; n++
  }
  f.push(`[${a}]loudnorm=I=-14:TP=-1.5:LRA=11[af]`)
  args.push('-filter_complex', f.join(';'), '-map', `[${v}]`, '-map', '[af]', '-t', j.total.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart', saida)
  await correr('nice', ['-n', '15', 'ffmpeg', ...args])
  return { duracao: j.total }
}
