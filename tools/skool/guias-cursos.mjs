// Guia do curso + caderno do aluno (A4, PDF) para cada curso do Skool MoreThanMoney.
//   node tools/skool/guias-cursos.mjs            → todos
//   node tools/skool/guias-cursos.mjs momentum   → só um
// Conteúdo: docs/skool/guias/conteudo.mjs · Saída: public/skool/guias/<slug>-guia.pdf e <slug>-caderno.pdf
// Ouro sobre carvão (#D2A63C / #E9C46A), Anton + Inter, disclaimer educativo em todas as páginas.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { CURSOS, REGRAS_BASE } = await import(pathToFileURL(path.join(RAIZ, 'docs/skool/guias/conteudo.mjs')).href)
const OUT = path.join(RAIZ, 'public/skool/guias')
fs.mkdirSync(OUT, { recursive: true })
const so = process.argv[2]

const fonte = f => `url(data:font/ttf;base64,${fs.readFileSync(path.join(RAIZ, 'tools/ebooks/fontes', f)).toString('base64')})`
const LOGO = `data:image/png;base64,${fs.readFileSync(path.join(RAIZ, 'public/logo-mtm-transparent.png')).toString('base64')}`
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
const AVISO = 'Conteúdo educativo. Não é aconselhamento financeiro. Operar nos mercados tem risco de perda, que pode ser total. Os resultados não são garantidos.'

const CSS = `
@font-face{font-family:Anton;src:${fonte('Anton.ttf')}}
@font-face{font-family:Inter;src:${fonte('Inter-1.ttf')};font-weight:100 900}
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,sans-serif;color:#1d1b17;font-size:10.5pt;line-height:1.5}
.pg{width:210mm;height:297mm;position:relative;overflow:hidden;page-break-after:always;padding:20mm 18mm 24mm}
.pg:last-child{page-break-after:auto}
.escura{background:#0c0b09;color:#f3ede1}
.capa{display:flex;flex-direction:column;justify-content:space-between;background:radial-gradient(120mm 90mm at 20% 18%,rgba(210,166,60,.28),transparent 70%),#0c0b09;color:#f3ede1}
.capa img{width:34mm}
.kick{font:800 9pt Inter;letter-spacing:.22em;color:#D2A63C;text-transform:uppercase}
h1{font-family:Anton;font-weight:400;font-size:44pt;line-height:1.02;margin:6mm 0 4mm;color:#E9C46A;text-transform:uppercase}
.sub{font-size:14pt;color:#e7dfcf;max-width:150mm}
.pill{display:inline-block;margin-top:8mm;padding:2mm 5mm;border:1px solid #D2A63C;border-radius:20mm;color:#E9C46A;font:700 9pt Inter;letter-spacing:.08em}
h2{font-family:Anton;font-weight:400;font-size:22pt;margin:0 0 5mm;color:#0c0b09;text-transform:uppercase;letter-spacing:.01em}
h2 span{color:#D2A63C}
h3{font:800 12pt Inter;margin:6mm 0 2mm;color:#0c0b09}
.barra{height:2.2mm;width:24mm;background:#D2A63C;margin-bottom:5mm}
ul{margin:0;padding-left:5mm} li{margin:1.4mm 0}
.caixa{border-left:3px solid #D2A63C;background:#f7f2e6;padding:4mm 5mm;margin:4mm 0;border-radius:0 2mm 2mm 0}
.mod{border:1px solid #e4dccb;border-radius:3mm;padding:4mm 5mm;margin:0 0 4mm;break-inside:avoid}
.mod .n{font:800 8.5pt Inter;letter-spacing:.16em;color:#a07a22;text-transform:uppercase}
.mod .t{font:800 12.5pt Inter;margin:1mm 0 2mm}
.aulas{font-size:9.5pt;color:#5b554a}
.tab{width:100%;border-collapse:collapse;font-size:9.5pt}
.tab td,.tab th{border-bottom:1px solid #e4dccb;padding:2mm 1.5mm;text-align:left;vertical-align:top}
.tab th{font:800 8.5pt Inter;letter-spacing:.1em;text-transform:uppercase;color:#a07a22}
.linhas div{border-bottom:1px solid #cfc6b3;height:8mm}
.check{display:flex;gap:3mm;margin:2mm 0} .check i{width:4mm;height:4mm;border:1.4px solid #a07a22;border-radius:1mm;flex:none;margin-top:.8mm}
.rod{position:absolute;left:18mm;right:18mm;bottom:9mm;font-size:7.3pt;color:#8a8377;display:flex;justify-content:space-between;gap:6mm}
.escura .rod,.capa .rod{color:#8a877f}
.quiz li{margin:3mm 0}.op{color:#5b554a;font-size:9.5pt}
`

const rod = (c, tipo) => `<div class="rod"><span>${esc(AVISO)}</span><span style="white-space:nowrap">${esc(c.titulo)} · ${tipo}</span></div>`
const capa = (c, tipo) => `<section class="pg capa"><div><img src="${LOGO}"><div class="kick" style="margin-top:10mm">MoreThanMoney · Skool · ${esc(c.patamar)}</div><h1>${esc(c.titulo)}</h1><div class="sub">${esc(c.sub)}</div><div class="pill">${tipo}</div></div><div style="font-size:9.5pt;color:#cfc6b3;max-width:150mm">${esc(c.para)}</div>${rod(c, tipo)}</section>`

function guia(c) {
  const p = []
  p.push(capa(c, 'Guia do curso'))
  p.push(`<section class="pg"><h2>Para que <span>serve</span> este curso</h2><div class="barra"></div>
    <p style="font-size:12pt">${esc(c.objetivo)}</p>
    <h3>Como usar</h3><ul>${c.comoUsar.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <h3>O plano</h3><table class="tab"><tr><th>Quando</th><th>O que fazes</th></tr>${c.plano.map(([a, b]) => `<tr><td style="white-space:nowrap;font-weight:700">${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>
    <div class="caixa"><b>Leva contigo o caderno do aluno.</b> Tem os exercícios, as perguntas e o quiz de cada parte deste curso.</div>
    <h3>Links úteis</h3><table class="tab">${c.links.map(([a, b]) => `<tr><td style="font-weight:700">${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>
    ${rod(c, 'Guia do curso')}</section>`)
  // mapa do curso: 3 módulos por página
  for (let i = 0; i < c.modulos.length; i += 3) {
    const bloco = c.modulos.slice(i, i + 3)
    p.push(`<section class="pg"><h2>O mapa do <span>curso</span></h2><div class="barra"></div>${bloco.map((m, k) => `<div class="mod"><div class="n">Parte ${i + k + 1}</div><div class="t">${esc(m.titulo)}</div><div class="aulas">Aulas: ${m.aulas.map(esc).join(' · ')}</div><ul style="margin-top:2mm">${m.pontos.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}${rod(c, 'Guia do curso')}</section>`)
  }
  p.push(`<section class="pg escura"><h2 style="color:#E9C46A">As regras que <span>não se quebram</span></h2><div class="barra"></div><ul style="font-size:12pt">${REGRAS_BASE.map(x => `<li style="margin:4mm 0">${esc(x)}</li>`).join('')}</ul>
    <div style="margin-top:14mm;font-size:11pt;color:#cfc6b3">Dúvidas? Escreve na comunidade do Skool ou marca uma sessão em morethanmoney.pt/agendar.</div>${rod(c, 'Guia do curso')}</section>`)
  return p.join('')
}

function caderno(c) {
  const p = []
  p.push(capa(c, 'Caderno do aluno'))
  p.push(`<section class="pg"><h2>Os meus <span>dados</span></h2><div class="barra"></div>
    <table class="tab"><tr><td style="width:55mm;font-weight:700">Nome</td><td></td></tr><tr><td style="font-weight:700">Comecei o curso a</td><td></td></tr><tr><td style="font-weight:700">Objetivo para 90 dias</td><td style="height:16mm"></td></tr><tr><td style="font-weight:700">Risco máximo por trade</td><td></td></tr><tr><td style="font-weight:700">Horas por dia que consigo dar</td><td></td></tr></table>
    <h3>Progresso</h3>${c.modulos.map((m, i) => `<div class="check"><i></i><span>Parte ${i + 1} · ${esc(m.titulo)}</span></div>`).join('')}
    ${rod(c, 'Caderno do aluno')}</section>`)
  c.modulos.forEach((m, i) => {
    p.push(`<section class="pg"><div class="kick" style="color:#a07a22">Parte ${i + 1}</div><h2 style="margin-top:2mm">${esc(m.titulo)}</h2><div class="barra"></div>
      <h3>Para levar desta parte</h3><ul>${m.pontos.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="caixa"><b>Para fazer:</b> ${esc(m.exercicio)}</div>
      ${m.perguntas.map(q => `<h3>${esc(q)}</h3><div class="linhas">${'<div></div>'.repeat(3)}</div>`).join('')}
      <h3>As minhas notas</h3><div class="linhas">${'<div></div>'.repeat(Math.max(3, 8 - m.perguntas.length * 2))}</div>
      ${rod(c, 'Caderno do aluno')}</section>`)
  })
  p.push(`<section class="pg"><h2>Diário de <span>trading</span></h2><div class="barra"></div><table class="tab"><tr><th>Data</th><th>Ativo</th><th>Setup</th><th>Entrada</th><th>Stop</th><th>Alvo</th><th>Resultado (R)</th><th>Segui o plano?</th></tr>${'<tr>' + '<td style="height:9.5mm"></td>'.repeat(8) + '</tr>'}${('<tr>' + '<td style="height:9.5mm"></td>'.repeat(8) + '</tr>').repeat(19)}</table>${rod(c, 'Caderno do aluno')}</section>`)
  p.push(`<section class="pg"><h2>Quiz de <span>verificação</span></h2><div class="barra"></div><ol class="quiz">${c.quiz.map(q => `<li><b>${esc(q.p)}</b><div class="op">${q.op.map((o, k) => `${'ABC'[k]}) ${esc(o)}`).join(' &nbsp; ')}</div></li>`).join('')}</ol>
    <div style="margin-top:12mm;font-size:8.5pt;color:#8a8377;transform:rotate(180deg);text-align:right">Soluções: ${c.quiz.map((q, i) => `${i + 1}-${'ABC'[q.c]}`).join(' · ')}</div>${rod(c, 'Caderno do aluno')}</section>`)
  return p.join('')
}

const browser = await chromium.launch()
const page = await browser.newPage()
for (const c of CURSOS.filter(x => !so || x.slug === so)) {
  for (const [tipo, fn] of [['guia', guia], ['caderno', caderno]]) {
    await page.setContent(`<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${fn(c)}</body></html>`, { waitUntil: 'load' })
    const f = path.join(OUT, `${c.slug}-${tipo}.pdf`)
    await page.pdf({ path: f, format: 'A4', printBackground: true })
    console.log(f.replace(RAIZ + '/', ''), Math.round(fs.statSync(f).size / 1024) + ' KB')
  }
}
await browser.close()
