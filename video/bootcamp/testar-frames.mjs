// Tira screenshots de cenas sem voz nem vídeo, para rever gráficos depressa.
// Uso: node video/bootcamp/testar-frames.mjs <est> <video> <pt|en> <cena@segundos> …   (OUT=pasta, por omissão saida/_frames)
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'
const { chromium } = createRequire(import.meta.url)('playwright')
const [est, nv, lang, ...ts] = process.argv.slice(2)
const G = JSON.parse(fs.readFileSync(`guioes/${est}.${lang}.json`, 'utf8')), V = G.videos[nv - 1]
let t = .5; const TL = V.cenas.map(c => { const d = c.fala ? c.fala.split(/\s+/).length / 2.5 + .7 : (c.semVoz || 4); const o = { id: c.id, ini: t, dur: d, fala: d - .7, frases: [] }; t += d; return o })
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
p.on('pageerror', e => console.log('ERRO página', e.message)); p.on('console', m => m.type() === 'error' && console.log('consola', m.text()))
await p.goto('file://' + path.resolve('cenas.html'))
if (fs.existsSync(`${G.motor || est}.js`)) await p.addScriptTag({ path: path.resolve(`${G.motor || est}.js`) })
await p.evaluate(([tl, d, tot]) => { window.TOTAL = tot; window.iniciar(tl, false, d) }, [TL, { cenas: Object.fromEntries(V.cenas.map(c => [c.id, c])), ui: G.ui, cores: G.cores, marca: 'x', nome: G.estrategia, plano: G.plano, est, motor: G.motor || est, lang }, t])
const out = process.env.OUT || 'saida/_frames'; fs.mkdirSync(out, { recursive: true })
for (const x of ts) { const [id, k] = x.split('@'); const c = TL.find(c => c.id === id); const tt = c ? c.ini + Number(k ?? c.dur * .8) : Number(x)
  await p.evaluate(v => window.renderAt(v), tt); await p.screenshot({ path: `${out}/${est}-${nv}-${x.replace(/[@.]/g, '_')}.jpg`, type: 'jpeg', quality: 70 }) }
await b.close(); console.log('ok', out)
