// Gera os materiais do RocketNova a partir da simulação da landing (components/scanner/sim):
// posters e vídeos da landing (PT/EN), capas e guias PDF da sala Estratégias (PT/EN).
// Uso (na raiz do repo): node docs/rocketnova/gerar-materiais.mjs [poster|capa|guia|video|all] → docs/rocketnova/saida/
// Depois copiar: poster*.jpg → public/scanners/rocketnova/, capa-*.jpg → public/educador/estrategias/capas/rocketnova-*.jpg,
// rocketnova-guia.pdf e rocketnova-guide-en.pdf → public/educador/estrategias/, apresentacao*.mp4 → public/scanners/rocketnova/.
// O vídeo sai sem narração: as falas estão em docs/rocketnova/narracao/landing-{pt,en}.txt para o clone Fish no Mac.
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
    kicker: 'ESTRATÉGIAS MTM', nome: 'ROCKETNOVA', sub: 'Médias, estrelas e gestão da trade', pill: 'Guia em PDF',
    simNota: 'Simulação com preços gerados', marca: 'RocketNova by MTM',
    abre: ['Descola com a tendência.', 'Com o plano a bordo.'],
    cta: 'morethanmoney.pt/scanner/rocketnova', aviso: 'Conteúdo educativo. Não é aconselhamento financeiro e os resultados não são garantidos.',
    cenas: [
      'EMA 20, 50 e 238: a tendência em três horizontes',
      'As estrelas marcam os máximos e mínimos de swing: a rampa de lançamento',
      'Rocket Candle, Volatility Pulse e Trade Clock: força, volatilidade e sessão',
      'Cruzamento confirmado com estrela recente: entrada, stop e TP1 a TP4 fixos na vela',
      'TP1 tocado: o stop passa para a entrada. Um sinal contrário fecha a trade',
    ],
  },
  en: {
    kicker: 'MTM STRATEGIES', nome: 'ROCKETNOVA', sub: 'Averages, stars and trade management', pill: 'PDF guide',
    simNota: 'Simulation with generated prices', marca: 'RocketNova by MTM',
    abre: ['Lift off with the trend.', 'With the plan on board.'],
    cta: 'morethanmoney.pt/en/scanner/rocketnova', aviso: 'Educational content. Not financial advice; results are not guaranteed.',
    cenas: [
      '20, 50 and 238 EMAs: the trend on three horizons',
      'Stars mark the swing highs and lows: the launch pad',
      'Rocket Candle, Volatility Pulse and Trade Clock: strength, volatility and session',
      'Confirmed cross with a recent star: entry, stop and TP1 to TP4 fixed on the candle',
      'TP1 hit: the stop moves to entry. An opposite signal closes the trade',
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
window.sim = simulate('rocketnova'); window.cards = scannerCards('rocketnova')
window.draw = (sel, k, p, lang) => { const c = document.querySelector(sel); drawCard(c, window.sim, window.cards[k], p, lang) }
// vista «plano»: janela à volta do último sinal, com as três médias, o sinal e os níveis
window.plano = (sel, p, lang, before = 40, after = 26) => { const s = window.sim, g = s.groups[s.groups.length - 1], N = s.candles.length
  const card = { win: [Math.max(0, g.i0 - before), Math.min(N - 1, g.i0 + after)], layers: { candles: true, lines: ['EMA 20', 'EMA 50', 'EMA 238'], groups: true, markers: true }, group: g }
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
<div class="marca">ROCKET<b>NOVA</b> · MTM</div><div class="cap">${T.cenas[3]}</div><div class="nota">${T.simNota}</div>`)
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
async function graficos(b, lang) {
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

const GUIA = {
  pt: {
    titulo: 'ROCKETNOVA', lead: 'Três médias, estrelas de lançamento, Rocket Candle e pulso de volatilidade. O sinal nasce no cruzamento confirmado ao lado de uma estrela, e o plano fica fixo na vela: entrada, stop e quatro alvos.',
    guia: 'Guia da estratégia', rodape: 'RocketNova · Educador MTM',
    meta: [['ESTILO', 'Seguimento de tendência, com estrutura e gestão da trade'], ['ATIVOS', 'Forex, ouro, índices e cripto'], ['TIMEFRAMES', 'Qualquer um: 5 e 15 minutos para intradiário, 1 hora e 4 horas para swing']],
    s: [
      ['A estratégia em poucas palavras', [
        'O RocketNova lê a tendência com três médias exponenciais: 20, 50 e 238. O sinal nasce quando a rápida cruza a lenta e a vela fecha. Mas o cruzamento sozinho não chega: por omissão a compra exige uma estrela de mínimo recente e a venda uma estrela de máximo, a rampa de lançamento.',
        'As estrelas são máximos e mínimos de swing confirmados por três definições: Depth (34 velas à esquerda), Deviation (1,3 ATR face à estrela contrária anterior) e Backstep (8 velas à direita). A Rocket Candle, uma vela com corpo de 1,2 ATR a fechar no extremo, mostra o impulso. O Volatility Pulse compara o ATR com a sua média e o Trade Clock mostra se estás na sessão e com volume.',
        'Entrada, stop e TP1 a TP4 ficam fixos na vela do sinal. Depois do TP1 o stop passa para a entrada; um sinal contrário fecha a trade. Tudo sai por alertas com o mesmo id, prontos para webhook.',
      ]],
      ['O que vês no gráfico', null],
      ['As confirmações', ['Tendência: a EMA 20 cruzou a 50 e a vela fechou. Com o filtro da EMA 238 ligado, compras só acima e vendas só abaixo da média longa.', 'Estrela de lançamento: há um mínimo de swing recente para a compra, ou um máximo para a venda, dentro das últimas 40 velas.', 'Rocket Candle: uma vela de impulso a favor nas últimas velas confirma a força (filtro opcional).', 'Volatility Pulse: o ATR está em Normal ou Alta. Em Baixa, o mercado está parado e os alvos demoram.', 'Trade Clock: estás dentro da sessão (08:00 a 21:00 por omissão) e o chip diz Good Volume.']],
      ['Entrada e gestão', ['Entra no fecho da vela do sinal, ao preço da etiqueta Entry.', 'O stop é fixo (100 pips, 200 no ouro) ou fica na última estrela contrária com uma folga de 0,2 ATR. Calcula o tamanho pelo risco até ao stop.', 'TP1 a TP4 a 30 %, 50 %, 100 % e 150 % do stop (60 % no TP2 do ouro). Fecha uma parte em cada alvo.', 'No TP1 o stop passa para a entrada: a partir daqui a trade não perde.', 'Um sinal contrário fecha o que restar. Nunca mudes o stop contra ti.']],
      ['Quando não entrar', ['Com o cruzamento sem estrela recente, ou com a estrela do lado errado.', 'Com o Trade Clock em Market Closed ou Low Volume.', 'Com o Volatility Pulse em Baixa e o preço colado às médias.', 'Contra a EMA 238 sem um motivo claro.', 'Em notícias de alto impacto.']],
      ['Os alertas', ['Cria o alerta com «Any alert() function call» e «Once Per Bar Close». A entrada chega com direção, entrada, stop e os quatro alvos; os seguimentos da mesma trade chegam com o mesmo id: tp1 a tp4, sl, be e exit. É isto que alimenta o chat MTM Auto RocketNova e o Tap to Trade.']],
      ['Checklist de bolso', ['Lado da EMA 238', 'Cruzamento fechado', 'Estrela recente do lado certo', 'Rocket Candle (se ligada)', 'Pulso Normal ou Alta', 'Trade Clock em Good Volume', 'Tamanho pelo risco', 'Stop para a entrada no TP1']],
    ],
    legendas: ['As três médias. EMA 20 (vermelha), EMA 50 (azul) e EMA 238 (laranja). A ordem das médias diz o lado do mercado.', 'As estrelas. ✦ verde num mínimo, ✦ vermelha num máximo. Aparecem depois das velas de Backstep.', 'O painel. Tendência, estrela, Rocket Candle, Volatility Pulse e Trade Clock, vela a vela.', 'O plano no gráfico. Entrada, SL e TP1 a TP4 fixos na vela do sinal.', 'A gestão. Depois do TP1 o stop passa para a entrada (SL em BE).'],
    aviso: 'Aviso. Este guia é educativo e não é aconselhamento financeiro. Negociar forex, índices, metais e cripto envolve risco elevado e podes perder parte ou a totalidade do capital. Resultados passados não garantem resultados futuros. Treina primeiro em conta demo e define o teu risco antes de cada entrada.',
  },
  en: {
    titulo: 'ROCKETNOVA', lead: 'Three averages, launch stars, the Rocket Candle and a volatility pulse. The signal is born on a confirmed cross next to a star, and the plan stays fixed on the candle: entry, stop and four targets.',
    guia: 'Strategy guide', rodape: 'RocketNova · MTM Educator',
    meta: [['STYLE', 'Trend following, with structure and trade management'], ['ASSETS', 'Forex, gold, indices and crypto'], ['TIMEFRAMES', 'Any: 5 and 15 minutes intraday, 1 hour and 4 hours for swings']],
    s: [
      ['The strategy in a few words', [
        'RocketNova reads the trend with three exponential averages: 20, 50 and 238. The signal is born when the fast one crosses the slow one and the candle closes. But the cross alone is not enough: by default a buy requires a recent low star and a sell a recent high star, the launch pad.',
        'Stars are swing highs and lows confirmed by three settings: Depth (34 bars to the left), Deviation (1.3 ATR from the previous opposite star) and Backstep (8 bars to the right). The Rocket Candle, a candle with a 1.2 ATR body closing in its extreme, shows the impulse. The Volatility Pulse compares ATR with its average and the Trade Clock shows whether you are in session and with volume.',
        'Entry, stop and TP1 to TP4 stay fixed on the signal candle. After TP1 the stop moves to entry; an opposite signal closes the trade. Everything goes out by alerts with the same id, ready for webhooks.',
      ]],
      ['What you see on the chart', null],
      ['The confirmations', ['Trend: the 20 EMA crossed the 50 and the candle closed. With the 238 EMA filter on, buys only above and sells only below the long average.', 'Launch star: there is a recent swing low for a buy, or a swing high for a sell, within the last 40 bars.', 'Rocket Candle: an impulse candle in favour within the last bars confirms strength (optional filter).', 'Volatility Pulse: ATR is Normal or High. On Low, the market is quiet and targets take longer.', 'Trade Clock: you are inside the session (08:00 to 21:00 by default) and the chip says Good Volume.']],
      ['Entry and management', ['Enter at the close of the signal candle, at the Entry label price.', 'The stop is fixed (100 pips, 200 on gold) or sits at the last opposite star with a 0.2 ATR buffer. Size the position by the risk to the stop.', 'TP1 to TP4 at 30%, 50%, 100% and 150% of the stop (60% for TP2 on gold). Close a part at each target.', 'At TP1 the stop moves to entry: from here the trade cannot lose.', 'An opposite signal closes whatever is left. Never move the stop against you.']],
      ['When not to enter', ['On a cross without a recent star, or with the star on the wrong side.', 'With the Trade Clock on Market Closed or Low Volume.', 'With the Volatility Pulse on Low and price glued to the averages.', 'Against the 238 EMA without a clear reason.', 'Around high-impact news.']],
      ['The alerts', ['Create the alert with "Any alert() function call" and "Once Per Bar Close". The entry arrives with direction, entry, stop and the four targets; follow-ups of the same trade arrive with the same id: tp1 to tp4, sl, be and exit. This is what feeds the MTM Auto RocketNova chat and Tap to Trade.']],
      ['Pocket checklist', ['Side of the 238 EMA', 'Closed cross', 'Recent star on the right side', 'Rocket Candle (if on)', 'Pulse Normal or High', 'Trade Clock on Good Volume', 'Size by risk', 'Stop to entry at TP1']],
    ],
    legendas: ['The three averages. 20 EMA (red), 50 EMA (blue) and 238 EMA (orange). The order of the averages tells the side of the market.', 'The stars. Green ✦ on a low, red ✦ on a high. They appear after the Backstep bars.', 'The panel. Trend, star, Rocket Candle, Volatility Pulse and Trade Clock, candle by candle.', 'The plan on the chart. Entry, SL and TP1 to TP4 fixed on the signal candle.', 'The management. After TP1 the stop moves to entry (SL at BE).'],
    aviso: 'Disclaimer. This guide is educational and is not financial advice. Trading forex, indices, metals and crypto involves high risk and you can lose part or all of your capital. Past results do not guarantee future results. Practise on a demo account first and define your risk before every entry.',
  },
}

async function guia(b, lang) {
  const G = GUIA[lang], T = TXT[lang]
  const imgs = await graficos(b, lang)
  const fig = (k) => `<figure><img src="${imgs[k]}"><figcaption>${G.legendas[k]}</figcaption></figure>`
  const sec = (n, [t, itens], extra = '') => `<section><div class="n">${String(n).padStart(2, '0')}</div><h2>${t}</h2>${itens ? (n === 1 ? itens.map((p) => `<p>${p}</p>`).join('') : `<ol>${itens.map((p) => `<li>${p}</li>`).join('')}</ol>`) : ''}${extra}</section>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url('${INTER}');font-weight:100 900}
@font-face{font-family:Anton;src:url('${ANTON}')}
@page{size:A4;margin:0}
@page conteudo{size:A4;margin:16mm 16mm 18mm}
body{margin:0;font-family:Inter,system-ui;color:#1a1814;background:#fff}
.pg{width:210mm;height:297mm;padding:18mm 16mm 20mm;box-sizing:border-box;page-break-after:always;position:relative}
.flow{page:conteudo}
.flow .meta,.flow .chk,.flow .aviso{break-inside:avoid} .flow h2{break-after:avoid}
.cover{background:#0b0a08;color:#f3ede1;display:flex;flex-direction:column;justify-content:center}
.cover .k{font:800 13px Inter;letter-spacing:.3em;color:#D2A63C}
.cover h1{font:400 150px/1 Anton;color:#E9C46A;margin:18px 0 10px}
.cover p{font:500 17px/1.5 Inter;max-width:150mm;color:#d9d3c5}
.cover .g{position:absolute;left:16mm;bottom:18mm;font:700 13px Inter;color:#D2A63C}
.cover .u{position:absolute;right:16mm;bottom:18mm;font:700 13px Inter;color:#eee}
.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin:0 0 10mm;padding:12px 14px;background:#faf6ea;border:1px solid #e8dcb6;border-radius:10px}
.meta b{display:block;font:800 10px Inter;letter-spacing:.2em;color:#9a7a26;margin-bottom:4px}
.meta span{font:500 11.5px/1.4 Inter}
.n{font:400 44px/1 Anton;color:#D2A63C}
h2{font:800 20px Inter;margin:2px 0 8px}
p,li{font:400 12.5px/1.55 Inter}
ol{padding-left:0;list-style:none;counter-reset:c}
ol li{counter-increment:c;position:relative;padding-left:30px;margin:0 0 6px}
ol li:before{content:counter(c);position:absolute;left:0;top:1px;width:20px;height:20px;border-radius:50%;background:#D2A63C;color:#111;font:800 11px/20px Inter;text-align:center}
section{margin-bottom:9mm}
figure{margin:0 0 7mm;break-inside:avoid}
figure img{width:100%;height:74mm;object-fit:cover;border-radius:8px;border:1px solid #e6e1d4;display:block}
figcaption{font:500 11px/1.45 Inter;color:#5e5a50;margin-top:5px}
.foot{display:none}
.chk li:before{content:'✓';background:#fff;border:1.5px solid #D2A63C;color:#9a7a26;line-height:17px}
.aviso{margin-top:8mm;padding:12px 14px;background:#faf6ea;border-left:4px solid #D2A63C;font:500 11px/1.5 Inter;color:#5e5a50}
</style></head><body>
<div class="pg cover"><div class="k">MORE THAN MONEY · ${lang === 'pt' ? 'EDUCADOR MTM' : 'MTM EDUCATOR'}</div><h1>${G.titulo}</h1><p>${G.lead}</p><div class="g">${G.guia}</div><div class="u">morethanmoney.pt</div></div>
<div class="flow"><div class="meta">${G.meta.map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('')}</div>${sec(1, G.s[0])}${sec(2, G.s[1], fig(0) + fig(1) + fig(2))}${sec(3, G.s[2])}${sec(4, G.s[3], fig(3) + fig(4))}${sec(5, G.s[4])}${sec(6, G.s[5])}<section class="chk"><div class="n">07</div><h2>${G.s[6][0]}</h2><ol>${G.s[6][1].map((x) => `<li>${x}</li>`).join('')}</ol></section><div class="aviso">${G.aviso}</div><div style="margin-top:6mm;font:600 10px Inter;color:#9a958a">${G.rodape} · morethanmoney.pt</div></div>
</body></html>`
  const f = path.join(OUT, `.guia-${lang}.html`); fs.writeFileSync(f, html)
  const p = await b.newPage()
  await p.goto(pathToFileURL(f).href); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300)
  await p.pdf({ path: path.join(OUT, lang === 'pt' ? 'rocketnova-guia.pdf' : 'rocketnova-guide-en.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true })
  await p.close(); fs.rmSync(f)
}

// ── vídeo da landing (1920×1080, 30 fps): abertura, 5 cenas animadas, fecho ───────────────
async function video(b, lang) {
  const T = TXT[lang]
  const W = 1920, H = 1080, FPS = 30
  const html = base(lang, W, H, `<canvas id="c" style="width:${W}px;height:${H}px"></canvas><div class="glow"></div>
<div class="marca">ROCKET<b>NOVA</b> · MTM</div><div class="cap" id="cap"></div><div class="nota">${T.simNota}</div>
<div id="abre" style="position:absolute;inset:0;background:#0b0a08;display:flex;flex-direction:column;justify-content:center;padding-left:140px;opacity:1;transition:opacity .4s">
<div style="font:800 22px Inter;letter-spacing:.3em;color:#D2A63C">MORETHANMONEY</div><div style="font:400 230px/1 Anton;color:#E9C46A;margin:12px 0">ROCKETNOVA</div>
<div style="font:700 44px/1.2 Inter;color:#f3ede1">${T.abre[0]}<br><span style="color:#D2A63C">${T.abre[1]}</span></div></div>
<div id="fim" style="position:absolute;inset:0;background:#0b0a08;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;opacity:0;transition:opacity .5s">
<div style="font:400 120px/1 Anton;color:#E9C46A">ROCKETNOVA by MTM</div><div style="font:800 40px Inter;color:#f3ede1;margin:26px 0 18px">${T.cta}</div>
<div style="font:500 22px Inter;color:#8a877f;max-width:1100px">${T.aviso}</div></div>`)
  const p = await page(html, W, H, b, 1)
  // RN_TEMPOS='{"abre":s,"cenas":[s×5],"fim":s}' estica as cenas à narração (docs/rocketnova/narracao/montar.mjs)
  const TEMPOS = process.env.RN_TEMPOS ? JSON.parse(process.env.RN_TEMPOS) : { abre: 3.0, cenas: [6.2, 6.2, 6.2, 6.2, 6.2], fim: 4.0 }
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
for (const lang of (process.env.RN_LANG ? [process.env.RN_LANG] : ['pt', 'en'])) {
  if (what === 'all' || what === 'poster') await poster(b, lang)
  if (what === 'all' || what === 'capa') await capa(b, lang)
  if (what === 'all' || what === 'guia') await guia(b, lang)
  if (what === 'all' || what === 'video') await video(b, lang)
}
await b.close()
console.log('feito:', fs.readdirSync(OUT).join(', '))
