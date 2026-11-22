// Slides e caderno do aluno de um bootcamp, a partir dos guiões (modulo-N.md).
//
//   node tools/ebooks/slides-bootcamp.mjs a-primeira-chave        (PT)
//   node tools/ebooks/slides-bootcamp.mjs a-primeira-chave-en     (EN; também -fr, -es)
//
// Entrada: conteudo-privado/ebooks/bootcamps/<slug>/modulo-N.md
// Saída:   conteudo-privado/ebooks/bootcamps/<slug>/producao/slides/modulo-N.pdf   (16:9, um slide por cena,
//          mais capa, gancho, resumo e fecho de cada aula; servem de fundo aos vídeos e de apoio ao aluno)
//          conteudo-privado/ebooks/bootcamps/<slug>/producao/caderno/modulo-N.pdf  (A4: objetivos, termos,
//          exercícios, perguntas de verificação e linhas para escrever)
// Os rótulos de marcação dos guiões ficam sempre em PT (**[CENA N]**, **NARRAÇÃO:** …) em todas as línguas.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const slug = process.argv[2] || 'a-primeira-chave'
const soModulo = process.argv[3] ? Number(process.argv[3]) : null
const lingua = (slug.match(/-(en|es|fr)$/) || [])[1] || 'pt'
const dir = path.join(RAIZ, 'conteudo-privado/ebooks/bootcamps', slug)
const outSlides = path.join(dir, 'producao/slides')
const outCaderno = path.join(dir, 'producao/caderno')
fs.mkdirSync(outSlides, { recursive: true })
fs.mkdirSync(outCaderno, { recursive: true })

const TX = {
  pt: { html: 'pt-PT', modulo: 'Módulo', aula: 'Aula', bootcamp: 'A Primeira Chave · Programa Completo', educador: 'Educador de cripto', resumo: 'Para levar desta aula', exercicio: 'Para fazer', missao: 'Missão do módulo', objetivo: 'Objetivo', consegue: 'No fim, consegues', caderno: 'Caderno do aluno', notas: 'As minhas notas', termos: 'Palavras-chave', feito: 'Feito', aviso: 'Conteúdo educativo. Não é aconselhamento financeiro. O risco de perda é real e pode ser total.' },
  en: { html: 'en-GB', modulo: 'Module', aula: 'Lesson', bootcamp: 'The First Key · Complete Programme', educador: 'Crypto educator', resumo: 'Take this from the lesson', exercicio: 'To do', missao: 'Module mission', objetivo: 'Goal', consegue: 'By the end, you can', caderno: 'Student workbook', notas: 'My notes', termos: 'Key words', feito: 'Done', aviso: 'Educational content. Not financial advice. The risk of loss is real and can be total.' },
  es: { html: 'es-ES', modulo: 'Módulo', aula: 'Clase', bootcamp: 'La Primera Llave · Programa Completo', educador: 'Educador de cripto', resumo: 'Lo que te llevas de esta clase', exercicio: 'Para hacer', missao: 'Misión del módulo', objetivo: 'Objetivo', consegue: 'Al final, podrás', caderno: 'Cuaderno del alumno', notas: 'Mis notas', termos: 'Palabras clave', feito: 'Hecho', aviso: 'Contenido educativo. No es asesoramiento financiero. El riesgo de pérdida es real y puede ser total.' },
  fr: { html: 'fr-FR', modulo: 'Module', aula: 'Leçon', bootcamp: 'La Première Clé · Programme Complet', educador: 'Éducateur crypto', resumo: 'À retenir de cette leçon', exercicio: 'À faire', missao: 'Mission du module', objetivo: 'Objectif', consegue: 'À la fin, tu sais', caderno: "Cahier de l'élève", notas: 'Mes notes', termos: 'Mots clés', feito: 'Fait', aviso: "Contenu éducatif. Ce n'est pas un conseil financier. Le risque de perte est réel et peut être total." },
}
const t = TX[lingua]

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const limpar = (s) => s.replace(/\*\*/g, '').replace(/["“”]/g, '').replace(/^«\s*|\s*»$/g, '').trim()
const fonte = (f) => `url(data:font/ttf;base64,${fs.readFileSync(path.join(RAIZ, 'tools/ebooks/fontes', f)).toString('base64')})`
const foto = (f) => `data:image/jpeg;base64,${fs.readFileSync(path.join(RAIZ, 'public/educadores/ruben', f)).toString('base64')}`
const FONTES = `@font-face{font-family:Anton;src:${fonte('Anton.ttf')}}@font-face{font-family:Inter;src:${fonte('Inter-1.ttf')};font-weight:400}@font-face{font-family:Inter;src:${fonte('Inter-2.ttf')};font-weight:700}@font-face{font-family:Kalam;src:${fonte('Kalam.ttf')}}`
const RETRATO = foto('retrato.jpg')

// frase-chave de uma cena: a mais curta que tenha uma palavra do ecrã; senão a primeira frase curta
function fraseChave(narr, termos) {
  const frases = narr.split(/(?<=[.!?])\s+/).map((f) => f.trim()).filter((f) => f.length >= 25 && f.length <= 150)
  const comTermo = frases.filter((f) => termos.some((k) => k.length > 3 && f.toLowerCase().includes(k.toLowerCase())))
  return (comTermo.sort((a, b) => a.length - b.length)[0]) || frases[0] || narr.split(/(?<=[.!?])\s+/)[0].slice(0, 150)
}

function lerModulo(f) {
  const md = fs.readFileSync(path.join(dir, f), 'utf8')
  const num = Number(f.match(/\d+/)[0])
  const cab = md.match(/^# Módulo \d+ — (.+?)(?:\s*\(≈[^)]*\))?\s*$/m)
  const objetivo = limpar((md.match(/\*\*Objetivo:\*\*\s*(.+?)(?=\s*\*\*No fim|\n)/) || [])[1] || '')
  const consegue = limpar((md.match(/\*\*No fim, o aluno consegue:\*\*\s*(.+)/) || [])[1] || '')
  const missao = limpar((md.match(/^\*\*[^*\n]*(?:Miss|Misi)[^*\n]*:?\*\*:?\s*(.+)$/mi) || [])[1] || '')
  const aulas = []
  for (const bloco of md.split(/^## /m).slice(1)) {
    const linha = bloco.split('\n')[0]
    const id = (linha.match(/Aula (\d+\.\d+)/) || [])[1]
    if (!id) continue
    const titulo = linha.replace(/^Aula \d+\.\d+ — /, '').replace(/\s*\(≈[^)]*\)\s*$/, '').trim()
    const gancho = limpar((bloco.match(/\*\*Gancho[^*]*\*\*:?\s*(.+)/) || [])[1] || '')
    const termos = ((bloco.match(/\*\*Texto no ecrã:\*\*\s*(.+)/) || [])[1] || '').split('·').map((x) => limpar(x)).filter(Boolean)
    const fecho = limpar(((bloco.match(/\*\*Fecho \/ CTA da aula:\*\*\s*(.+)/) || [])[1] || '').replace(/«\s*|\s*»/g, ''))
    const cenas = []
    const re = /\*\*\[CENA (\d+)\]\*\*\s*([^\n]*)\n\*\*NARRAÇÃO:\*\*\s*([^\n]+)/g
    let m
    while ((m = re.exec(bloco))) {
      const citado = ((m[2].match(/«([^»]{24,120})»/) || [])[1] || '').trim().split(/\s+/).length >= 4 ? m[2].match(/«([^»]{24,120})»/)[1] : ''
      cenas.push({ n: Number(m[1]), visual: m[2].trim(), frase: citado ? citado.trim() : fraseChave(limpar(m[3]), termos) })
    }
    aulas.push({ id, titulo, gancho, termos, fecho, cenas })
  }
  return { num, titulo: cab ? cab[1].trim() : f, objetivo, consegue, missao, aulas }
}

const CSS_SLIDES = `${FONTES}
@page{size:1920px 1080px;margin:0}*{box-sizing:border-box;margin:0}
body{font-family:Inter,sans-serif;color:#f3ede2;background:#0a0806}
.s{width:1920px;height:1080px;position:relative;overflow:hidden;page-break-after:always;background:radial-gradient(1200px 800px at 85% 10%,rgba(217,169,58,.16),transparent 60%),#0a0806;padding:110px 140px}
.s:before{content:"";position:absolute;inset:40px;border:1px solid rgba(243,207,115,.18);border-radius:28px;pointer-events:none}
.top{position:absolute;top:70px;left:140px;right:140px;display:flex;justify-content:space-between;font-size:24px;letter-spacing:.28em;text-transform:uppercase;color:#F3CF73;font-weight:700}
.pe{position:absolute;bottom:62px;left:140px;right:140px;display:flex;justify-content:space-between;font-size:20px;color:rgba(243,237,226,.45)}
.k{font-family:Anton,Impact,sans-serif;text-transform:uppercase;line-height:.95;letter-spacing:.01em}
.ouro{color:#D9A93A}
.capa .k{font-size:128px;max-width:1020px;margin-top:150px}
.capa .num{font-size:30px;letter-spacing:.3em;color:#F3CF73;font-weight:700;text-transform:uppercase}
.capa img{position:absolute;right:150px;top:170px;height:740px;width:600px;object-fit:cover;border-radius:24px;border:2px solid rgba(243,207,115,.35)}
.gancho p{font-family:Kalam,cursive;font-size:84px;line-height:1.2;color:#fff;max-width:1500px;margin-top:230px}
.gancho p:before{content:"“";color:#D9A93A;font-size:180px;position:absolute;margin:-90px 0 0 -110px;font-family:Anton}
.cena .n{font-family:Anton;font-size:240px;color:rgba(217,169,58,.14);position:absolute;right:150px;top:110px}
.cena p{font-size:76px;line-height:1.18;font-weight:700;max-width:1500px;margin-top:250px}
.cena p b{color:#F3CF73}
.chips{display:flex;flex-wrap:wrap;gap:28px;margin-top:70px;max-width:1600px}
.chips span{border:2px solid #D9A93A;border-radius:999px;padding:22px 44px;font-size:52px;font-weight:700;color:#F3CF73}
.resumo h2,.fecho h2{font-size:40px;letter-spacing:.25em;text-transform:uppercase;color:#D9A93A;margin-top:190px}
.fecho p{font-size:56px;line-height:1.3;max-width:1580px;margin-top:40px}
.fecho .aviso{position:absolute;bottom:130px;left:140px;right:140px;font-size:26px;color:rgba(243,237,226,.6);border-top:1px solid rgba(243,207,115,.25);padding-top:26px}
`

function destacar(frase, termos) {
  let h = esc(frase)
  for (const k of termos) if (k.length > 3) h = h.replace(new RegExp(`(?<![\\p{L}])(${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\p{L}])`, 'iu'), '<b>$1</b>')
  return h
}

function htmlSlides(mod) {
  const pe = (a) => `<div class="pe"><span>${esc(t.bootcamp)} · Ruben Pereira</span><span>${t.aula} ${a.id}</span></div>`
  const slides = []
  for (const a of mod.aulas) {
    slides.push(`<section class="s capa"><div class="top"><span>${esc(t.bootcamp)}</span><span>${t.modulo} ${mod.num}</span></div><div class="num">${t.aula} ${a.id}</div><div class="k">${esc(a.titulo)}</div><img src="${RETRATO}">${pe(a)}</section>`)
    if (a.gancho) slides.push(`<section class="s gancho"><div class="top"><span>${t.aula} ${a.id}</span><span>${esc(a.titulo)}</span></div><p>${esc(a.gancho)}</p>${pe(a)}</section>`)
    for (const c of a.cenas) slides.push(`<section class="s cena"><div class="top"><span>${t.aula} ${a.id}</span><span>${esc(a.titulo)}</span></div><div class="n">${String(c.n).padStart(2, '0')}</div><p>${destacar(c.frase, a.termos)}</p>${pe(a)}</section>`)
    if (a.termos.length) slides.push(`<section class="s resumo"><div class="top"><span>${t.aula} ${a.id}</span><span>${esc(a.titulo)}</span></div><h2>${t.resumo}</h2><div class="chips">${a.termos.map((k) => `<span>${esc(k)}</span>`).join('')}</div>${pe(a)}</section>`)
    slides.push(`<section class="s fecho"><div class="top"><span>${t.aula} ${a.id}</span><span>${esc(a.titulo)}</span></div><h2>${t.exercicio}</h2><p>${esc(a.fecho)}</p><div class="aviso">${esc(t.aviso)}</div>${pe(a)}</section>`)
  }
  return `<!doctype html><html lang="${t.html}"><meta charset="utf-8"><style>${CSS_SLIDES}</style><body>${slides.join('\n')}</body></html>`
}

const CSS_CADERNO = `${FONTES}
@page{size:A4;margin:16mm 16mm 18mm}*{box-sizing:border-box;margin:0}
body{font-family:Inter,sans-serif;color:#1b1813;font-size:10.5pt;line-height:1.5}
.capa{height:263mm;background:#0a0806;color:#f3ede2;padding:22mm 18mm;position:relative;page-break-after:always;border-radius:4mm;overflow:hidden}
.capa .k{font-family:Anton,Impact;text-transform:uppercase;font-size:44pt;line-height:.95;margin-top:16mm}
.capa .sup{letter-spacing:.3em;text-transform:uppercase;color:#F3CF73;font-weight:700;font-size:10pt}
.capa img{position:absolute;right:12mm;bottom:22mm;width:68mm;height:86mm;object-fit:cover;border-radius:3mm;border:1pt solid rgba(243,207,115,.4)}
.capa .obj{margin-top:10mm;max-width:105mm;font-size:11pt;color:rgba(243,237,226,.85)}
h2{font-family:Anton,Impact;text-transform:uppercase;font-size:20pt;color:#0a0806;margin:0 0 2mm}
.id{color:#B8871F;font-weight:700;letter-spacing:.2em;text-transform:uppercase;font-size:9pt}
.aula{page-break-before:always}
.caixa{border:1.2pt solid #D9A93A;border-radius:3mm;padding:4mm 5mm;margin:4mm 0}
.caixa b{display:block;color:#8a6414;letter-spacing:.15em;text-transform:uppercase;font-size:8.5pt;margin-bottom:1mm}
.chips span{display:inline-block;border:1pt solid #D9A93A;border-radius:99px;padding:1mm 3.5mm;margin:0 2mm 2mm 0;font-weight:700;font-size:9.5pt}
.linhas div{border-bottom:.6pt solid #cfc6b4;height:9mm}
.check{margin-top:3mm;font-size:9.5pt}.check i{display:inline-block;width:4mm;height:4mm;border:1pt solid #8a6414;margin-right:2mm;vertical-align:-0.6mm}
.aviso{font-size:8.5pt;color:#6b6457;margin-top:6mm;border-top:.6pt solid #d8cfbd;padding-top:2mm}
`

function htmlCaderno(mod) {
  const aulas = mod.aulas.map((a) => `<section class="aula"><div class="id">${t.modulo} ${mod.num} · ${t.aula} ${a.id}</div><h2>${esc(a.titulo)}</h2>
${a.gancho ? `<p style="font-family:Kalam;font-size:13pt;color:#5a4a26">“${esc(a.gancho)}”</p>` : ''}
${a.termos.length ? `<div class="caixa"><b>${t.termos}</b><div class="chips">${a.termos.map((k) => `<span>${esc(k)}</span>`).join('')}</div></div>` : ''}
<div class="caixa"><b>${t.exercicio}</b>${esc(a.fecho)}<div class="linhas">${'<div></div>'.repeat(6)}</div><div class="check"><i></i>${t.feito}</div></div>
<div class="caixa"><b>${t.notas}</b><div class="linhas">${'<div></div>'.repeat(8)}</div></div></section>`).join('\n')
  return `<!doctype html><html lang="${t.html}"><meta charset="utf-8"><style>${CSS_CADERNO}</style><body>
<section class="capa"><div class="sup">${esc(t.bootcamp)} · ${t.caderno}</div><div class="k">${t.modulo} ${mod.num}<br><span style="color:#D9A93A">${esc(mod.titulo)}</span></div>
<div class="obj"><p><b style="color:#F3CF73">${t.objetivo}.</b> ${esc(mod.objetivo)}</p><p style="margin-top:3mm"><b style="color:#F3CF73">${t.consegue}:</b> ${esc(mod.consegue)}</p></div>
<div style="position:absolute;left:18mm;bottom:16mm;font-size:9pt;color:rgba(243,237,226,.6)">Ruben Pereira · ${t.educador} · MoreThanMoney</div><img src="${foto('retrato.jpg')}"></section>
${aulas}
${mod.missao ? `<section class="aula"><div class="id">${t.modulo} ${mod.num}</div><h2>${t.missao}</h2><div class="caixa">${esc(mod.missao)}<div class="linhas">${'<div></div>'.repeat(10)}</div><div class="check"><i></i>${t.feito}</div></div></section>` : ''}
<p class="aviso">${esc(t.aviso)}</p></body></html>`
}

const modulos = fs.readdirSync(dir).filter((f) => /^modulo-\d+\.md$/.test(f)).sort((a, b) => parseInt(a.slice(7)) - parseInt(b.slice(7)))
const browser = await chromium.launch()
const page = await browser.newPage()
for (const f of modulos) {
  const mod = lerModulo(f)
  if (soModulo && mod.num !== soModulo) continue
  await page.setContent(htmlSlides(mod), { waitUntil: 'load' })
  await page.pdf({ path: path.join(outSlides, `modulo-${mod.num}.pdf`), width: '1920px', height: '1080px', printBackground: true })
  await page.setContent(htmlCaderno(mod), { waitUntil: 'load' })
  await page.pdf({ path: path.join(outCaderno, `modulo-${mod.num}.pdf`), format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: `<div style="font-size:7pt;color:#8a8170;width:100%;text-align:center">${esc(t.bootcamp)} · ${t.modulo} ${mod.num} · <span class="pageNumber"></span></div>`, margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' } })
  const nSlides = mod.aulas.reduce((s, a) => s + a.cenas.length + 2 + (a.gancho ? 1 : 0) + (a.termos.length ? 1 : 0), 0)
  console.log(`${slug} · ${t.modulo} ${mod.num}: ${mod.aulas.length} aulas, ${nSlides} slides, caderno pronto`)
}
await browser.close()
