#!/usr/bin/env node
/**
 * Academia de Vendas MTM — manuais de apoio em PDF (A4), um por função e um completo, em PT e EN.
 *
 *   node --experimental-strip-types video/formacao/manual.mjs <pasta-saida>
 *
 * Lê `lib/backoffice-formacao.ts` (a mesma fonte da página e dos vídeos) e imprime com o Chromium do
 * Playwright. Cada manual de função leva as aulas gerais e a aula do papel; o completo leva as oito.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { AULAS, CURSO, NOME_PAPEL } = await import(path.join(RAIZ, 'lib/backoffice-formacao.ts'))
const saida = process.argv[2] || path.join(RAIZ, 'out/formacao/manuais')
fs.mkdirSync(saida, { recursive: true })

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const logo = `file://${path.join(RAIZ, 'public/logo-mtm-transparent.png')}`
const fonte = (n) => `file://${path.join(RAIZ, 'video/motor/fontes', n)}`

const TX = {
  pt: { manual: 'Manual de apoio', completo: 'Manual completo da equipa', aula: 'Aula', obj: 'Objetivo', tarefa: 'Tarefa', guiao: 'Guião', quando: 'Quando', quiz: 'Perguntas de verificação', certa: 'Resposta', video: 'Vídeo da aula na playlist da Academia (não listado).' },
  en: { manual: 'Support manual', completo: 'Full team manual', aula: 'Lesson', obj: 'Goal', tarefa: 'Task', guiao: 'Script', quando: 'When', quiz: 'Check questions', certa: 'Answer', video: 'Lesson video in the Academy playlist (unlisted).' },
}

function cena(c, L, t) {
  if (c.tipo === 'capa' || c.tipo === 'fim') return ''
  if (c.tipo === 'lista' || c.tipo === 'regra')
    return `<div class="bloco"><h3>${esc(c.titulo[L])}</h3><ul class="${c.tipo}">${c.itens.map((i) => `<li>${esc(i[L])}</li>`).join('')}</ul></div>`
  if (c.tipo === 'fluxo')
    return `<div class="bloco"><h3>${esc(c.titulo[L])}</h3><ol class="fluxo">${c.passos.map((p, i) => `<li><b>${i + 1}</b><span>${esc(p[L])}</span></li>`).join('')}</ol></div>`
  if (c.tipo === 'mapa')
    return `<div class="bloco mapa"><div class="centro">${esc(c.centro[L])}</div><div class="ramos">${c.ramos.map((r) => `<div class="ramo"><b>${esc(r.nome[L])}</b><ul>${r.folhas.map((f) => `<li>${esc(f[L])}</li>`).join('')}</ul></div>`).join('')}</div></div>`
  if (c.tipo === 'ecra')
    return `<div class="bloco"><h3>${esc(c.titulo[L])}</h3><ol class="destaques">${c.destaques.map((d) => `<li>${esc(d[L])}</li>`).join('')}</ol><p class="fala">${esc(c.fala[L])}</p></div>`
  if (c.tipo === 'guiao')
    return `<div class="bloco"><h3>${t.guiao}: ${esc(c.titulo[L])}</h3><p class="quando">${t.quando}: ${esc(c.quando[L])}</p><div class="bolha">${esc(c.texto[L])}</div></div>`
  return ''
}

function html(aulas, L, titulo) {
  const t = TX[L]
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Anton;src:url('${fonte('Anton.ttf')}')}@font-face{font-family:Oswald;src:url('${fonte('Oswald.ttf')}')}
@page{size:A4;margin:16mm 15mm}
body{font:10.5pt/1.5 Inter,sans-serif;color:#18181b}
.capa{height:250mm;display:flex;flex-direction:column;justify-content:center;background:#0b0b0d;color:#fff;margin:-16mm -15mm 0;padding:0 22mm;page-break-after:always}
.capa img{height:60px;align-self:flex-start;margin-bottom:24mm}
.capa h1{font:400 46pt/1 Anton;color:#E9C46A}
.capa h2{font:500 18pt Oswald;margin-top:6mm;color:#e4e4e7}
.capa p{margin-top:14mm;color:#a1a1aa;font-size:9pt}
section{page-break-before:always}
.tag{font:600 8pt Inter;letter-spacing:.15em;text-transform:uppercase;color:#a07a1f}
h2.t{font:600 22pt Oswald;margin:2mm 0 3mm}
.obj{background:#faf6ea;border-left:4px solid #D2A63C;padding:3mm 4mm;margin-bottom:4mm}
.bloco{margin:4mm 0;page-break-inside:avoid}
h3{font:600 12.5pt Oswald;margin-bottom:2mm}
ul.lista li,ul.regra li{margin:1mm 0 1mm 5mm}
ul.regra li{color:#991b1b}
ol.fluxo{display:flex;gap:3mm;list-style:none}
ol.fluxo li{flex:1;border:1px solid #e4e4e7;border-radius:3mm;padding:3mm;text-align:center;font-size:9.5pt}
ol.fluxo b{display:block;margin:0 auto 2mm;width:8mm;height:8mm;border-radius:50%;background:#D2A63C;color:#fff;line-height:8mm}
.mapa .centro{margin:0 auto 3mm;width:30mm;height:30mm;border-radius:50%;background:#D2A63C;color:#111;display:flex;align-items:center;justify-content:center;text-align:center;font:400 12pt Anton;padding:3mm}
.mapa .ramos{display:flex;gap:3mm}
.mapa .ramo{flex:1;border:1.5px solid #D2A63C;border-radius:3mm;padding:3mm}
.mapa .ramo b{color:#a07a1f;font-family:Oswald;font-size:11.5pt}
.mapa .ramo li{margin-left:4mm;font-size:9.5pt}
ol.destaques li{margin-left:5mm}
.fala{color:#52525b;font-size:9.5pt;margin-top:1.5mm}
.quando{color:#71717a;font-size:9pt}
.bolha{background:#e8f5ee;border-radius:3mm;padding:3mm 4mm;margin-top:2mm;white-space:pre-wrap}
.tarefa{border:2px solid #D2A63C;border-radius:3mm;padding:3mm 4mm;margin-top:5mm}
.quiz li{margin:1.5mm 0 1.5mm 5mm}.quiz i{color:#15803d;font-style:normal}
.aviso{margin-top:6mm;color:#71717a;font-size:8pt}
</style></head><body>
<div class="capa"><img src="${logo}"><h1>${esc(CURSO.titulo[L])}</h1><h2>${esc(titulo)}</h2><p>${esc(CURSO.aviso[L])}</p></div>
${aulas.map((a) => `<section><div class="tag">${t.aula} ${a.numero} · ${esc(NOME_PAPEL[a.papel][L])}</div><h2 class="t">${esc(a.titulo[L])}</h2>
<div class="obj"><b>${t.obj}:</b> ${esc(a.objetivo[L])}<br><small>${t.video}</small></div>
${a.cenas.map((c) => cena(c, L, t)).join('')}
<div class="tarefa"><b>${t.tarefa}:</b> ${esc(a.tarefa[L])}</div>
<div class="bloco"><h3>${t.quiz}</h3><ol class="quiz">${a.quiz.map((q) => `<li>${esc(q.pergunta[L])} <i>${t.certa}: ${esc(q.opcoes[q.certa][L])} — ${esc(q.porque[L])}</i></li>`).join('')}</ol></div>
<p class="aviso">${esc(CURSO.aviso[L])}</p></section>`).join('')}
</body></html>`
}

const { chromium } = require('playwright')
const b = await chromium.launch()
const p = await b.newPage()
const tmp = path.join(saida, '_tmp.html')
const feitos = []
for (const L of ['pt', 'en']) {
  const conjuntos = [['completo', AULAS, TX[L].completo]]
  for (const papel of ['prospector', 'setter', 'closer', 'afiliado']) {
    conjuntos.push([papel, AULAS.filter((a) => a.papel === 'todos' || a.papel === papel), `${TX[L].manual} · ${NOME_PAPEL[papel][L]}`])
  }
  for (const [nome, aulas, titulo] of conjuntos) {
    fs.writeFileSync(tmp, html(aulas, L, titulo))
    await p.goto(`file://${tmp}`)
    await p.evaluate(() => document.fonts.ready)
    const f = path.join(saida, `academia-vendas-${nome}-${L}.pdf`)
    await p.pdf({ path: f, format: 'A4', printBackground: true, preferCSSPageSize: true })
    feitos.push(f)
  }
}
fs.rmSync(tmp)
await b.close()
console.log(feitos.join('\n'))
