// Gera os «prints» de cada scanner a partir da simulação da landing (components/scanner/sim), para a
// página /scanner e as landings /scanner/<slug>: renders nossos, sem capturas de terceiros.
// Uso (na raiz do repo): node docs/scanners/gerar-prints.mjs [slug|all] → public/scanners/<slug>/render-N.jpg (PT) e render-N-en.jpg (EN)
// Cada render é uma das vistas dos cartões «como funciona» da landing, a 1600×900, com a marca MTM e
// a nota «Simulação com preços gerados». Pedido do dono (08/11/2026): capas e imagens renderizadas por nós.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const DIR = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.join(DIR, '../..')
const SIM = pathToFileURL(path.join(RAIZ, 'components/scanner/sim/scanner-sim.js')).href
const D2 = pathToFileURL(path.join(RAIZ, 'components/scanner/sim/scanner-2d.js')).href
const I18N = pathToFileURL(path.join(RAIZ, 'components/scanner/sim/i18n.js')).href
const INTER = pathToFileURL(path.join(RAIZ, 'video/apresentacao/fonts/inter-latin-wght-normal.woff2')).href
const TMP = path.join(DIR, '.tmp'); fs.mkdirSync(TMP, { recursive: true })

const MARCA = {
  'gold-killer': 'MTM GOLD KILLER', 'mtm-scanner': 'SCANNER MTM', 'aurum-flow': 'MTM AURUM FLOW', trendshot: 'TRENDSHOT · MTM',
  sensei: 'MTM SENSEI', 'premium-scanner': 'MTM PREMIUM SCANNER', defy: 'DEFY · MTM', rocketnova: 'ROCKETNOVA · MTM', quantum: 'QUANTUM · MTM',
}
// Que cartões viram print (índices em scannerCards): a vista geral, o sinal e os níveis.
const VISTAS = { default: [0, 1, 3] }
const NOTA = { pt: 'Simulação com preços gerados · conteúdo educativo', en: 'Simulation with generated prices · educational content' }
const W = 1600, H = 900

const html = (slug) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url('${INTER}');font-weight:100 900}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#0b0a08;font-family:Inter,system-ui;color:#f3ede1}
canvas{display:block}
.glow{position:absolute;inset:0;pointer-events:none;background:radial-gradient(900px 600px at 18% 28%,rgba(210,166,60,.16),transparent 62%)}
.cap{position:absolute;left:56px;bottom:56px;max-width:66%;padding:14px 22px;border-left:4px solid #D2A63C;background:rgba(8,8,10,.84);border-radius:0 12px 12px 0;font:600 26px/1.3 Inter;color:#f3ede1;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.nota{position:absolute;right:28px;bottom:20px;font:400 15px Inter;color:#8a877f}
.marca{position:absolute;left:28px;top:22px;font:800 22px Inter;letter-spacing:.14em;color:#D2A63C}
.site{position:absolute;left:28px;top:52px;font:700 16px Inter;color:#cfcabd;letter-spacing:.04em}
</style></head><body>
<canvas id="c" style="width:${W}px;height:${H}px"></canvas><div class="glow"></div>
<div class="marca">${MARCA[slug]}</div><div class="site">morethanmoney.pt</div><div class="cap" id="cap"></div><div class="nota" id="nota"></div>
<script type="module">
import { simulate, scannerCards } from '${SIM}'
import { drawCard } from '${D2}'
import * as i18n from '${I18N}'
window.sim = simulate('${slug}'); window.cards = scannerCards('${slug}')
window.cardText = (k, lang) => { try { const t = i18n.CARD_TEXT_EN?.['${slug}']?.[k]; if (lang === 'en' && t) return t.title } catch {} return window.cards[k].title }
window.draw = (k, lang, cap, nota) => { drawCard(document.querySelector('#c'), window.sim, window.cards[k], 1, lang); document.querySelector('#cap').textContent = cap; document.querySelector('#nota').textContent = nota }
await document.fonts.load('600 20px Inter')
window.ready = true
</script></body></html>`

async function prints(b, slug) {
  const out = path.join(RAIZ, 'public/scanners', slug); fs.mkdirSync(out, { recursive: true })
  const f = path.join(TMP, `${slug}.html`); fs.writeFileSync(f, html(slug))
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  p.on('pageerror', (e) => console.log('ERR', slug, e.message)); p.on('console', (m) => console.log('CON', m.type(), m.text()))
  await p.goto(pathToFileURL(f).href); await p.waitForFunction('window.ready')
  const vistas = VISTAS[slug] ?? VISTAS.default
  for (const lang of ['pt', 'en']) {
    for (let n = 0; n < vistas.length; n++) {
      const k = vistas[n]
      const cap = await p.evaluate(([k, l]) => window.cardText(k, l), [k, lang])
      await p.evaluate(([k, l, cap, nota]) => window.draw(k, l, cap, nota), [k, lang, cap, NOTA[lang]])
      await p.waitForTimeout(80)
      const nome = `render-${n + 1}${lang === 'en' ? '-en' : ''}.jpg`
      await p.screenshot({ path: path.join(out, nome), type: 'jpeg', quality: 86 })
      console.log(slug, nome, '←', cap)
    }
  }
  await p.close(); fs.rmSync(f)
}

const what = process.argv[2] || 'all'
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] })
for (const slug of what === 'all' ? Object.keys(MARCA) : [what]) await prints(b, slug)
await b.close(); fs.rmSync(TMP, { recursive: true, force: true })
