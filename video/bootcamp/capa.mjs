// Capas do YouTube (1280×720) para cada módulo de um bootcamp, em PT e EN.
// Usa o gráfico da capa do guia da estratégia (public/educador/estrategias/capas/<slug>-<lang>.jpg).
// Uso: node video/bootcamp/capa.mjs <estrategia> [slug]   → saida/<estrategia>/capa-<n>-<lang>.jpg
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const { chromium } = createRequire(import.meta.url)('playwright')
const DIR = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.join(DIR, '../..')
const est = process.argv[2]
const b = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' })), p = await b.newPage({ viewport: { width: 1280, height: 720 } })
const out = path.join(DIR, 'saida', est); fs.mkdirSync(out, { recursive: true })
for (const lang of ['pt', 'en']) {
  const f = path.join(DIR, 'guioes', `${est}.${lang}.json`); if (!fs.existsSync(f)) continue
  const G = JSON.parse(fs.readFileSync(f, 'utf8')), slug = process.argv[3] || G.playlist || est, capa = path.join(RAIZ, 'public/educador/estrategias/capas', `${slug}-${lang}.jpg`)
  // com gráfico fiel ao Pine (<motor>.js) a capa mostra esse gráfico em vez da imagem do guia
  const motor = G.motor || est, motorJs = path.join(DIR, `${motor}.js`), fiel = fs.existsSync(motorJs)
  const grafico = fiel ? `<script src="${pathToFileURL(path.join(DIR, 'motor-base.js')).href}"></script><script src="${pathToFileURL(motorJs).href}"></script><script>
const el=(t,c,h,css)=>{const e=document.createElement(t); if(c) e.className=c; if(h!=null) e.innerHTML=h; if(css) Object.assign(e.style,css); return e}
window.capaPronta=document.fonts.load('600 13px Inter').then(()=>{ const Gr=MOTORES['${motor}'].grafico(document.querySelector('.img'),{w:860,h:600,left:20,top:70,cenario:'compra',seed:7},el)
const v={}; ['bandas','nuvem','cores','sinal','plano','medias','estrutura','poc','estrelas'].forEach(k=>v[k]=1); Gr.desenha(v,.95,.6) })
</script>` : ''
  for (const [i, V] of G.videos.entries()) {
    const n = G.videos.length
    const html = path.join(out, '.capa.html'); fs.writeFileSync(html, `<html><head><style>
@font-face{font-family:Anton;src:url('${pathToFileURL(path.join(RAIZ, 'public/fonts/Anton-Regular.ttf')).href}')}
@font-face{font-family:Inter;src:url('${pathToFileURL(path.join(DIR, '../apresentacao/fonts/inter-latin-wght-normal.woff2')).href}');font-weight:100 900}
body{margin:0;width:1280px;height:720px;overflow:hidden;background:#0b0a08;font-family:Inter;color:#f3ede1}
.img{position:absolute;right:-40px;top:0;width:780px;height:720px;${fiel ? 'overflow:hidden;' : `background:url('${pathToFileURL(capa).href}') right center/1280px 720px no-repeat;`}transform:perspective(1400px) rotateY(-14deg) scale(1.05);opacity:.95;-webkit-mask-image:linear-gradient(90deg,transparent 0,transparent 8%,#000 42%)}
.wrap{position:absolute;inset:0;-webkit-mask-image:linear-gradient(180deg,#000 72%,transparent 84%)}
.glow{position:absolute;inset:0;background:radial-gradient(700px 500px at 15% 30%,rgba(210,166,60,.22),transparent 60%)}
.k{position:absolute;left:64px;top:70px;font:800 24px Inter;letter-spacing:.28em;color:#D2A63C}
.t{position:absolute;left:58px;top:110px;font:400 170px/1 Anton;color:#E9C46A;text-shadow:0 8px 40px rgba(0,0,0,.6)}
.s{position:absolute;left:64px;top:320px;width:620px;font:800 52px/1.1 Inter}
.pill{position:absolute;left:64px;bottom:70px;padding:16px 30px;border-radius:999px;background:#D2A63C;color:#111;font:900 30px Inter}
.u{position:absolute;right:56px;bottom:74px;font:700 24px Inter;color:#eee}
</style></head><body><div class="wrap"><div class="img"></div></div>${grafico}<div class="glow"></div>
<div class="k">${(G.serie && G.serie[lang]) || 'BOOTCAMP MTM'}</div><div class="t">${G.estrategia}</div><div class="s">${V.titulo}</div>
<div class="pill">${(G.pilula && G.pilula[lang]) || (lang === 'pt' ? 'Módulo' : 'Module')} ${i + 1}/${n}</div><div class="u">morethanmoney.pt</div></body></html>`); await p.goto(pathToFileURL(html).href)
    await p.evaluate(() => window.capaPronta || document.fonts.ready); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200)
    await p.screenshot({ path: path.join(out, `capa-${i + 1}-${lang}.jpg`), type: 'jpeg', quality: 90 })
  }
}
fs.rmSync(path.join(out, '.capa.html'), { force: true }); await b.close(); console.log('capas em', out)
