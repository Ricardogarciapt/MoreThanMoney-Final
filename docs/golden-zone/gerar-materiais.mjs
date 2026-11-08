// Gera os materiais da Golden Zone a partir da simulação da landing (components/scanner/sim):
// posters e vídeos da landing (PT/EN), capas e guias PDF da sala Estratégias (PT/EN).
// Uso (na raiz do repo): node docs/golden-zone/gerar-materiais.mjs [poster|capa|guia|video|all] → docs/golden-zone/saida/
// Depois copiar: poster*.jpg → public/scanners/golden-zone/, capa-*.jpg → public/educador/estrategias/capas/golden-zone-*.jpg,
// apresentacao*.mp4 → public/scanners/golden-zone/.
// O vídeo sai sem narração: as falas estão em docs/golden-zone/narracao/landing-{pt,en}.txt para o clone Fish no Mac.
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
    kicker: 'ESTRATÉGIAS MTM', nome: 'GOLDEN ZONE', sub: 'Níveis psicológicos, zona de ação e plano completo', pill: 'Guia em PDF',
    simNota: 'Simulação com preços gerados', marca: 'Golden Zone by MTM',
    abre: ['O ouro reage nos níveis.', 'A zona diz-te onde esperar.'],
    cta: 'morethanmoney.pt/scanner/golden-zone', aviso: 'Conteúdo educativo. Não é aconselhamento financeiro e os resultados não são garantidos.',
    cenas: [
      'Níveis psicológicos de 5 em 5 $ no ouro, dez à volta do preço',
      'A vela fecha para lá do nível a favor da tendência: visto amarelo e zona de 1 $',
      'O preço recua à zona de ação: invalidação a 150 pontos, Saída 1 a +1,5 $ e Saída 2 a +3 $',
      'Saída 1 tocada: bandeira branca. Saída 2 ou invalidação fecham o plano',
      'Quatro confirmações do guia e alertas por evento, prontos para webhook',
    ],
  },
  en: {
    kicker: 'MTM STRATEGIES', nome: 'GOLDEN ZONE', sub: 'Psychological levels, zone of action and full plan', pill: 'PDF guide',
    simNota: 'Simulation with generated prices', marca: 'Golden Zone by MTM',
    abre: ['Gold reacts at the levels.', 'The zone tells you where to wait.'],
    cta: 'morethanmoney.pt/en/scanner/golden-zone', aviso: 'Educational content. Not financial advice; results are not guaranteed.',
    cenas: [
      'Psychological levels every 5 $ in gold, ten around price',
      'The candle closes beyond the level with the trend: yellow check and a 1 $ zone',
      'Price pulls back to the zone of action: invalidation 150 points away, Exit 1 at +1.5 $ and Exit 2 at +3 $',
      'Exit 1 touched: white flag. Exit 2 or the invalidation close the plan',
      'The four confirmations of the guide and alerts per event, ready for webhooks',
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
window.sim = simulate('golden-zone'); window.cards = scannerCards('golden-zone')
window.draw = (sel, k, p, lang) => { const c = document.querySelector(sel); drawCard(c, window.sim, window.cards[k], p, lang) }
// vista «plano»: janela à volta do exemplo completo, com os níveis psicológicos, o visto, a zona, o plano e a bandeira
window.plano = (sel, p, lang, before = 30, after = 22) => { const s = window.sim, b = s.best, g = s.groups.find((x) => x.i0 === b.plan) || s.groups[s.groups.length - 1], N = s.candles.length
  const psy = s.lines.filter((l) => l.psy).map((l) => l.name)
  const card = { win: [Math.max(0, b.i - before), Math.min(N - 1, b.i + after)], layers: { candles: true, lines: psy, zones: true, groups: true, markers: true }, group: g }
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
<div class="marca">GOLDEN <b>ZONE</b> · MTM</div><div class="cap">${T.cenas[3]}</div><div class="nota">${T.simNota}</div>`)
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
<div style="position:absolute;left:64px;top:128px;font:400 96px/1 Anton;color:#E9C46A;text-shadow:0 8px 40px rgba(0,0,0,.6);letter-spacing:-0.01em">${T.nome}</div>
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
async function graficos(b, lang) { // (sem uso: o guia PDF da Golden Zone já existe na sala)
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
<div class="marca">GOLDEN <b>ZONE</b> · MTM</div><div class="cap" id="cap"></div><div class="nota">${T.simNota}</div>
<div id="abre" style="position:absolute;inset:0;background:#0b0a08;display:flex;flex-direction:column;justify-content:center;padding-left:140px;opacity:1;transition:opacity .4s">
<div style="font:800 22px Inter;letter-spacing:.3em;color:#D2A63C">MORETHANMONEY</div><div style="font:400 190px/1 Anton;color:#E9C46A;margin:12px 0">GOLDEN ZONE</div>
<div style="font:700 44px/1.2 Inter;color:#f3ede1">${T.abre[0]}<br><span style="color:#D2A63C">${T.abre[1]}</span></div></div>
<div id="fim" style="position:absolute;inset:0;background:#0b0a08;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;opacity:0;transition:opacity .5s">
<div style="font:400 110px/1 Anton;color:#E9C46A">GOLDEN ZONE by MTM</div><div style="font:800 40px Inter;color:#f3ede1;margin:26px 0 18px">${T.cta}</div>
<div style="font:500 22px Inter;color:#8a877f;max-width:1100px">${T.aviso}</div></div>`)
  const p = await page(html, W, H, b, 1)
  // GZ_TEMPOS='{"abre":s,"cenas":[s×5],"fim":s}' estica as cenas à narração (docs/golden-zone/narracao/montar.mjs)
  const TEMPOS = process.env.GZ_TEMPOS ? JSON.parse(process.env.GZ_TEMPOS) : { abre: 3.0, cenas: [6.2, 6.2, 6.2, 6.2, 6.2], fim: 4.0 }
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
for (const lang of (process.env.GZ_LANG ? [process.env.GZ_LANG] : ['pt', 'en'])) {
  if (what === 'all' || what === 'poster') await poster(b, lang)
  if (what === 'all' || what === 'capa') await capa(b, lang)
    if (what === 'all' || what === 'video') await video(b, lang)
}
await b.close()
console.log('feito:', fs.readdirSync(OUT).join(', '))
