#!/usr/bin/env node
/**
 * Academia de Vendas — capas (miniaturas) do YouTube, 1280×720, PT e EN, e a capa do curso.
 *
 *   node --experimental-strip-types video/formacao/capas.mjs <pasta-saida>
 *
 * Ouro sobre carvão, número da aula em grande, título curto e um ecrã real do back-office por trás
 * (as capturas de `public/formacao/ecras/`, com dados de exemplo). Sem fotos geradas de pessoas.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { AULAS, CURSO, NOME_PAPEL } = await import(path.join(RAIZ, 'lib/backoffice-formacao.ts'))
const saida = process.argv[2] || path.join(RAIZ, 'out/formacao/capas')
fs.mkdirSync(saida, { recursive: true })

const ECRA = { 1: 'hoje', 2: 'pipeline', 3: 'whatsapp', 4: 'quadro', 5: 'chamadas', 6: 'material', 7: 'ficha', 8: 'tarefas', 9: 'ib' }
const url = (f) => `file://${path.join(RAIZ, f)}`
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

function html({ ecra, etiqueta, numero, titulo, papel, curso }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Anton;src:url('${url('video/motor/fontes/Anton.ttf')}')}
@font-face{font-family:Oswald;src:url('${url('video/motor/fontes/Oswald.ttf')}')}
*{margin:0;box-sizing:border-box}
body{width:1280px;height:720px;background:#0a0a0b;overflow:hidden;position:relative;font-family:Oswald}
.ecra{position:absolute;right:-60px;top:70px;width:820px;border-radius:18px;border:2px solid rgba(210,166,60,.55);box-shadow:0 30px 80px rgba(0,0,0,.8);transform:perspective(1400px) rotateY(-14deg) rotateX(4deg);opacity:1}
.veu{position:absolute;inset:0;background:linear-gradient(90deg,#0a0a0b 0%,#0a0a0b 36%,rgba(10,10,11,.35) 66%,rgba(10,10,11,0) 100%)}
.brilho{position:absolute;left:-200px;top:-200px;width:760px;height:760px;background:radial-gradient(circle,rgba(210,166,60,.22),transparent 65%)}
.logo{position:absolute;left:56px;top:40px;height:92px}
.curso{position:absolute;left:160px;top:70px;color:#E9C46A;font:500 26px Oswald;letter-spacing:.08em;text-transform:uppercase}
.num{position:absolute;left:58px;top:150px;width:${curso ? 720 : 1200}px;font:400 ${curso ? 96 : 210}px/1.02 Anton;color:#D2A63C;letter-spacing:.01em;text-shadow:0 6px 30px rgba(210,166,60,.35)}
.tit{position:absolute;left:64px;top:${curso ? 400 : 385}px;width:640px;font:600 ${curso ? 44 : 58}px/1.05 Oswald;color:#fff;text-transform:uppercase}
.papel{position:absolute;left:64px;bottom:52px;padding:10px 22px;border-radius:999px;background:#D2A63C;color:#111;font:600 26px Oswald;text-transform:uppercase;letter-spacing:.05em}
.barra{position:absolute;left:0;bottom:0;width:100%;height:10px;background:linear-gradient(90deg,#D2A63C,#E9C46A,#D2A63C)}
</style></head><body>
<div class="brilho"></div>
<img class="ecra" src="${url(`public/formacao/ecras/${ecra}.png`)}">
<div class="veu"></div>
<img class="logo" src="${url('public/logo-mtm-transparent.png')}">
<div class="curso">${esc(etiqueta)}</div>
<div class="num">${esc(numero)}</div>
<div class="tit">${esc(titulo)}</div>
${papel ? `<div class="papel">${esc(papel)}</div>` : ''}
<div class="barra"></div>
</body></html>`
}

const { chromium } = require('playwright')
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
const tmp = path.join(saida, '_tmp.html')
const feitos = []
async function foto(dados, nome) {
  fs.writeFileSync(tmp, html(dados))
  await p.goto(`file://${tmp}`)
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(150)
  const f = path.join(saida, nome)
  await p.screenshot({ path: f, type: 'jpeg', quality: 90 })
  feitos.push(f)
}
for (const L of ['pt', 'en']) {
  const aula = L === 'pt' ? 'AULA' : 'LESSON'
  for (const a of AULAS) {
    await foto({ ecra: ECRA[a.numero] || 'hoje', etiqueta: CURSO.titulo[L], numero: `${aula} ${a.numero}`, titulo: a.titulo[L], papel: NOME_PAPEL[a.papel][L] }, `capa-${String(a.numero).padStart(2, '0')}-${L}.jpg`)
  }
  await foto({ ecra: 'hoje', etiqueta: L === 'pt' ? 'Formação interna' : 'Internal training', numero: CURSO.titulo[L], titulo: L === 'pt' ? `${AULAS.length} aulas · back-office, guiões e rotina` : `${AULAS.length} lessons · back office, scripts and routine`, papel: L === 'pt' ? 'Começa pela aula 1' : 'Start with lesson 1', curso: true }, `capa-curso-${L}.jpg`)
}
fs.rmSync(tmp)
await b.close()
console.log(feitos.join('\n'))
