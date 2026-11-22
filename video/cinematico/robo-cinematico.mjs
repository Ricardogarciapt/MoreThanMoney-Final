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
  // Lista viva (22/11, formatos virais): cada item entra quando a voz diz a palavra mais marcante dele.
  if (cin.lista && Array.isArray(cin.lista.itens) && cin.lista.itens.length >= 2) {
    const n = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ')
    const ini = config.gancho.ate, fimL = config.cta.de - 0.3, k = cin.lista.itens.length
    let cursor = ini
    // 22/11: quando a voz numera («Um:», «Dois:», «Primeiro:»…), cada item entra no seu número — a busca por
    // palavra trocava «ação» por «motivação» e «opera» por «operação» e mostrava itens antes do tempo.
    const ORD = /^(um|uma|dois|duas|tres|quatro|cinco|seis|sete|primeiro|segundo|terceiro|quarto|quinto|sexto|setimo)$/
    const ords = palavras.filter((w, j) => w.ini >= ini - 0.3 && w.ini < fimL && ORD.test(n(w.w).trim()) && /[:,.]$/.test(w.w.trim()) && j < palavras.length - 1)
    if (ords.length >= k) {
      const itens = cin.lista.itens.map((t, i) => ({ em: +Math.max(ini, ords[i].ini - 0.05).toFixed(2), t }))
      config.lista = { titulo: cin.lista.titulo || '', itens, ...(cin.lista.contagem ? { contagem: true } : {}) }
    }
    const itens = config.lista ? config.lista.itens : cin.lista.itens.map((t, i) => {
      const chaves = n(t).split(/\s+/).filter((x) => x.length >= 4).sort((a, b) => b.length - a.length)
      const p = palavras.find((w) => w.ini >= cursor - 0.05 && w.ini < fimL && chaves.some((c) => n(w.w).trim().startsWith(c.slice(0, 5))))
      const em = p ? Math.max(cursor, p.ini - 0.15) : ini + ((fimL - ini) * i) / k
      cursor = em + 0.4
      return { em: +em.toFixed(2), t }
    })
    if (!config.lista) config.lista = { titulo: cin.lista.titulo || '', itens, ...(cin.lista.contagem ? { contagem: true } : {}) }
    config.chips = []
    config.imagens = []
  }
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

/**
 * Fundo dos reels narrados: planos de ~3 s escolhidos por id (sempre os mesmos para o mesmo reel), das fotos
 * reais do Ricardo e do stock, a 1080×1920, com a voz por cima. Sai um mp4 que o resto do robô trata como o gémeo.
 *
 * 22/11 (Ricardo, depois do 1.º lote): (1) os clips HeyGen das fotos mexiam demasiado os lábios («muito robótico»)
 * → as fotos passam a planos Ken Burns sobre a foto parada: a foto inteira (4:5) sobre o próprio fundo desfocado,
 * a aproximar devagar para o rosto (FOCO) — melhor enquadramento, sem caras a mexer. (2) o CTA vinha colado às
 * dicas → 2,5 s de pausa na voz antes da frase do CTA, cobertos pelos planos (outras fotos a animar).
 */
const FOCO_FOTOS = { estudio: [0.33, 0.2], farda: [0.52, 0.3], palco: [0.47, 0.24], recomeco: [0.45, 0.55], retrato: [0.42, 0.3] }
const PAUSA_CTA = 2.5

/** Mete PAUSA_CTA s de silêncio antes da frase do CTA (a última que manda comentar/seguir). Devolve o ficheiro a usar. */
function vozComPausa({ id, voz, cin }) {
  const pal = path.join(AUTO, `${id}-voz-palavras.json`)
  const w = spawnSync('python3', [path.join(AQUI, 'som/transcrever.py'), voz, pal, cin.texto || ''], { stdio: 'inherit' })
  if (w.status !== 0 || !fs.existsSync(pal)) { log('pausa CTA: sem Whisper, voz tal como está'); return voz }
  const ps = JSON.parse(fs.readFileSync(pal, 'utf8'))
  const n = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  const chave = n(cin.palavra_chave || '')
  const re = /^(comenta|escreve|manda|envia|segue|clica)/
  let i = -1
  for (let k = ps.length - 1; k > 2; k--) if (re.test(n(ps[k].w)) || (chave && n(ps[k].w) === chave && re.test(n(ps[k - 1]?.w || '')))) { i = re.test(n(ps[k].w)) ? k : k - 1; break }
  if (i < 3) { log('pausa CTA: frase do CTA não encontrada'); return voz }
  // recua até ao início da frase (palavra anterior acaba em . ! ? ou :)
  let j = i
  while (j > 1 && !/[.!?:…]$/.test(ps[j - 1].w)) j--
  if (j < 2) j = i
  const corte = +((ps[j - 1].fim + ps[j].ini) / 2).toFixed(3)
  const saida = path.join(AUTO, `${id}-voz-pausa.wav`)
  correr('ffmpeg', ['-loglevel', 'error', '-y', '-i', voz, '-filter_complex',
    `[0:a]aresample=44100,asplit=2[x][y];[x]atrim=0:${corte},asetpts=PTS-STARTPTS[a1];[y]atrim=start=${corte},asetpts=PTS-STARTPTS[a2];anullsrc=r=44100:cl=mono,atrim=0:${PAUSA_CTA}[s];[a1][s][a2]concat=n=3:v=0:a=1,aformat=channel_layouts=mono[a]`,
    '-map', '[a]', saida])
  log('pausa CTA', `${PAUSA_CTA}s aos ${corte}s (antes de «${ps[j].w}»)`)
  return saida
}

/** Foto parada → plano de 3 s: foto inteira sobre o fundo desfocado, aproximação lenta para o rosto. */
function planoFoto(k, i, destino) {
  const dir = path.join(AQUI, 'public/fotos-planos')
  const quadro = path.join(AUTO, `quadro-${k}.png`)
  if (!fs.existsSync(quadro)) {
    correr('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(dir, `${k}-fundo.jpg`), '-i', path.join(dir, `${k}-figura.png`), '-filter_complex',
      '[1:v][0:v]scale2ref[fg][bg];[bg][fg]overlay=0:0,split=2[a][b];' +
      '[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=28:2,eq=brightness=-0.22:saturation=0.85[fundo];' +
      '[b]scale=1080:-2[foto];[fundo][foto]overlay=0:(H-h)/2-60,format=rgb24',
      '-frames:v', '1', quadro])
  }
  const [fx, fy] = FOCO_FOTOS[k] || [0.5, 0.35]
  // posição do rosto no quadro 1080×1920 (foto 4:5 com 1080×1350, centrada e 60 px acima)
  const qx = fx, qy = (1920 / 2 - 60 - 675 + fy * 1350) / 1920
  const z = i % 2 === 0 ? 'min(1.0+0.0022*on,1.2)' : 'max(1.2-0.0022*on,1.0)'
  correr('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', quadro, '-vf',
    `scale=3240:5760,zoompan=z='${z}':x='iw*${qx}-iw/zoom*${qx}':y='ih*${qy}-ih/zoom*${qy}':d=1:s=1080x1920:fps=30,format=yuv420p`,
    '-frames:v', '90', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', destino])
  return destino
}

function baseNarrada({ id, marca, voz, destino, cin = {} }) {
  const vozFinal = vozComPausa({ id, voz, cin })
  const dur = duracaoVideo(vozFinal) + 0.4
  const dir = path.join(AQUI, 'public/fotos-planos')
  const deFotos = Object.keys(FOCO_FOTOS).filter((k) => fs.existsSync(path.join(dir, `${k}-fundo.jpg`)) && fs.existsSync(path.join(dir, `${k}-figura.png`))).map((k) => ({ foto: k }))
  const deStock = stockPresente().filter((n) => !n.startsWith('auto') && !n.startsWith('quadro')).map((n) => ({ video: path.join(STOCK, `${n}.mp4`) }))
  // RG: as fotos dele primeiro; MTM: b-roll primeiro, fotos do educador pelo meio.
  const pool = marca === 'ricardo-garcia' ? [...deFotos, ...deFotos, ...deStock] : [...deStock, ...deFotos]
  if (!pool.length) throw new Error('narrado: sem fotos nem stock')
  let h = 0
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296)
  const ordem = [...pool].sort(() => rnd() - 0.5)
  const n = Math.ceil(dur / 3)
  const planos = Array.from({ length: n }, (_, i) => {
    let p = ordem[i % ordem.length]
    // nunca a mesma foto/vídeo duas vezes seguidas
    if (i > 0) { const ant = ordem[(i - 1) % ordem.length]; if ((p.foto && p.foto === ant.foto) || (p.video && p.video === ant.video)) p = ordem[(i + 1) % ordem.length] }
    return p.foto ? planoFoto(p.foto, i, path.join(AUTO, `${id}-plano-${i}.mp4`)) : p.video
  })
  const ins = planos.flatMap((f) => ['-stream_loop', '-1', '-t', '3.2', '-i', f])
  const vf = planos.map((_, i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,trim=duration=3,setpts=PTS-STARTPTS[v${i}]`).join(';')
  const cat = planos.map((_, i) => `[v${i}]`).join('') + `concat=n=${n}:v=1:a=0[v]`
  correr('ffmpeg', ['-loglevel', 'error', '-y', ...ins, '-i', vozFinal, '-filter_complex', `${vf};${cat}`, '-map', '[v]', '-map', `${n}:a`, '-t', String(dur), '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', destino])
}

const limpar = (id) => { for (const f of fs.existsSync(AUTO) ? fs.readdirSync(AUTO) : []) if (f.startsWith(id) || f.startsWith('quadro-')) fs.rmSync(path.join(AUTO, f), { force: true }) }

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
    fs.mkdirSync(AUTO, { recursive: true })
    const video = path.join(AUTO, `${t.id}.mp4`)
    if (t.narracao_url) {
      // Reel narrado (22/11): voz clonada + fotos reais animadas e b-roll por baixo, em vez do gémeo.
      const voz = path.join(AUTO, `${t.id}-voz.mp3`)
      await baixar(t.narracao_url, voz)
      baseNarrada({ id: t.id, marca, voz, destino: video, cin })
    } else {
      if (!url) throw new Error('sem vídeo do gémeo')
      await baixar(url, video)
    }
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
    // Capa (22/11, Ricardo): todos os reels levam capa, cada uma diferente; uma capa que falhe não trava o reel.
    const capa = await subirCapa(t, marca, cin).catch((e) => { log('capa falhou', t.id, e.message); return false })
    log('pronto', t.id, await (await responder({ ok: true, capa })).text())
    fs.rmSync(final, { force: true })
  } catch (e) {
    log('falhou', t.id, e.message)
    await responder({ ok: false, erro: `cinemático: ${e.message}` }).catch(() => {})
  } finally {
    limpar(t.id)
  }
  return true
}

/**
 * Capa 9:16 (video/cinematico/capas/capa_reel.py): RG no estilo @ricardogarciapt (ciano + faixa azul),
 * MTM com o branding MTM (ouro sobre carvão). A foto sai do id do projecto, para cada capa ser diferente.
 * Linhas: cin.capa ou, sem elas, o gancho partido em branco / destaque / faixa.
 */
function linhasDaCapa(cin) {
  if (Array.isArray(cin.capa) && cin.capa.length) return cin.capa
  const p = String(cin.gancho || cin.lista?.titulo || '').replace(/[.!?…]+$/, '').split(/\s+/).filter(Boolean)
  if (p.length <= 2) return [['w', p.join(' ') || 'Trading'], ['c', cin.palavra_chave || 'com método']]
  if (p.length <= 4) return [['w', p.slice(0, 2).join(' ')], ['c', p.slice(2).join(' ')]]
  const a = Math.ceil(p.length * 0.35), b = Math.ceil(p.length * 0.65)
  return [['w', p.slice(0, a).join(' ')], ['c', p.slice(a, b).join(' ')], ['box', p.slice(b).join(' ')]]
}

async function subirCapa(t, marca, cin) {
  if (!t.capa_subir_url) return false
  const saida = path.join(AUTO, `${t.id}-capa.jpg`)
  correr('python3', [path.join(AQUI, 'capas', 'capa_reel.py'), `--marca=${marca}`, `--semente=${t.id}`, `--linhas=${JSON.stringify(linhasDaCapa(cin))}`, `--saida=${saida}`])
  const r = await fetch(t.capa_subir_url, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-upsert': 'true' }, body: fs.readFileSync(saida) })
  if (!r.ok) throw new Error(`upload capa ${r.status}`)
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
