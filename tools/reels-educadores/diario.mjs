// O ROBÔ DIÁRIO DOS REELS — corre no GitHub Actions (.github/workflows/reels-diarios.yml).
//
//   1. pede ao site o plano do dia (/api/cron/reels-educadores): roteiros escritos pela IA
//   2. desenha cada reel animado (reel2.html frame a frame + banda sonora de som.py)
//   3. sobe o MP4 e a capa direto ao storage e entrega-os → fila do Instagram (ou rascunho)
//   4. corre o videocliper uma ronda (transcrever sessões, cortar os momentos aprovados)
//   5. volta a pedir o plano: o site aprova os melhores momentos e põe os cortes prontos na fila
//
// Uso: CRON_SECRET=… node tools/reels-educadores/diario.mjs [--dia=AAAA-MM-DD] [--so-animados] [--seco]
import { createRequire } from 'node:module'
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const API = (process.env.MTM_API_BASE || 'https://www.morethanmoney.pt').replace(/\/+$/, '')
const SEGREDO = process.env.CRON_SECRET || ''
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1]
const DIA = arg('dia') || ''
const SECO = process.argv.includes('--seco')
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
if (!SEGREDO) { console.error('CRON_SECRET em falta'); process.exit(1) }

async function api(metodo, corpo) {
  const url = `${API}/api/cron/reels-educadores${metodo === 'GET' && DIA ? `?dia=${DIA}` : ''}`
  const r = await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${SEGREDO}`, 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${metodo} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`)
  return j
}

async function subir(ficheiro, ext) {
  const { signedUrl, publicUrl } = await api('POST', { acao: 'upload-url', ext })
  const put = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'content-type': ext === 'mp4' ? 'video/mp4' : 'image/jpeg', 'x-upsert': 'true' },
    body: fs.readFileSync(ficheiro),
  })
  if (!put.ok) throw new Error(`storage ${put.status}: ${(await put.text()).slice(0, 200)}`)
  return publicUrl
}

// ── MOTOR DE ATIVOS (services/motor-ativos): os reels da marca pedem um clipe 9:16 para fundo.
// Se o motor não estiver ligado ou não acabar dentro do prazo, o reel sai como sempre, com a
// foto da app, e o pedido não se repete (fica na fila e gera quando a GPU ligar).
// MOTOR_ATIVOS=0 desliga; MOTOR_ENSAIO=1 pede o clipe de ensaio; MOTOR_PRAZO_MIN (omissão 12).
const MOTOR = process.env.MOTOR_ATIVOS !== '0'
const ENSAIO = process.env.MOTOR_ENSAIO === '1'
const PRAZO_MS = Number(process.env.MOTOR_PRAZO_MIN || 12) * 60_000
const daMarca = (item) => String(item.educador?.slug || '').startsWith('mtm-')

async function motor(metodo, corpo, id) {
  const url = `${API}/api/estudio/geracao${id ? `?id=${encodeURIComponent(id)}` : ''}`
  const r = await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${SEGREDO}`, 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`motor ${metodo} ${r.status}`)
  return j
}

/** Pede um clipe por reel da marca; devolve Map(item.id → id do pedido). Nunca falha. */
async function pedirClipes(renders) {
  const pedidos = new Map()
  if (!MOTOR) return pedidos
  for (const item of renders.filter(daMarca)) {
    try {
      const j = await motor('POST', {
        tipo: 'mover',
        imagem_url: item.educador.foto,
        prompt: `Movimento de câmara lento e cinematográfico sobre o ecrã da app, luz dourada sobre fundo quase preto, sem texto novo. Tema: ${item.roteiro.tema || ''}`.slice(0, 400),
        aspecto: '9:16',
        duracao_s: 4,
        movimento: 'dolly-in',
        origem: 'reels-diarios',
        ...(ENSAIO ? { ensaio: true } : {}),
      })
      if (j.motor_online === false && !ENSAIO) { log(`motor desligado: ${item.roteiro.id} fica com a foto`); continue }
      if (j.id) pedidos.set(item.id, String(j.id))
    } catch (e) {
      log(`motor indisponível (${e.message}): os reels ficam com a foto`)
      return pedidos
    }
  }
  return pedidos
}

/** Espera pelo clipe até ao prazo comum; devolve o caminho do MP4 ou null. */
async function clipe(pedidoId, limite, pasta) {
  while (Date.now() < limite) {
    try {
      const j = await motor('GET', null, pedidoId)
      if (j.estado === 'pronto' && j.url) {
        const r = await fetch(j.url)
        if (!r.ok) return null
        const f = path.join(pasta, 'clipe.mp4')
        fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()))
        return f
      }
      if (j.estado === 'erro' || j.estado === 'falhou') return null
    } catch { /* tenta outra vez até ao prazo */ }
    await new Promise((r) => setTimeout(r, 15_000))
  }
  return null
}

/** Desenha um reel: o mesmo motor do pacote aprovado pelo Ricardo (v2). Com `fundo`, o clipe do
 * motor de ativos fica por baixo da animação (a página é desenhada com fundo transparente). */
async function desenhar(browser, item, pasta, fundo = null) {
  const foto = await fetch(item.educador.foto)
  if (!foto.ok) throw new Error(`foto ${foto.status}`)
  const tipo = foto.headers.get('content-type') || 'image/jpeg'
  const fotoUrl = `data:${tipo};base64,${Buffer.from(await foto.arrayBuffer()).toString('base64')}`

  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } })
  await page.goto('file://' + path.join(DIR, 'reel2.html'))
  const info = await page.evaluate(([d, f]) => window.iniciar(d, f), [{ ...item.roteiro, educador: item.educador }, fotoUrl])
  if (fundo) await page.evaluate(() => document.documentElement.classList.add('sobre-video'))
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)

  const som = path.join(pasta, 'som.wav')
  execFileSync('python3', [path.join(DIR, 'som.py'), som, String(info.total), JSON.stringify(info.cortes), JSON.stringify(info.palavras)])
  const mp4 = path.join(pasta, 'reel.mp4')
  const saida = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '192k', '-t', info.total.toFixed(2), '-movflags', '+faststart', mp4]
  const args = fundo
    ? ['-y', '-v', 'error', '-stream_loop', '-1', '-i', fundo, '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-', '-i', som,
      '-filter_complex', '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,drawbox=c=black@0.5:t=fill[f];[f][1:v]overlay=0:0:shortest=1[v]',
      '-map', '[v]', '-map', '2:a', ...saida]
    : ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-i', som, ...saida]
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] })
  const n = Math.ceil(info.total * 30)
  for (let i = 0; i < n; i++) {
    await page.evaluate((x) => window.renderAt(x), i / 30)
    const buf = fundo ? await page.screenshot({ type: 'png', omitBackground: true }) : await page.screenshot({ type: 'jpeg', quality: 90 })
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
  }
  ff.stdin.end()
  const code = await new Promise((r) => ff.on('close', r))
  await page.close()
  if (code !== 0) throw new Error(`ffmpeg saiu com ${code}`)
  const capa = path.join(pasta, 'capa.jpg')
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.max(0.1, item.roteiro.cenas[0].dur - 0.4)), '-i', mp4, '-frames:v', '1', '-q:v', '3', capa])
  return { mp4, capa, total: info.total }
}

/** Os roteiros saem aos poucos (a IA gratuita limita por minuto): pede-se o plano até vir completo. */
async function animados() {
  for (let volta = 1; volta <= 6; volta++) {
    const plano = await api('GET')
    log(`dia ${plano.dia} (volta ${volta}): ${plano.renders.length} reel(s) por desenhar · ${plano.metricas} nota(s) lidas do Instagram`)
    for (const n of plano.notas || []) log('·', n)
    if (plano.renders.length && !SECO) await desenharTodos(plano.renders)
    if (plano.completo !== false || SECO) return
    await new Promise((r) => setTimeout(r, 60_000))
  }
}

async function desenharTodos(renders) {
  const { chromium } = createRequire(import.meta.url)('playwright')
  const browser = await chromium.launch()
  const pedidos = await pedirClipes(renders)
  const limite = Date.now() + PRAZO_MS
  // Os reels sem clipe desenham-se primeiro, enquanto o motor trabalha nos outros.
  const ordem = [...renders].sort((a, b) => Number(pedidos.has(a.id)) - Number(pedidos.has(b.id)))
  try {
    for (const item of ordem) {
      const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'))
      try {
        let fundo = null
        if (pedidos.has(item.id)) {
          fundo = await clipe(pedidos.get(item.id), limite, pasta)
          log(fundo ? `motor: clipe pronto para ${item.roteiro.id}` : `motor: sem clipe a tempo para ${item.roteiro.id}, fica com a foto`)
        }
        const { mp4, capa, total } = await desenhar(browser, item, pasta, fundo).catch((e) => {
          if (!fundo) throw e
          log(`motor: o clipe falhou na montagem (${e.message}), fica com a foto`)
          return desenhar(browser, item, pasta, null)
        })
        const videoUrl = await subir(mp4, 'mp4')
        const capaUrl = await subir(capa, 'jpg').catch(() => null)
        const r = await api('POST', { acao: 'entregar', id: item.id, videoUrl, capaUrl })
        log(`✓ ${item.roteiro.id} (${total.toFixed(1)} s) → ${r.estado}`)
      } catch (e) {
        log(`✗ ${item.roteiro.id}: ${e.message}`)
        await api('POST', { acao: 'erro', id: item.id, erro: e.message }).catch(() => {})
      } finally {
        fs.rmSync(pasta, { recursive: true, force: true })
      }
    }
  } finally {
    await browser.close()
  }
}

function rondaDoCortador(minutos) {
  const worker = path.join(DIR, '..', '..', 'deploy', 'vps-stream', 'videocliper', 'videocliper-worker.js')
  return new Promise((resolve) => {
    const p = spawn('node', [worker, '--ronda', `--minutos=${minutos}`], {
      stdio: 'inherit',
      env: { ...process.env, WORKER_NAME: 'github-reels', VIDEOCLIPER_CACHE: path.join(os.tmpdir(), 'vc-cache') },
    })
    p.on('close', resolve)
  })
}

await animados()
if (!process.argv.includes('--so-animados') && !SECO) {
  // transcreve e analisa a sessão pedida (se houver) e corta os momentos já aprovados
  await rondaDoCortador(Number(arg('minutos') || 45))
  // o site aprova os melhores momentos da sessão acabada de analisar…
  await api('GET')
  // …o cortador corta-os…
  await rondaDoCortador(30)
  // …e os cortes prontos entram na fila.
  const fim = await api('GET')
  for (const n of fim.notas || []) log('·', n)
}
log('feito')
