// Slides de cada aula do «Treino de IB MTM» (Skool, 6 aulas), 16:9, PDF.
//   node tools/skool/slides-treino-ib.mjs
// Saída: public/skool/slides/treino-ib-aula-<n>.pdf
// Conteúdo: só o que já está no caderno (public/skool/guias/treino-ib-caderno.pdf) e no guia
// (docs/skool/guias/conteudo.mjs). Ouro sobre carvão, PT-PT, sem promessas, disclaimer em todos os slides.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(RAIZ, 'public/skool/slides')
fs.mkdirSync(OUT, { recursive: true })

const fonte = f => `url(data:font/ttf;base64,${fs.readFileSync(path.join(RAIZ, 'tools/ebooks/fontes', f)).toString('base64')})`
const LOGO = `data:image/png;base64,${fs.readFileSync(path.join(RAIZ, 'public/logo-mtm-transparent.png')).toString('base64')}`
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
const AVISO = 'Conteúdo educativo. Não é aconselhamento financeiro. Operar nos mercados tem risco de perda, que pode ser total. Os resultados não são garantidos.'

const CSS = `
@font-face{font-family:Anton;src:${fonte('Anton.ttf')}}
@font-face{font-family:Inter;src:${fonte('Inter-1.ttf')};font-weight:100 900}
@page{size:1920px 1080px;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:Inter,sans-serif;color:#f3ede1;background:#0c0b09}
.s{width:1920px;height:1080px;position:relative;overflow:hidden;page-break-after:always;padding:120px 150px 150px;background:radial-gradient(900px 620px at 15% 10%,rgba(210,166,60,.22),transparent 70%),#0c0b09}
.s:last-child{page-break-after:auto}
.logo{position:absolute;top:70px;right:110px;width:190px}
.kick{font:800 26px Inter;letter-spacing:.22em;color:#D2A63C;text-transform:uppercase}
h1{font-family:Anton;font-weight:400;font-size:132px;line-height:1;margin:34px 0 26px;color:#E9C46A;text-transform:uppercase;max-width:1500px}
h2{font-family:Anton;font-weight:400;font-size:88px;line-height:1.02;margin:28px 0 36px;color:#E9C46A;text-transform:uppercase}
.barra{height:12px;width:200px;background:#D2A63C;margin:10px 0 40px}
.sub{font-size:38px;color:#e7dfcf;max-width:1450px;line-height:1.35}
ul{margin:0;padding:0;list-style:none}
li{font-size:40px;line-height:1.35;margin:0 0 26px;padding-left:64px;position:relative;color:#f3ede1;max-width:1500px}
li:before{content:'';position:absolute;left:0;top:18px;width:26px;height:26px;background:#D2A63C;border-radius:4px}
.nota{margin-top:44px;padding:30px 36px;border-left:8px solid #D2A63C;background:rgba(210,166,60,.08);font-size:34px;line-height:1.4;max-width:1450px}
.passos{display:grid;grid-template-columns:1fr 1fr;gap:12px 60px;max-width:1550px;margin-top:0}
.passo{border:2px solid #5a4a23;border-radius:14px;padding:12px 24px;font-size:28px;line-height:1.2;background:rgba(210,166,60,.05)}
.passo b{font-family:Anton;font-weight:400;color:#E9C46A;font-size:40px;margin-right:16px}
.fluxo{display:flex;gap:18px;margin-top:30px;flex-wrap:wrap}
.fase{border:2px solid #D2A63C;border-radius:14px;padding:24px 28px;font-size:32px;color:#E9C46A;min-width:250px;text-align:center}
.fase span{display:block;font:800 22px Inter;letter-spacing:.16em;color:#a07a22;margin-bottom:8px;text-transform:uppercase}
.rod{position:absolute;left:150px;right:150px;bottom:52px;font-size:20px;color:#8a877f;display:flex;justify-content:space-between;gap:30px}
.rod span:last-child{white-space:nowrap}
`

const rod = (aula) => `<div class="rod"><span>${esc(AVISO)}</span><span>Treino de IB MTM · Aula ${aula}</span></div>`
const logo = `<img class="logo" src="${LOGO}">`

function capa(n, titulo, sub) {
  return `<section class="s">${logo}<div class="kick" style="margin-top:150px">Treino de IB MTM · Aula ${n}</div><h1>${esc(titulo)}</h1><div class="barra"></div><div class="sub">${esc(sub)}</div>${rod(n)}</section>`
}
function lista(n, titulo, itens, nota) {
  return `<section class="s">${logo}<div class="kick">Aula ${n}</div><h2>${esc(titulo)}</h2><div class="barra"></div><ul>${itens.map(i => `<li>${esc(i)}</li>`).join('')}</ul>${nota ? `<div class="nota">${esc(nota)}</div>` : ''}${rod(n)}</section>`
}
function passos(n, titulo, itens, nota) {
  return `<section class="s">${logo}<div class="kick">Aula ${n}</div><h2>${esc(titulo)}</h2><div class="barra"></div><div class="passos">${itens.map((t, i) => `<div class="passo"><b>${String(i + 1).padStart(2, '0')}</b>${esc(t)}</div>`).join('')}</div>${nota ? `<div class="nota" style="margin-top:34px">${esc(nota)}</div>` : ''}${rod(n)}</section>`
}
function fases(n, titulo, itens, nota) {
  return `<section class="s">${logo}<div class="kick">Aula ${n}</div><h2>${esc(titulo)}</h2><div class="barra"></div><div class="fluxo">${itens.map(([k, v]) => `<div class="fase"><span>${esc(k)}</span>${esc(v)}</div>`).join('')}</div>${nota ? `<div class="nota">${esc(nota)}</div>` : ''}${rod(n)}</section>`
}

const AULAS = {
  1: [
    capa(1, 'Ser IB da PU Prime', 'Como te tornas IB com a MoreThanMoney, com ética e sem promessas.'),
    lista(1, 'O que é um IB', ['O IB apresenta clientes à corretora e à formação', 'Não gere dinheiro de ninguém', 'Não dá conselhos de investimento', 'Trabalha de forma profissional e transparente'], 'Quem quer apresentar a PU Prime e a MTM a outras pessoas faz este treino primeiro.'),
    lista(1, 'O que este treino cobre', ['Parte 1 · Fundamentos e corretora (aulas 2)', 'Parte 2 · Negócio, cliente e onboarding (aula 3)', 'Parte 3 · Compliance e prospeção (aula 4)', 'Checklist de 10 passos (aula 5) e backoffice e pipeline (aula 6)'], 'Faz as aulas pela ordem. Cada uma prepara a seguinte.'),
  ],
  2: [
    capa(2, 'Fundamentos e corretora', 'Módulos 1 e 2 · o que é um IB, como funciona a comissão e como abres a tua conta.'),
    lista(2, 'O que és e o que não és', ['O IB apresenta clientes; não gere dinheiro nem dá conselhos de investimento', 'Não prometes lucros nem rendimentos', 'És responsável pela forma como apresentas a corretora'], 'Pergunta para pensar: porque é que prometer lucros te tira o direito a trabalhar como IB?'),
    lista(2, 'Como funciona a comissão', ['A comissão vem do volume que o cliente negoceia', 'Nunca vem de prometer resultados', 'Sem promessas, o negócio aguenta-se no tempo'], 'Se alguém te pede uma garantia de lucro, a resposta é não.'),
    lista(2, 'Abrir a tua conta de IB', ['Usa o link oficial: puprime.com/campaign?cs=morethanmoney', 'Abre a conta antes de apresentar a corretora a outras pessoas', 'Lê as condições da corretora com calma'], 'Link oficial da PU Prime para a campanha da MTM.'),
    lista(2, 'Exercício', ['Escreve em 3 frases o que és e o que não és como IB.', 'Guarda no caderno e relê antes da aula 3.'], 'Está no caderno do aluno, parte 1.'),
  ],
  3: [
    capa(3, 'Negócio, cliente e onboarding', 'Módulos 3 e 4 · o percurso do teu cliente dentro da MTM e o backoffice.'),
    fases(3, 'O percurso do teu cliente', [['Passo 1', 'Primeiro contacto'], ['Passo 2', 'Conta aberta'], ['Passo 3', 'Onboarding feito'], ['Passo 4', 'Comunidade'], ['Passo 5', 'Formação'], ['Passo 6', 'Primeira trade em demo']], 'Cliente bem entregue = conta aberta, onboarding feito, comunidade e formação.'),
    lista(3, 'O backoffice e o pipeline', ['O pipeline do backoffice mostra em que fase está cada pessoa', 'Vês onde o cliente está e o que falta para avançar', 'Usa o pipeline para não deixar ninguém parado'], 'Backoffice: site.morethanmoney.pt/backoffice (acesso dos IBs).'),
    lista(3, 'Exercício', ['Desenha o percurso de um cliente teu, do primeiro contacto à primeira trade em demo.', 'Pergunta: em que passo os clientes costumam desistir?'], 'Está no caderno do aluno, parte 2.'),
  ],
  4: [
    capa(4, 'Compliance e prospeção', 'Módulos 5 e 6 · conversas que funcionam, sem promessas e com disclaimer.'),
    lista(4, 'Conversas que funcionam', ['Perguntar primeiro', 'Ouvir a resposta', 'Só depois apresentar a corretora e a formação'], 'Conversa = perguntar, ouvir e só depois apresentar.'),
    lista(4, 'O que nunca se publica', ['Números de lucro', 'Prints de ganhos', '«Rendimento garantido» ou qualquer promessa de resultado'], 'Frases proibidas: usa-as como filtro antes de publicar qualquer conteúdo.'),
    lista(4, 'Disclaimer em todo o conteúdo', ['Conteúdo educativo, não é aconselhamento financeiro', 'Operar nos mercados tem risco de perda, que pode ser total', 'Os resultados não são garantidos'], 'Põe o disclaimer em cada publicação, mensagem e apresentação.'),
    lista(4, 'Exercício', ['Escreve 3 publicações.', 'Passa cada uma pelo filtro das frases proibidas.', 'Pergunta: que frase usavas antes e que agora não podes usar?'], 'Está no caderno do aluno, parte 3.'),
  ],
  5: [
    capa(5, 'Checklist de 10 passos', 'Resumo prático do treino, a usar antes de cada apresentação. Confirma com a aula gravada.'),
    passos(5, 'Checklist de 10 passos', [
      'Leste o caderno e fizeste o exercício de cada parte.',
      'Escreveste o que és e o que não és como IB.',
      'Abriste a tua conta de IB pelo link oficial.',
      'Desenhaste o percurso do teu cliente.',
      'Confirmaste que o onboarding do cliente está feito.',
      'Usas o pipeline do backoffice para ver a fase de cada pessoa.',
      'Preparas a conversa: perguntar, ouvir e só depois apresentar.',
      'Passas cada publicação pelo filtro das frases proibidas.',
      'Incluis o disclaimer educativo em todo o conteúdo.',
      'Fizeste o plano de 30 dias para a prospeção.',
    ]),
  ],
  6: [
    capa(6, 'Módulo extra · Backoffice e pipeline', 'Como acompanhar cada cliente desde o primeiro contacto até à primeira trade em demo.'),
    fases(6, 'As fases do pipeline', [['Fase 1', 'Contacto'], ['Fase 2', 'Conta aberta'], ['Fase 3', 'Onboarding'], ['Fase 4', 'Comunidade'], ['Fase 5', 'Formação'], ['Fase 6', 'Demo']], 'O pipeline mostra em que fase está cada pessoa. Atualiza-o sempre que avançar um passo.'),
    lista(6, 'Rotina no backoffice', ['Vê o pipeline no início de cada dia', 'Confirma quem precisa de um passo seguinte', 'Regista o que foi feito, sem prometer resultados'], 'Usa o caderno do aluno para anotar as tuas rotinas.'),
  ],
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
for (const n of Object.keys(AULAS)) {
  const html = `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${AULAS[n].join('')}</body></html>`
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const out = path.join(OUT, `treino-ib-aula-${n}.pdf`)
  await page.pdf({ path: out, width: '1920px', height: '1080px', printBackground: true, pageRanges: '' })
  console.log('ok', out, AULAS[n].length, 'slides')
}
await browser.close()
