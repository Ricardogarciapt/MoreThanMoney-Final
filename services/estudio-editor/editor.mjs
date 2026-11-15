#!/usr/bin/env node
// EDITOR DO ESTÚDIO — corre no Mac. Pega nos takes que o Ricardo marcou como «Escolher» em
// /estudio, edita-os e devolve o reel pronto, que entra na fila do Instagram como rascunho
// (o AG-OPERADOR aprova). Fala só com https://www.morethanmoney.pt/api/estudio/motor.
//
// Edição base (sempre, sem custo): corta o silêncio do início, enquadra em 1080x1920,
// 30 fps, som normalizado a -14 LUFS, H.264 com faststart. Os ATIVOS que o Ricardo ligou ao guião
// (separador «Ativos» do /estudio) entram por cima do take no segmento certo — tempos estimados pelo
// número de palavras de cada fala — e um áudio carregado vira música de fundo baixa.
// Se ESTUDIO_EDIT_CMD estiver definido, corre esse comando primeiro, com {in} {out} {guiao}
// substituídos (o guião JSON leva os ativos já descarregados em `ativos[].ficheiro`); se falhar,
// cai para a edição base. Um trabalho de cada vez e com prioridade baixa: o Mac não aguenta mais
// de 2 processos pesados.
//
// Variáveis: CRON_SECRET e/ou LMS_CAPTION_WORKER_SECRET (pelo menos um), MTM_SITE (omissão https://www.morethanmoney.pt),
//            ESTUDIO_EDIT_CMD (opcional), ESTUDIO_TRANSCREVER_CMD (opcional: «cmd {in} {out}» que
//            escreve { palavras: [{w,ini,fim}], lingua }), ESTUDIO_INTERVALO_S (omissão 120).
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderProjeto } from './projeto.mjs'

const SITE = (process.env.MTM_SITE || 'https://www.morethanmoney.pt').replace(/\/$/, '')
const SEGREDO = process.env.CRON_SECRET?.trim()
const INTERVALO = Math.max(30, Number(process.env.ESTUDIO_INTERVALO_S) || 120) * 1000
const SEGREDO_WORKER = process.env.LMS_CAPTION_WORKER_SECRET?.trim()
// Importado (testes) não arranca o ciclo nem exige segredos.
const principal = import.meta.url === `file://${process.argv[1]}`
if (principal && !SEGREDO && !SEGREDO_WORKER) { console.error('Falta CRON_SECRET ou LMS_CAPTION_WORKER_SECRET'); process.exit(1) }

const auth = {
  ...(SEGREDO ? { authorization: `Bearer ${SEGREDO}` } : {}),
  ...(SEGREDO_WORKER ? { 'x-caption-secret': SEGREDO_WORKER } : {}),
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toISOString(), ...a)

function correr(cmd, args, opts = {}) {
  return new Promise((ok, falha) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], ...opts })
    p.on('error', falha)
    p.on('exit', (c) => (c === 0 ? ok() : falha(new Error(`${cmd} saiu com ${c}`))))
  })
}

const ENQUADRAR = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p'

/**
 * Animação de uma imagem pelo contexto do segmento onde entra: o zoom pedido no guião manda; números,
 * preços e percentagens aproximam (o olho vai ao número); o gancho aproxima; b-roll desliza; o resto
 * alterna para não repetir o mesmo movimento duas vezes seguidas.
 */
export function animacaoDe(ativo, seg = {}, i = 0, k = 0) {
  if (ativo.tipo !== 'imagem') return 'sem'
  if (ativo.animacao && ativo.animacao !== 'auto') return ativo.animacao
  const z = String(seg.zoom || '').toLowerCase()
  if (/out|afast/.test(z)) return 'zoom_out'
  if (/in|aprox|punch/.test(z)) return 'zoom_in'
  const texto = `${seg.fala || ''} ${seg.texto_ecra || ''}`
  if (i === 0 || /\d|%|€|\$/.test(texto)) return 'zoom_in'
  if (seg.visual === 'b_roll') return k % 2 ? 'pan_dir' : 'pan_esq'
  return ['zoom_in', 'pan_esq', 'zoom_out', 'sobe', 'pan_dir'][k % 5]
}

/** Filtro ffmpeg que anima uma imagem parada durante `dur` segundos (Ken Burns a 30 fps, com fade). */
export function filtroImagem(animacao, dur) {
  const N = Math.max(2, Math.round(dur * 30))
  const base = 'scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,setsar=1'
  const meio = { x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' }
  const m = {
    zoom_in: { z: `1+0.18*on/${N}`, ...meio },
    zoom_out: { z: `1.18-0.18*on/${N}`, ...meio },
    pan_esq: { z: '1.15', x: `(iw-iw/zoom)*(1-on/${N})`, y: meio.y },
    pan_dir: { z: '1.15', x: `(iw-iw/zoom)*on/${N}`, y: meio.y },
    sobe: { z: '1.15', x: meio.x, y: `(ih-ih/zoom)*(1-on/${N})` },
  }[animacao]
  const fade = `format=yuva420p,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=${Math.max(0, dur - 0.25).toFixed(2)}:d=0.25:alpha=1`
  if (!m) return `${base},scale=1080:1920,fps=30,trim=duration=${dur.toFixed(2)},${fade}`
  return `${base},zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=${N}:s=1080x1920:fps=30,trim=duration=${dur.toFixed(2)},${fade}`
}

/** Onde cada ativo visual entra: [{ ficheiro, tipo, ini, fim }] em segundos do vídeo final. */
export function planoAtivos(segmentos, ativos, duracao) {
  const visuais = ativos.filter((a) => a.tipo === 'imagem' || a.tipo === 'video')
  if (!visuais.length || !(duracao > 1)) return []
  const pesos = segmentos.length ? segmentos.map((s) => Math.max(1, String(s.fala || '').split(/\s+/).filter(Boolean).length)) : [1]
  const total = pesos.reduce((a, b) => a + b, 0)
  let t = 0
  const janelas = pesos.map((p) => { const ini = t; t += (p / total) * duracao; return { ini, fim: t } })
  const ocupado = new Set()
  const plano = []
  const por = (a, i) => {
    const j = janelas[i]
    const ini = j.ini + 0.3
    const fim = Math.min(j.fim, ini + 3.5)
    if (fim - ini < 0.8) return
    ocupado.add(i)
    plano.push({ ficheiro: a.ficheiro, tipo: a.tipo, ini: +ini.toFixed(2), fim: +fim.toFixed(2), animacao: animacaoDe(a, segmentos[i], i, plano.length) })
  }
  // 1) os que o Ricardo ligou a um momento; 2) os soltos vão para os segmentos de b-roll/cartão
  //    livres, depois para qualquer segmento livre que não seja o gancho nem o fecho.
  for (const a of visuais) if (Number.isInteger(a.segmento) && a.segmento < janelas.length && !ocupado.has(a.segmento)) por(a, a.segmento)
  const livres = () => janelas.map((_, i) => i).filter((i) => !ocupado.has(i))
  for (const a of visuais.filter((x) => !Number.isInteger(x.segmento) || x.segmento >= janelas.length)) {
    const l = livres()
    const broll = l.filter((i) => ['b_roll', 'cartao'].includes(segmentos[i]?.visual))
    const meio = l.filter((i) => i > 0 && i < janelas.length - 1)
    const i = broll[0] ?? meio[0]
    if (i === undefined) break
    por(a, i)
  }
  return plano.sort((x, y) => x.ini - y.ini)
}

function duracaoDe(ficheiro) {
  return new Promise((ok) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', ficheiro], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    p.stdout.on('data', (d) => { out += d })
    p.on('exit', () => ok(Number(out.trim()) || 0))
  })
}

export async function edicaoBase(entrada, saida, guiao = {}) {
  // Com cortes decididos no ecrã (editar pelo texto), aplicam-se esses; senão corta-se só o
  // silêncio do início (até ao primeiro som) nos dois fluxos de uma vez, com -ss.
  const cortes = (Array.isArray(guiao.cortes) ? guiao.cortes : []).filter((c) => c.fim > c.ini)
  const inicio = cortes.length ? 0 : await primeiroSom(entrada)
  const corte = inicio > 0.2 ? Math.max(0, inicio - 0.15) : 0
  const removido = cortes.reduce((t, c) => t + (c.fim - c.ini), 0)
  const duracao = Math.max(0, (await duracaoDe(entrada)) - corte - removido)
  const estilo = { musica_db: -18, duck: true, ...(guiao.estilo || {}) }
  const ativos = Array.isArray(guiao.ativos) ? guiao.ativos.filter((a) => a.ficheiro) : []
  const plano = planoAtivos(Array.isArray(guiao.segmentos) ? guiao.segmentos : [], ativos, duracao)
  const musica = ativos.find((a) => a.tipo === 'audio')

  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '2', ...(corte ? ['-ss', String(corte)] : []), '-i', entrada]
  const fora = cortes.map((c) => `between(t,${c.ini},${c.fim})`).join('+')
  const filtros = cortes.length
    ? [`[0:v]select='not(${fora})',setpts=N/FRAME_RATE/TB,${ENQUADRAR}[v0]`, `[0:a]aselect='not(${fora})',asetpts=N/SR/TB,loudnorm=I=-14:TP=-1.5:LRA=11[a0]`]
    : [`[0:v]${ENQUADRAR}[v0]`, '[0:a]loudnorm=I=-14:TP=-1.5:LRA=11[a0]']
  let n = 1
  let ultimo = 'v0'
  plano.forEach((p, k) => {
    const dur = p.fim - p.ini
    if (p.tipo === 'imagem') {
      // Uma só imagem: o zoompan gera os fotogramas todos (animação pelo contexto do segmento).
      args.push('-i', p.ficheiro)
      filtros.push(`[${n}:v]${filtroImagem(p.animacao || 'sem', dur)},setpts=PTS-STARTPTS+${p.ini}/TB[o${k}]`)
    } else {
      args.push('-i', p.ficheiro)
      filtros.push(`[${n}:v]${ENQUADRAR},setpts=PTS-STARTPTS+${p.ini}/TB[o${k}]`)
    }
    filtros.push(`[${ultimo}][o${k}]overlay=eof_action=pass:enable='between(t,${p.ini},${p.fim})'[v${k + 1}]`)
    ultimo = `v${k + 1}`
    n++
  })
  let audio = 'a0'
  if (musica) {
    args.push('-stream_loop', '-1', '-i', musica.ficheiro)
    filtros.push(`[${n}:a]volume=${estilo.musica_db}dB,aresample=48000[mu]`)
    if (estilo.duck) {
      // Auto-duck: a música baixa sozinha enquanto há voz e volta nas pausas.
      filtros.push('[a0]asplit=2[av][sc]', '[mu][sc]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[md]', '[av][md]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[am]')
    } else {
      filtros.push('[a0][mu]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[am]')
    }
    audio = 'am'
    n++
  }
  args.push('-filter_complex', filtros.join(';'), '-map', `[${ultimo}]`, '-map', `[${audio}]`,
    ...(duracao > 0 ? ['-t', duracao.toFixed(2)] : []),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart', saida)
  await correr('nice', ['-n', '15', 'ffmpeg', ...args])
  return { ativos_usados: plano.length + (musica ? 1 : 0) }
}

/** Descarrega os ativos do trabalho para a pasta; HEIC passa a JPG (o ffmpeg não lê HEIC). */
async function descarregarAtivos(lista, pasta) {
  const out = []
  for (const [i, a] of (lista || []).entries()) {
    try {
      const r = await fetch(a.url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const ext = (a.mime || '').split('/')[1]?.replace('quicktime', 'mov').replace('mpeg', 'mp3').replace('x-m4a', 'm4a') || 'bin'
      let ficheiro = join(pasta, `ativo-${i}.${ext}`)
      await writeFile(ficheiro, Buffer.from(await r.arrayBuffer()))
      if (/heic|heif/.test(ext)) {
        const jpg = join(pasta, `ativo-${i}.jpg`)
        await correr('sips', ['-s', 'format', 'jpeg', ficheiro, '--out', jpg])
        ficheiro = jpg
      }
      out.push({ tipo: a.tipo, nome: a.nome, segmento: a.segmento, animacao: a.animacao || 'auto', ficheiro })
    } catch (e) {
      log('ativo ignorado', a.nome, e.message)
    }
  }
  return out
}

function primeiroSom(entrada) {
  return new Promise((ok) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-i', entrada, '-af', 'silencedetect=noise=-45dB:d=0.2', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => { err += d })
    p.on('exit', () => {
      const ini = err.match(/silence_start: (-?[\d.]+)/)
      const fim = err.match(/silence_end: ([\d.]+)/)
      ok(ini && Number(ini[1]) <= 0.05 && fim ? Number(fim[1]) : 0)
    })
  })
}

async function umTrabalho() {
  const r = await fetch(`${SITE}/api/estudio/motor`, { headers: auth })
  if (!r.ok) throw new Error(`motor GET ${r.status}`)
  const { trabalho: t } = await r.json()
  if (!t) return false
  log('a editar', t.id, t.marca)
  const pasta = await mkdtemp(join(tmpdir(), 'mtm-estudio-'))
  try {
    const ext = t.bruto_mime === 'video/webm' ? 'webm' : t.bruto_mime === 'video/quicktime' ? 'mov' : 'mp4'
    const entrada = join(pasta, `bruto.${ext}`)
    const saida = join(pasta, 'editado.mp4')
    const guiao = join(pasta, 'guiao.json')
    const d = await fetch(t.bruto_url)
    if (!d.ok) throw new Error(`descarga ${d.status}`)
    await writeFile(entrada, Buffer.from(await d.arrayBuffer()))
    const ativos = await descarregarAtivos(t.ativos, pasta)
    const dadosGuiao = { marca: t.marca, ...t.guiao, ativos }
    await writeFile(guiao, JSON.stringify(dadosGuiao, null, 2))
    if (ativos.length) log('ativos', ativos.length)

    let feito = false
    if (process.env.ESTUDIO_EDIT_CMD) {
      const cmd = process.env.ESTUDIO_EDIT_CMD.replaceAll('{in}', entrada).replaceAll('{out}', saida).replaceAll('{guiao}', guiao)
      try {
        await correr('nice', ['-n', '15', '/bin/zsh', '-lc', cmd])
        feito = true
      } catch (e) {
        log('edição avançada falhou, sigo com a base:', e.message)
      }
    }
    if (!feito) await edicaoBase(entrada, saida, dadosGuiao)

    const corpo = await readFile(saida)
    const s = await fetch(t.subir_url, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'x-upsert': 'true' }, body: corpo })
    if (!s.ok) throw new Error(`upload ${s.status}`)
    const f = await fetch(`${SITE}/api/estudio/motor`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ id: t.id, ok: true }) })
    log('pronto', t.id, await f.text())
  } catch (e) {
    log('falhou', t.id, e.message)
    await fetch(`${SITE}/api/estudio/motor`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ id: t.id, ok: false, erro: e.message }) }).catch(() => {})
  } finally {
    await rm(pasta, { recursive: true, force: true })
  }
  return true
}

/** Monta um projecto do Editor de vídeo do /estudio (timeline → MP4). */
async function umProjeto() {
  const r = await fetch(`${SITE}/api/estudio/motor/projeto`, { headers: auth })
  if (r.status === 404) return false // site ainda sem o editor
  if (!r.ok) throw new Error(`projeto GET ${r.status}`)
  const { trabalho: t } = await r.json()
  if (!t) return false
  log('a montar projecto', t.id, t.titulo)
  const pasta = await mkdtemp(join(tmpdir(), 'mtm-projeto-'))
  const responder = (corpo) => fetch(`${SITE}/api/estudio/motor/projeto`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ id: t.id, ...corpo }) })
  try {
    const p = t.projeto
    const urls = [...new Set([...p.clips.map((c) => c.fonte?.url), p.musica?.fonte?.url].filter(Boolean))]
    const ficheiros = {}
    for (const [i, u] of urls.entries()) {
      const d = await fetch(u)
      if (!d.ok) { log('fonte ignorada', d.status); continue }
      const tipo = d.headers.get('content-type') || ''
      let f = join(pasta, `fonte-${i}.${/image\/(heic|heif)/.test(tipo) ? 'heic' : tipo.split('/')[1]?.split(';')[0].replace('quicktime', 'mov').replace('mpeg', 'mp3') || 'bin'}`)
      await writeFile(f, Buffer.from(await d.arrayBuffer()))
      if (f.endsWith('.heic')) { const jpg = f.replace(/heic$/, 'jpg'); await correr('sips', ['-s', 'format', 'jpeg', f, '--out', jpg]); f = jpg }
      ficheiros[u] = f
    }
    let logo = null
    if (p.marca_dagua) {
      const l = await fetch(`${SITE}/logo-mtm-transparent.png`).catch(() => null)
      if (l?.ok) { logo = join(pasta, 'logo.png'); await writeFile(logo, Buffer.from(await l.arrayBuffer())) }
    }
    const saida = join(pasta, 'projeto.mp4')
    await renderProjeto(p, { pasta, ficheiros, palavras: t.palavras || {}, marca: t.marca, logo, saida })
    const s = await fetch(t.subir_url, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'x-upsert': 'true' }, body: await readFile(saida) })
    if (!s.ok) throw new Error(`upload ${s.status}`)
    log('projecto pronto', t.id, await (await responder({ ok: true })).text())
  } catch (e) {
    log('projecto falhou', t.id, e.message)
    await responder({ ok: false, erro: e.message }).catch(() => {})
  } finally {
    await rm(pasta, { recursive: true, force: true })
  }
  return true
}

/** Transcreve um take (para editar pelo texto no /estudio), se houver ESTUDIO_TRANSCREVER_CMD. */
async function umaTranscricao() {
  const cmdBase = process.env.ESTUDIO_TRANSCREVER_CMD
  if (!cmdBase) return false
  const r = await fetch(`${SITE}/api/estudio/motor/transcricao`, { headers: auth })
  if (!r.ok) throw new Error(`transcricao GET ${r.status}`)
  const { trabalho: t } = await r.json()
  if (!t) return false
  log('a transcrever', t.id)
  const pasta = await mkdtemp(join(tmpdir(), 'mtm-transc-'))
  const responder = (corpo) => fetch(`${SITE}/api/estudio/motor/transcricao`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ id: t.id, ...corpo }) })
  try {
    const ext = t.mime === 'video/webm' ? 'webm' : t.mime === 'video/quicktime' ? 'mov' : 'mp4'
    const entrada = join(pasta, `bruto.${ext}`)
    const saida = join(pasta, 'palavras.json')
    const d = await fetch(t.bruto_url)
    if (!d.ok) throw new Error(`descarga ${d.status}`)
    await writeFile(entrada, Buffer.from(await d.arrayBuffer()))
    await correr('nice', ['-n', '15', '/bin/zsh', '-lc', cmdBase.replaceAll('{in}', entrada).replaceAll('{out}', saida)])
    const j = JSON.parse(await readFile(saida, 'utf8'))
    const f = await responder({ palavras: j.palavras || [], lingua: j.lingua || 'pt' })
    log('transcrito', t.id, await f.text())
  } catch (e) {
    log('transcrição falhou', t.id, e.message)
    await responder({ erro: e.message }).catch(() => {})
  } finally {
    await rm(pasta, { recursive: true, force: true })
  }
  return true
}

while (principal) {
  try {
    while (await umTrabalho()) { /* esvaziar a fila, um de cada vez */ }
    while (await umProjeto()) { /* projectos do editor */ }
    while (await umaTranscricao()) { /* depois as transcrições */ }
  } catch (e) {
    log('erro', e.message)
  }
  await dormir(INTERVALO)
}
