// Gera os materiais do Quantum a partir da simulação da landing (components/scanner/sim):
// posters e vídeos da landing (PT/EN), capas e guias PDF da sala Estratégias (PT/EN).
// Uso (na raiz do repo): node docs/quantum/gerar-materiais.mjs [poster|capa|guia|video|all] → docs/quantum/saida/
// Depois copiar: poster*.jpg → public/scanners/quantum/, capa-*.jpg → public/educador/estrategias/capas/quantum-*.jpg,
// apresentacao*.mp4 → public/scanners/quantum/.
// O vídeo sai sem narração: as falas estão em docs/quantum/narracao/landing-{pt,en}.txt para o clone Fish no Mac.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const DIR = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.join(DIR, '../..')
const SIM = pathToFileURL(path.join(RAIZ, 'components/scanner/sim/scanner-sim.js')).href
const D2 = pathToFileURL(path.join(RAIZ, 'components/scanner/sim/scanner-2d.js')).href
const INTER = pathToFileURL(path.join(RAIZ, 'video/apresentacao/fonts/inter-latin-wght-normal.woff2')).href
const ANTON = pathToFileURL(path.join(RAIZ, 'public/fonts/Anton-Regular.ttf')).href
const OUT = path.join(DIR, 'saida'); fs.mkdirSync(OUT, { recursive: true })
const what = process.argv[2] || 'all'

const TXT = {
  pt: {
    kicker: 'ESTRATÉGIAS MTM', nome: 'QUANTUM', sub: 'Tendência, recuo e painel de força', pill: 'Guia em PDF',
    simNota: 'Simulação com preços gerados', marca: 'Quantum by MTM',
    abre: ['A tendência confirma-se primeiro.', 'O recuo dá a entrada.'],
    cta: 'morethanmoney.pt/scanner/quantum', aviso: 'Conteúdo educativo. Não é aconselhamento financeiro e os resultados não são garantidos.',
    cenas: [
      'Linha primária azul ou vermelha pela fase; a seta grande marca o início da tendência',
      'Painel de força: score de 0 a 100 e uma seta por timeframe, de M1 a W1',
      'O preço recua à fita 8/21 e o oscilador entra na zona da direção',
      'Triângulo de recuo e ponto de onda na cor da direção: a entrada',
      'Stop para lá do extremo do recuo e alvo a 2R, por alertas',
    ],
  },
  en: {
    kicker: 'MTM STRATEGIES', nome: 'QUANTUM', sub: 'Trend, pullback and strength panel', pill: 'PDF guide',
    simNota: 'Simulation with generated prices', marca: 'Quantum by MTM',
    abre: ['The trend confirms first.', 'The pullback gives the entry.'],
    cta: 'morethanmoney.pt/en/scanner/quantum', aviso: 'Educational content. Not financial advice; results are not guaranteed.',
    cenas: [
      'Primary line blue or red by phase; the large arrow marks the start of the trend',
      'Strength panel: a 0 to 100 score and an arrow per timeframe, from M1 to W1',
      'Price pulls back to the 8/21 ribbon and the oscillator enters the zone of the direction',
      'Pullback triangle and wave dot in the colour of the direction: the entry',
      'Stop beyond the extreme of the pullback and a 2R target, by alerts',
    ],
  },
}

const base = (lang, W, H, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url('${INTER}');font-weight:100 900}
@font-face{font-family:Anton;src:url('${ANTON}')}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#0b0a08;font-family:Inter,system-ui;color:#f3ede1}
canvas{display:block}
.glow{position:absolute;inset:0;pointer-events:none;background:radial-gradient(900px 600px at 18% 28%,rgba(210,166,60,.20),transparent 62%)}
.cap{position:absolute;left:72px;bottom:66px;max-width:70%;padding:14px 22px;border-left:4px solid #D2A63C;background:rgba(8,8,10,.82);border-radius:0 12px 12px 0;font:600 ${Math.round(H/38)}px/1.3 Inter;color:#f3ede1;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.nota{position:absolute;right:28px;bottom:20px;font:400 ${Math.round(H/60)}px Inter;color:#8a877f}
.marca{position:absolute;left:28px;top:22px;font:800 ${Math.round(H/40)}px Inter;letter-spacing:.14em;color:#D2A63C}
.marca b{color:#E9C46A}
</style></head><body>${body}
<script type="module">
import { simulate, scannerCards } from '${SIM}'
import { drawCard } from '${D2}'
window.sim = simulate('quantum'); window.cards = scannerCards('quantum')
window.draw = (sel, k, p, lang) => { const c = document.querySelector(sel); drawCard(c, window.sim, window.cards[k], p, lang) }
// vista «plano»: janela à volta de uma entrada, com a linha primária, a fita, os sinais e os níveis
window.plano = (sel, p, lang, before = 40, after = 26) => { const s = window.sim, g = s.groups.find((x) => x.forte) || s.groups[Math.min(1, s.groups.length - 1)], N = s.candles.length
  const card = { win: [Math.max(0, g.i0 - before), Math.min(N - 1, g.i0 + after)], layers: { candles: true, lines: ['Linha primária alta', 'Linha primária baixa', 'EMA 8', 'EMA 21'], groups: true, markers: true }, group: g }
  drawCard(document.querySelector(sel), s, card, p, lang) }
await document.fonts.load('600 20px Inter'); await document.fonts.load('400 40px Anton')
window.ready = true
</script></body></html>`

async function page(html, W, H, b, dpr = 1) {
  const f = path.join(OUT, `.p-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  fs.writeFileSync(f, html)
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: dpr })
  p.on('pageerror', (e) => console.log('ERR', e.message)); p.on('console', (m) => m.type() === 'error' && console.log('CON', m.text()))
  await p.goto(pathToFileURL(f).href)
  await p.waitForFunction('window.ready')
  fs.rmSync(f)
  return p
}

// ── poster da landing (1280×720): gráfico do plano + legenda ───────────────────────────────
async function poster(b, lang) {
  const T = TXT[lang]
  const html = base(lang, 1280, 720, `<canvas id="c" style="width:1280px;height:720px"></canvas><div class="glow"></div>
<div class="marca">QUAN<b>TUM</b> · MTM</div><div class="cap">${T.cenas[3]}</div><div class="nota">${T.simNota}</div>`)
  const p = await page(html, 1280, 720, b, 1)
  await p.evaluate((l) => window.plano('#c', 1, l), lang)
  await p.waitForTimeout(100)
  await p.screenshot({ path: path.join(OUT, `poster${lang === 'en' ? '-en' : ''}.jpg`), type: 'jpeg', quality: 90 })
  await p.close()
}

// ── capa do guia (1280×720), no estilo das outras capas da sala ───────────────────────────
async function capa(b, lang) {
  const T = TXT[lang]
  const html = base(lang, 1280, 720, `
<div style="position:absolute;right:24px;top:110px;width:640px;height:420px;transform:perspective(1400px) rotateY(-14deg) scale(1.04);border-radius:14px;overflow:hidden;background:#07070a;box-shadow:0 30px 80px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.06)">
<canvas id="c" style="width:660px;height:420px"></canvas></div>
<div class="glow"></div>
<div style="position:absolute;left:70px;top:92px;font:800 24px Inter;letter-spacing:.28em;color:#D2A63C">${T.kicker}</div>
<div style="position:absolute;left:64px;top:128px;font:400 128px/1 Anton;color:#E9C46A;text-shadow:0 8px 40px rgba(0,0,0,.6);letter-spacing:-0.01em">${T.nome}</div>
<div style="position:absolute;left:72px;top:290px;width:520px;font:800 34px/1.15 Inter">${T.sub}</div>
<div style="position:absolute;left:70px;bottom:62px;padding:16px 30px;border-radius:999px;background:#D2A63C;color:#111;font:900 28px Inter">${T.pill}</div>
<div style="position:absolute;right:70px;bottom:70px;font:700 24px Inter;color:#eee">morethanmoney.pt</div>`)
  const p = await page(html, 1280, 720, b, 1)
  await p.evaluate((l) => window.plano('#c', 1, l, 34, 22), lang)
  await p.waitForTimeout(100)
  await p.screenshot({ path: path.join(OUT, `capa-${lang}.jpg`), type: 'jpeg', quality: 90 })
  await p.close()
}

// ── imagens dos gráficos para o guia ───────────────────────────────────────────────────────
async function graficos(b, lang) { // (sem uso: o guia PDF do Quantum já existe)
  const html = base(lang, 1100, 520, `<canvas id="c" style="width:1100px;height:520px"></canvas>`)
  const p = await page(html, 1100, 520, b, 2)
  const out = []
  for (let k = 0; k < 5; k++) {
    await p.evaluate(([l, k]) => window.draw('#c', k, 1, l), [lang, k])
    await p.waitForTimeout(60)
    const buf = await p.screenshot({ type: 'jpeg', quality: 88 })
    out.push('data:image/jpeg;base64,' + buf.toString('base64'))
  }
  await p.close()
  return out
}

// ── vídeo da landing (1920×1080, 30 fps): abertura, 5 cenas animadas, fecho ───────────────
async function video(b, lang) {
  const T = TXT[lang]
  const W = 1920, H = 1080, FPS = 30
  const html = base(lang, W, H, `<canvas id="c" style="width:${W}px;height:${H}px"></canvas><div class="glow"></div>
<div class="marca">QUAN<b>TUM</b> · MTM</div><div class="cap" id="cap"></div><div class="nota">${T.simNota}</div>
<div id="abre" style="position:absolute;inset:0;background:#0b0a08;display:flex;flex-direction:column;justify-content:center;padding-left:140px;opacity:1;transition:opacity .4s">
<div style="font:800 22px Inter;letter-spacing:.3em;color:#D2A63C">MORETHANMONEY</div><div style="font:400 230px/1 Anton;color:#E9C46A;margin:12px 0">QUANTUM</div>
<div style="font:700 44px/1.2 Inter;color:#f3ede1">${T.abre[0]}<br><span style="color:#D2A63C">${T.abre[1]}</span></div></div>
<div id="fim" style="position:absolute;inset:0;background:#0b0a08;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;opacity:0;transition:opacity .5s">
<div style="font:400 120px/1 Anton;color:#E9C46A">QUANTUM by MTM</div><div style="font:800 40px Inter;color:#f3ede1;margin:26px 0 18px">${T.cta}</div>
<div style="font:500 22px Inter;color:#8a877f;max-width:1100px">${T.aviso}</div></div>`)
  const p = await page(html, W, H, b, 1)
  // QT_TEMPOS='{"abre":s,"cenas":[s×5],"fim":s}' estica as cenas à narração (docs/quantum/narracao/montar.mjs)
  const TEMPOS = process.env.QT_TEMPOS ? JSON.parse(process.env.QT_TEMPOS) : { abre: 3.0, cenas: [6.2, 6.2, 6.2, 6.2, 6.2], fim: 4.0 }
  const ABRE = TEMPOS.abre, FIM = TEMPOS.fim, CENAS = TEMPOS.cenas
  const INI = CENAS.reduce((a, c, i) => (a.push(a[i] + c), a), [ABRE])
  const total = INI[5] + FIM
  const N = Math.round(total * FPS)
  const mp4 = path.join(OUT, `apresentacao${lang === 'en' ? '-en' : ''}.mp4`)
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-preset', 'medium', '-movflags', '+faststart', mp4])
  const write = (buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)))
  for (let n = 0; n < N; n++) {
    const t = n / FPS
    await p.evaluate(([t, ABRE, INI, CENAS, FIM, total, lang, cenas]) => {
      const abre = document.getElementById('abre'), fim = document.getElementById('fim'), cap = document.getElementById('cap')
      abre.style.opacity = t < ABRE - 0.4 ? '1' : '0'
      fim.style.opacity = t > total - FIM ? '1' : '0'
      let k = 0; while (k < 4 && t >= INI[k + 1]) k++
      const u = Math.max(0, Math.min(1, (t - INI[k]) / (CENAS[k] * 0.8)))
      const e = 1 - Math.pow(1 - u, 2.2)
      window.draw('#c', k, e, lang)
      cap.textContent = cenas[k]
    }, [t, ABRE, INI, CENAS, FIM, total, lang, T.cenas])
    const buf = await p.screenshot({ type: 'jpeg', quality: 90 })
    await write(buf)
    if (n % 150 === 0) console.log(lang, 'frame', n, '/', N)
  }
  ff.stdin.end()
  await new Promise((r) => ff.on('close', r))
  await p.close()
  console.log('vídeo', mp4, total.toFixed(1), 's')
}

const b = await chromium.launch({ args: ['--allow-file-access-from-files'] })
for (const lang of (process.env.QT_LANG ? [process.env.QT_LANG] : ['pt', 'en'])) {
  if (what === 'all' || what === 'poster') await poster(b, lang)
  if (what === 'all' || what === 'capa') await capa(b, lang)
    if (what === 'all' || what === 'video') await video(b, lang)
}
await b.close()
console.log('feito:', fs.readdirSync(OUT).join(', '))
