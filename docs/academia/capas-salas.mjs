// Capas das salas do educador MTM na Academia (1600×800, 2:1 como o cartão do lobby).
// Uso: node docs/academia/capas-salas.mjs → public/academia/capas/<sala>.jpg
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const { chromium } = createRequire(import.meta.url)('playwright')
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(RAIZ, 'public/academia/capas'); fs.mkdirSync(OUT, { recursive: true })
const u = (p) => pathToFileURL(path.join(RAIZ, p)).href

const SALAS = [
  {
    id: 'webtrader-mtm', kicker: 'BOOTCAMP · 6 AULAS EM VÍDEO', t1: 'WEBTRADER', t2: 'MTM',
    sub: 'A plataforma de trading da casa, passo a passo',
    pilulas: ['Simple e PRO', 'Ticket com risco', 'Trailing Stop', 'Auto Break-Even', 'Sinais MTM', 'Diário e auditoria'],
    img: 'video/bootcamp/capturas/webtrader/bootcamp-bruto-pro-xauusd.jpg', modo: 'ecra',
  },
  {
    id: 'estrategias-mtm', kicker: 'BOOTCAMPS EM VÍDEO · GUIAS EM PDF', t1: 'ESTRATÉGIAS', t2: 'MTM',
    sub: 'Os scanners da casa explicados um a um',
    pilulas: ['Golden Zone', 'Momentum', 'TrendShot', 'RocketNova', 'GoldKiller', 'MTM Scanner', 'Sensei', 'DEFY'],
    img: 'public/educador/estrategias/capas/sala-pt.jpg', modo: 'grafico',
  },
]

const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1600, height: 800 } })
for (const S of SALAS) {
  const fundo = S.modo === 'ecra'
    ? `<div class="ecra"><img src="${u(S.img)}"></div>`
    : `<div class="graf" style="background-image:url('${u(S.img)}')"></div>`
  const html = path.join(OUT, '.capa.html')
  fs.writeFileSync(html, `<html><head><style>
@font-face{font-family:Anton;src:url('${u('public/fonts/Anton-Regular.ttf')}')}
@font-face{font-family:Inter;src:url('${u('video/apresentacao/fonts/inter-latin-wght-normal.woff2')}');font-weight:100 900}
*{box-sizing:border-box}body{margin:0;width:1600px;height:800px;overflow:hidden;background:#09080a;font-family:Inter;color:#f3ede1;position:relative}
.glow{position:absolute;inset:0;background:radial-gradient(900px 600px at 10% 20%,rgba(210,166,60,.20),transparent 60%),radial-gradient(700px 500px at 85% 90%,rgba(210,166,60,.10),transparent 60%)}
.ecra{position:absolute;right:-60px;top:110px;width:900px;height:560px;transform:perspective(1600px) rotateY(-16deg) rotateX(4deg);border-radius:18px;overflow:hidden;border:2px solid rgba(210,166,60,.55);box-shadow:0 40px 120px rgba(0,0,0,.8),0 0 80px rgba(210,166,60,.18)}
.ecra img{width:100%;height:100%;object-fit:cover;object-position:left top}
.ecra:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(9,8,10,.55),transparent 35%)}
.graf{position:absolute;right:0;top:0;width:760px;height:800px;background-size:auto 1100px;background-position:right 60%;background-repeat:no-repeat;-webkit-mask-image:linear-gradient(90deg,transparent,#000 40%)}
.fade{position:absolute;inset:0;background:linear-gradient(90deg,#09080a 0,#09080a 30%,rgba(9,8,10,.6) 52%,transparent 72%)}
.logo{position:absolute;left:76px;top:30px;height:110px}
.k{position:absolute;left:88px;top:160px;font:800 22px Inter;letter-spacing:.3em;color:#D2A63C}
.t{position:absolute;left:82px;top:190px;padding-top:30px;font:400 172px/0.92 Anton;background:linear-gradient(180deg,#F3D27A,#D2A63C 60%,#B8862A);-webkit-background-clip:text;color:transparent;text-shadow:none}
.t span{display:block}
.s{position:absolute;left:88px;top:550px;font:700 34px Inter;color:#f3ede1}
.pp{position:absolute;left:88px;top:615px;width:860px;display:flex;flex-wrap:wrap;gap:12px}
.pp span{padding:9px 20px;border:2px solid rgba(210,166,60,.7);border-radius:999px;font:700 22px Inter;color:#f3ede1;background:rgba(0,0,0,.45)}
.u{position:absolute;right:60px;bottom:44px;font:700 22px Inter;color:#E9C46A;background:rgba(0,0,0,.6);padding:8px 18px;border-radius:999px}
</style></head><body>${fundo}<div class="fade"></div><div class="glow"></div>
<img class="logo" src="${u('public/logo-mtm-transparent.png')}">
<div class="k">${S.kicker}</div><div class="t"><span>${S.t1}</span><span>${S.t2}</span></div>
<div class="s">${S.sub}</div><div class="pp">${S.pilulas.map(x => `<span>${x}</span>`).join('')}</div>
<div class="u">morethanmoney.pt</div></body></html>`)
  await p.goto(pathToFileURL(html).href)
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300)
  await p.screenshot({ path: path.join(OUT, `${S.id}.jpg`), type: 'jpeg', quality: 88 })
}
fs.rmSync(path.join(OUT, '.capa.html'), { force: true })
await b.close(); console.log('capas em', OUT)
