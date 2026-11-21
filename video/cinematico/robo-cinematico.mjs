#!/usr/bin/env node
// ROBÔ CINEMÁTICO (20/11/2026) — monta TODOS os reels do gémeo no molde AnuncioReel aprovado pelo Ricardo.
// Corre no GitHub Actions (.github/workflows/reels-cinematicos.yml); também corre no Mac, na pasta do repo.
//
//   1. pede ao site um projecto 'a_render' no molde cinemático (/api/estudio/motor/projeto?moldes=cinematico)
//   2. descarrega o vídeo do gémeo (HeyGen) e as imagens de apoio do guião
//   3. Whisper → palavras com tempos → legendas palavra a palavra
//   4. auto.mjs gera a peça (gancho, PiP, chips, destaque, CTA, aviso); sintese.py faz música + SFX
//   5. Remotion (composição AnuncioReel, anuncio='auto') + motor único (-14 LUFS, H.264, verificar)
//   6. sobe o MP4 e fecha o projecto → o site põe o reel na fila como RASCUNHO e pede aprovação ao
//      Ricardo no Telegram/briefing (lib/estudio/reel-aprovacao.ts). Nada aqui publica.
//
// Uso: CRON_SECRET=… node video/cinematico/robo-cinematico.mjs [--max=6] [--espreitar]
//   --espreitar  só diz quantos há à espera (sai com código 3 se 0, para o Actions saltar o resto)
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { anuncioAuto, segmentosDePalavras, temposSom, ficheiroDemo } from './src/projetos/anuncio-reel/auto.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(AQUI, '../..')
const API = (process.env.MTM_API_BASE || process.env.MTM_SITE || 'https://www.morethanmoney.pt').replace(/\/+$/, '')
const SEGREDO = process.env.CRON_SECRET?.trim()
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1]
const MAX = Math.max(1, Number(arg('max')) || 6)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
if (!SEGREDO && !arg('ensaio')) { console.error('CRON_SECRET em falta'); process.exit(1) }
const auth = { authorization: `Bearer ${SEGREDO}` }
const STOCK = path.join(AQUI, 'public/stock')
const AUTO = path.join(STOCK, 'auto')

function correr(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: AQUI, ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args[0] || ''} saiu com ${r.status}`)
}

async function baixar(url, destino) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!r.ok) throw new Error(`download ${r.status}`)
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()))
  return r.headers.get('content-type') || ''
}

/** Clips de stock presentes (public/stock/*.mp4) — o gerador só escolhe destes. */
const stockPresente = () => (fs.existsSync(STOCK) ? fs.readdirSync(STOCK).filter((f) => f.endsWith('.mp4')).map((f) => f.slice(0, -4)) : [])

/** Sem Whisper: espalha o texto do guião pela duração do vídeo (legendas aproximadas, nunca falha). */
function palavrasEstimadas(texto, dur) {
  const ws = String(texto || '').split(/\s+/).filter(Boolean)
  const passo = Math.max(0.2, (dur - 0.6) / Math.max(1, ws.length))
  return ws.map((w, i) => ({ w, ini: +(0.3 + i * passo).toFixed(2), fim: +(0.3 + (i + 1) * passo - 0.04).toFixed(2) }))
}

function duracaoVideo(f) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' })
  return Number(r.stdout.trim()) || 15
}

/**
 * Ecrãs das Demos/Soluções (21/11): fotografa no telemóvel (390 px, sai a 1080 px) as páginas que a peça pediu.
 * /demos?modelo=X → só a montra do modelo (#modelos); /solucoes/demos/<slug> → topo da página (até 1500 px).
 * Página que falha (404 = demo ainda por publicar) sai da peça; se a imagem ficar sem ecrãs, passa a vida real.
 */
async function capturarDemos(config, stock) {
  const precisa = [...new Set(config.imagens.flatMap((i) => i.demo || []))]
  if (!precisa.length) return
  const base = (process.env.DEMOS_BASE || API).replace(/\/+$/, '')
  const feitos = new Set()
  let pw = null
  try { pw = await import('playwright') } catch { log('playwright em falta: sem ecrãs das demos') }
  if (pw) {
    let exe
    for (const d of fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers') : []) {
      const b = `/opt/pw-browsers/${d}/chrome-linux64/chrome`
      if (d.startsWith('chromium-') && fs.existsSync(b)) exe = b
    }
    const nav = await pw.chromium.launch(exe ? { executablePath: exe } : {})
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1080 / 390, isMobile: true, hasTouch: true, colorScheme: 'dark', locale: 'pt-PT' })
    for (const p of precisa) {
      const dest = path.join(AUTO, ficheiroDemo(p))
      const pg = await ctx.newPage()
      try {
        const r = await pg.goto(base + p, { waitUntil: 'networkidle', timeout: 45_000 })
        if (!r || r.status() >= 400) throw new Error(`HTTP ${r?.status()}`)
        // Next com streaming pode servir o «não encontrado» com 200 (demo ainda por publicar): ver o conteúdo
        const naoHa = await pg.evaluate(() => document.title.startsWith('404') || /could not be found|não (foi )?encontrad|página não existe/i.test(document.body?.innerText || ''))
        if (naoHa) throw new Error('página de «não encontrado»')
        // fora da foto: avisos de cookies, botões flutuantes de chat
        await pg.addStyleTag({ content: '[id*=cookie],[class*=cookie],[aria-label*=ookie],[class*=chat-flutu],[data-flutuante]{display:none!important}' }).catch(() => {})
        await pg.waitForTimeout(1500)
        const montra = p.includes('modelo=') ? pg.locator('#modelos') : null
        if (montra && (await montra.count())) {
          await montra.scrollIntoViewIfNeeded()
          await pg.waitForTimeout(900)
          await montra.screenshot({ path: dest, type: 'jpeg', quality: 88 })
        } else {
          const alto = await pg.evaluate(() => document.documentElement.scrollHeight)
          await pg.screenshot({ path: dest, type: 'jpeg', quality: 88, fullPage: true, clip: { x: 0, y: 0, width: 390, height: Math.min(alto, 1500) } })
        }
        feitos.add(p)
      } catch (e) { log('demo falhou', p, e.message) }
      await pg.close()
    }
    await nav.close()
  }
  const vida = ['negocio_tecnologia_1', 'negocio_tecnologia_2', 'cliente_marca_1', 'cliente_marca_2', 'liberdade_1'].filter((c) => stock.includes(c))
  config.imagens = config.imagens.flatMap((i) => {
    if (!i.demo) return [i]
    const bons = i.demo.filter((p) => feitos.has(p))
    if (bons.length) return [{ ...i, src: `stock/auto/${ficheiroDemo(bons[0])}`, srcs: bons.map((p) => `stock/auto/${ficheiroDemo(p)}`) }]
    const c = vida.find((x) => !config.imagens.some((j) => j.src === x))
    return c ? [{ de: i.de, ate: i.ate, src: c, tipo: 'video', grade: 'neutro' }] : []
  })
  log('demos', `${feitos.size}/${precisa.length} capturadas`)
}

/** Monta um reel: { id, marca, video (ficheiro local), cin } → caminho do MP4 final verificado. */
async function montar({ id, marca, video, cin }) {
  // apoio do guião → PiP (imagem = telemóvel com o ecrã; vídeo = plano a ecrã inteiro)
  const apoio = []
  for (const [i, u] of (cin.apoio || []).entries()) {
    try {
      const ext = /\.(mp4|mov|webm)(\?|$)/i.test(u) ? 'mp4' : 'jpg'
      const nome = `${id}-apoio-${i}`
      const tipo = await baixar(u, path.join(AUTO, `${nome}.${ext}`))
      // Plano lê stock/<src>.mp4; o Telemovel lê <src> tal como está.
      apoio.push(ext === 'mp4' || tipo.startsWith('video') ? { src: `auto/${nome}`, tipo: 'video', grade: 'neutro' } : { src: `stock/auto/${nome}.${ext}`, tipo: 'app' })
    } catch (e) { log('apoio falhou', u, e.message) }
  }

  // palavras com tempos
  const pal = path.join(AUTO, `${id}-palavras.json`)
  let palavras = arg('palavras') ? JSON.parse(fs.readFileSync(arg('palavras'), 'utf8')) : []
  const w = palavras.length ? { status: 1 } : spawnSync('python3', [path.join(AQUI, 'som/transcrever.py'), video, pal, cin.texto || ''], { stdio: 'inherit' })
  if (w.status === 0 && fs.existsSync(pal)) palavras = JSON.parse(fs.readFileSync(pal, 'utf8'))
  if (palavras.length < 3) { log('Whisper sem resultado: legendas estimadas pelo guião'); palavras = palavrasEstimadas(cin.texto, duracaoVideo(video)) }
  const legendas = segmentosDePalavras(palavras)
  if (!legendas.length) throw new Error('sem legendas')

  const config = anuncioAuto({
    marca, legendas, stock: stockPresente(), apoio,
    guiao: { gancho: cin.gancho, palavra_chave: cin.palavra_chave, nicho: cin.nicho, cta_url: cin.cta_url },
  })
  // Molde de edição (21/11): vem do projecto; sem ele roda pelo dia (cinema → impacto → documental).
  const MOLDES = ['cinema', 'impacto', 'documental']
  config.molde = MOLDES.includes(cin.molde) ? cin.molde : arg('molde') && MOLDES.includes(arg('molde')) ? arg('molde') : MOLDES[Math.floor(Date.now() / 86400000) % 3]
  await capturarDemos(config, stockPresente())
  log('peça', JSON.stringify(config))
  const fim = legendas[legendas.length - 1][1]
  fs.writeFileSync(path.join(AUTO, `${id}-tempos.json`), JSON.stringify(temposSom(config, fim)))
  correr('python3', ['som/anuncio-reel/sintese.py', path.join(AUTO, `${id}-tempos.json`), path.join(AUTO, `${id}-musica.wav`)])

  const props = { marca, formato: 'reel', anuncio: 'auto', auto: { config, legendas, video: `stock/auto/${path.basename(video)}`, musica: `stock/auto/${id}-musica.wav` } }
  const fprops = path.join(AUTO, `${id}-props.json`)
  fs.writeFileSync(fprops, JSON.stringify(props))
  fs.mkdirSync(path.join(AQUI, 'out'), { recursive: true })
  const bruto = path.join(AQUI, 'out', `bruto-${id}.mp4`), final = path.join(AQUI, 'out', `reel-${id}.mp4`)
  const br = []
  for (const d of fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers') : []) {
    const b = `/opt/pw-browsers/${d}/chrome-headless-shell-linux64/chrome-headless-shell`
    if (d.startsWith('chromium_headless_shell') && fs.existsSync(b) && !br.length) br.push(`--browser-executable=${b}`, '--gl=swangle')
  }
  const frames = arg('frames')
  correr('npx', ['remotion', 'render', 'src/index.ts', 'AnuncioReel', bruto, '--crf=16', `--concurrency=${process.env.REMOTION_CONC || 2}`, '--log=error', `--props=${fprops}`, ...(frames ? [`--frames=${frames}`] : []), ...br])
  const m = await import(path.join(REPO, 'video/motor/motor.mjs'))
  await m.finalizar(bruto, final, { formato: 'reel', qualidade: 'final' })
  fs.rmSync(bruto, { force: true })
  const v = m.verificar(final, 'reel')
  log('verificar', JSON.stringify(v))
  if (v && v.ok === false) throw new Error(`verificar: ${(v.problemas || []).join('; ').slice(0, 200)}`)
  return final
}

const limpar = (id) => { for (const f of fs.existsSync(AUTO) ? fs.readdirSync(AUTO) : []) if (f.startsWith(id)) fs.rmSync(path.join(AUTO, f), { force: true }) }

async function umTrabalho() {
  const r = await fetch(`${API}/api/estudio/motor/projeto?moldes=cinematico`, { headers: auth })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`GET ${r.status}: ${JSON.stringify(j).slice(0, 200)}`)
  const t = j.trabalho
  if (!t) return false
  const responder = (corpo) => fetch(`${API}/api/estudio/motor/projeto`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ id: t.id, ...corpo }) })
  log('projecto', t.id, t.titulo)
  try {
    const cin = t.projeto.cinematico || {}
    const marca = cin.marca === 'morethanmoney' || t.marca === 'morethanmoney' ? 'morethanmoney' : 'ricardo-garcia'
    const url = t.projeto.clips?.[0]?.fonte?.url
    if (!url) throw new Error('sem vídeo do gémeo')
    fs.mkdirSync(AUTO, { recursive: true })
    const video = path.join(AUTO, `${t.id}.mp4`)
    await baixar(url, video)
    // take filmado com cortes: só o troço escolhido (o gémeo da HeyGen vem inteiro)
    const c0 = t.projeto.clips[0]
    if (c0 && (c0.de > 0.05 || (c0.duracao_fonte && c0.ate < c0.duracao_fonte - 0.05))) {
      const cortado = path.join(AUTO, `${t.id}-corte.mp4`)
      correr('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(c0.de), '-to', String(c0.ate), '-i', video, '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-c:a', 'aac', cortado])
      fs.renameSync(cortado, video)
    }
    const final = await montar({ id: t.id, marca, video, cin })
    const s = await fetch(t.subir_url, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'x-upsert': 'true' }, body: fs.readFileSync(final) })
    if (!s.ok) throw new Error(`upload ${s.status}`)
    log('pronto', t.id, await (await responder({ ok: true })).text())
    fs.rmSync(final, { force: true })
  } catch (e) {
    log('falhou', t.id, e.message)
    await responder({ ok: false, erro: `cinemático: ${e.message}` }).catch(() => {})
  } finally {
    limpar(t.id)
  }
  return true
}

// Ensaio local, sem site: node robo-cinematico.mjs --ensaio=<video.mp4> [--marca=ricardo-garcia] [--palavra=X] [--gancho=…] [--frames=0-90] [--palavras=<json [{w,ini,fim}]>]
if (arg('ensaio')) {
  fs.mkdirSync(AUTO, { recursive: true })
  const video = path.join(AUTO, 'ensaio.mp4')
  fs.copyFileSync(path.resolve(arg('ensaio')), video)
  const final = await montar({ id: 'ensaio', marca: arg('marca') || 'morethanmoney', video, cin: { palavra_chave: arg('palavra') || '', gancho: decodeURIComponent(arg('gancho') || ''), texto: '' } })
  limpar('ensaio')
  log('feito:', final)
  process.exit(0)
}

// 1.ª ronda do dia (ou --pedir): pede os reels de hoje à HeyGen pelos guiões novos (idempotente).
if (process.argv.includes('--pedir')) {
  try {
    const p = await fetch(`${API}/api/cron/reels-cinematicos`, { headers: auth })
    log('pedido do dia:', JSON.stringify(await p.json().catch(() => ({}))).slice(0, 600))
  } catch (e) { log('pedido do dia falhou', e.message) }
}

// Antes de tudo: fecha os vídeos da HeyGen que já acabaram (cria os projectos cinemáticos).
try {
  const h = await fetch(`${API}/api/estudio/geracao?sincronizar=heygen`, { headers: auth })
  log('heygen:', JSON.stringify(await h.json().catch(() => ({}))))
} catch (e) { log('heygen sem resposta', e.message) }

if (process.argv.includes('--espreitar')) {
  const r = await fetch(`${API}/api/estudio/motor/projeto?moldes=cinematico&espreitar=1`, { headers: auth })
  const j = await r.json().catch(() => ({}))
  log('à espera:', j.pendentes ?? '?')
  process.exit(r.ok && !j.pendentes ? 3 : 0)
}
for (let i = 0; i < MAX; i++) {
  if (!(await umTrabalho())) { log('sem mais trabalho'); break }
}
