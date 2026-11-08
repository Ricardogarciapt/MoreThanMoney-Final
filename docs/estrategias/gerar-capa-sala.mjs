// Capa da sala «Estratégias MTM» (1600×560, PT/EN) → public/educador/estrategias/capas/sala-{pt,en}.jpg
// Uso (na raiz do repo): node docs/estrategias/gerar-capa-sala.mjs
// As pastilhas saem de lib/estrategias-mtm.ts (ordem da sala), por isso um scanner novo entra na
// capa sem desenhar nada à mão. O ecrã inclinado é o gráfico do RocketNova (components/scanner/sim).
import { createRequire } from 'node:module'
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
const OUT = path.join(RAIZ, 'public/educador/estrategias/capas')

// nomes das estratégias, pela ordem da sala (sem importar TS: lê-se o ficheiro)
const fonte = fs.readFileSync(path.join(RAIZ, 'lib/estrategias-mtm.ts'), 'utf8')
const NOMES = [...fonte.matchAll(/^\s*nome:\s*"([^"]+)"/gm)].map((m) => m[1])
if (!NOMES.length) throw new Error('não encontrei as estratégias em lib/estrategias-mtm.ts')

const TXT = {
  pt: { kicker: 'MORE THAN MONEY', t1: 'ESTRATÉGIAS', t2: 'MTM', sub: `${NOMES.length} estratégias · bootcamps em vídeo · guias em PDF` },
  en: { kicker: 'MORE THAN MONEY', t1: 'MTM', t2: 'STRATEGIES', sub: `${NOMES.length} strategies · video bootcamps · PDF guides` },
}

const html = (lang) => {
  const T = TXT[lang]
  const pills = NOMES.map((n) => `<span class="pill">${n}</span>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url('${INTER}');font-weight:100 900}
@font-face{font-family:Anton;src:url('${ANTON}')}
html,body{margin:0;width:1600px;height:560px;overflow:hidden;background:#0b0a08;font-family:Inter,system-ui;color:#f3ede1}
.ecra{position:absolute;left:760px;top:52px;width:900px;height:470px;transform:perspective(1600px) rotateY(-16deg) rotateX(2deg) scale(1.02);transform-origin:left center;border-radius:16px;overflow:hidden;background:#07070a;box-shadow:0 30px 90px rgba(0,0,0,.65);border:1px solid rgba(255,255,255,.07)}
.ecra canvas{width:900px;height:470px;display:block}
.sombra{position:absolute;inset:0;background:linear-gradient(90deg,#0b0a08 0,#0b0a08 44%,rgba(11,10,8,.55) 56%,rgba(11,10,8,0) 72%)}
.glow{position:absolute;inset:0;pointer-events:none;background:radial-gradient(800px 500px at 16% 30%,rgba(210,166,60,.16),transparent 62%)}
.kicker{position:absolute;left:80px;top:92px;font:800 20px Inter;letter-spacing:.34em;color:#D2A63C}
.titulo{position:absolute;left:76px;top:112px;font:400 128px/1.0 Anton;letter-spacing:.01em;background:linear-gradient(180deg,#F1D27A 0%,#D2A63C 55%,#A97D22 100%);-webkit-background-clip:text;color:transparent;text-shadow:none}
.sub{position:absolute;left:80px;top:352px;font:700 28px Inter;color:#f3ede1}
.pills{position:absolute;left:80px;top:410px;width:860px;display:flex;flex-wrap:wrap;gap:10px}
.pill{padding:9px 16px;border:1.5px solid #D2A63C;border-radius:999px;font:700 18px Inter;color:#f3ede1;background:rgba(11,10,8,.85);white-space:nowrap}
</style></head><body>
<div class="ecra"><canvas id="c"></canvas></div><div class="sombra"></div><div class="glow"></div>
<div class="kicker">${T.kicker}</div>
<div class="titulo">${T.t1}<br>${T.t2}</div>
<div class="sub">${T.sub}</div>
<div class="pills">${pills}</div>
<script type="module">
import { simulate } from '${SIM}'
import { drawCard } from '${D2}'
window.sim = simulate('rocketnova')
window.plano = (sel, p, lang, before = 46, after = 30) => { const s = window.sim, g = s.groups[s.groups.length - 1], N = s.candles.length
  const card = { win: [Math.max(0, g.i0 - before), Math.min(N - 1, g.i0 + after)], layers: { candles: true, lines: ['EMA 20', 'EMA 50', 'EMA 238'], groups: true, markers: true }, group: g }
  drawCard(document.querySelector(sel), s, card, p, lang) }
await document.fonts.load('700 20px Inter'); await document.fonts.load('400 40px Anton')
window.ready = true
</script></body></html>`
}

const b = await chromium.launch({ args: ['--allow-file-access-from-files'] })
for (const lang of ['pt', 'en']) {
  const f = path.join(DIR, `.sala-${lang}.html`)
  fs.writeFileSync(f, html(lang))
  const p = await b.newPage({ viewport: { width: 1600, height: 560 }, deviceScaleFactor: 1 })
  p.on('pageerror', (e) => console.log('ERR', e.message)); p.on('console', (m) => m.type() === 'error' && console.log('CON', m.text()))
  await p.goto(pathToFileURL(f).href)
  await p.waitForFunction('window.ready')
  await p.evaluate((l) => window.plano('#c', 1, l), lang)
  await p.waitForTimeout(150)
  await p.screenshot({ path: path.join(OUT, `sala-${lang}.jpg`), type: 'jpeg', quality: 90 })
  await p.close(); fs.rmSync(f)
  console.log('ok', `sala-${lang}.jpg`, NOMES.join(' · '))
}
await b.close()
