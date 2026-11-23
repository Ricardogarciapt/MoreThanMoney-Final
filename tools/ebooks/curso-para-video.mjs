// Converte os guiões em markdown de um curso (conteudo-privado/ebooks/bootcamps/<slug>/modulo-N.md)
// no guião JSON do motor de bootcamps (video/bootcamp/guioes/curso-<base>.<lang>.json): um vídeo por aula.
// Pedido do Ricardo (22/11/2026): renderizar todas as aulas do curso do Ruben já animadas e sem voz;
// a narração entra depois (voz.mjs + render.mjs leem o mesmo guião).
// Uso: node tools/ebooks/curso-para-video.mjs a-primeira-chave[-en|-es|-fr]
//   → video/bootcamp/guioes/curso-a-primeira-chave.<lang>.json  + …/curso-a-primeira-chave.aulas.json (aula → nº do vídeo)
// Render de uma aula: node video/bootcamp/render.mjs curso-a-primeira-chave <n> <lang>
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const slug = process.argv[2] || 'a-primeira-chave'
const lang = (slug.match(/-(en|es|fr)$/) || [])[1] || 'pt'
const base = slug.replace(/-(en|es|fr)$/, '')
const dir = path.join(RAIZ, 'conteudo-privado/ebooks/bootcamps', slug)

const TX = {
  pt: { etiq: 'As quatro etiquetas', curso: 'A Primeira Chave', mod: 'Módulo', aula: 'Aula', termos: 'Para levar desta aula', aviso: 'Conteúdo educativo. Não é aconselhamento financeiro. O risco de perda é real.', resp: 'Resposta', missao: 'Missão do módulo' },
  en: { etiq: 'The four labels', curso: 'The First Key', mod: 'Module', aula: 'Lesson', termos: 'Take away from this lesson', aviso: 'Educational content. Not financial advice. The risk of loss is real.', resp: 'Answer', missao: 'Module mission' },
  es: { etiq: 'Las cuatro etiquetas', curso: 'La Primera Llave', mod: 'Módulo', aula: 'Clase', termos: 'Lo que te llevas de esta clase', aviso: 'Contenido educativo. No es asesoramiento financiero. El riesgo de pérdida es real.', resp: 'Respuesta', missao: 'Misión del módulo' },
  fr: { etiq: 'Les quatre étiquettes', curso: 'La Première Clé', mod: 'Module', aula: 'Leçon', termos: 'À retenir de cette leçon', aviso: 'Contenu éducatif. Pas un conseil financier. Le risque de perte est réel.', resp: 'Réponse', missao: 'Mission du module' },
}[lang]

const limpar = s => (s || '').replace(/\*\*/g, '').replace(/^["“«\s]+|["”»\s]+$/g, '').replace(/\s+/g, ' ').trim()
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const frases = t => (t.match(/[^.!?]+[.!?]+/g) || [t]).map(s => s.trim())
const curta = (t, max = 90) => frases(t).filter(s => s.length >= 18 && s.length <= max)
const citado = v => { const m = v.match(/«([^»]{18,140})»/) || v.match(/[“"]([^”"]{18,140})[”"]/); return m && m[1].trim().split(/\s+/).length >= 3 && !/educativ|educational|éducatif|risco de perda|risk of loss|risque de perte|riesgo de pérdida/i.test(m[1]) ? m[1].trim() : '' }
const RE = {
  ruben: /ruben/i,
  etiquetas: /forte compra|strong buy|compra fuerte|achat fort/i,
  grafico: /gráfico|grafico|velas|linha de preço|curva|chart|candle|graph|courbe|bougies|gráfica|precio|price line|prix/i,
  plano: /stop|alvo|entrada|target|entry|objectif|entrée|objetivo|ATR/i,
  lista: /lista de verificação|checklist|quadrados|caixas|check|casillas|cases à cocher|liste/i,
  tabela: /tabela|table|tabla|tableau|comparação|lado a lado|side by side|côte à côte/i,
}

function cenaDe(id, k, visual, fala, termos, n) {
  const q = citado(visual), fr = curta(fala)
  const kicker = termos[n % Math.max(1, termos.length)] || ''
  if (k === 1 && RE.ruben.test(visual)) return { id, tipo: 'ruben', kicker, texto: esc(q || fr[0] || ''), aviso: /educativ|educational|éducatif/i.test(visual) ? TX.aviso : '', fala }
  if (RE.etiquetas.test(visual)) return { id, tipo: 'etiquetas', titulo: TX.etiq, fala }
  if (RE.grafico.test(visual)) return { id, tipo: 'grafico', kicker, titulo: esc(q || fr[0] || ''), cenario: ['tendencia', 'compra', 'venda'][n % 3], seed: 3 + n, base: ['medias'], camadas: RE.plano.test(visual) ? ['dca', 'plano'] : ['dca'], ate: [0.35, 1], fala }
  if (RE.lista.test(visual)) return { id, tipo: 'checklist', kicker, titulo: esc(q || fr[0] || ''), itens: (fr.slice(1, 5).length ? fr.slice(1, 5) : termos).map(esc), fala }
  if (RE.tabela.test(visual) && fr.length >= 3) return { id, tipo: 'comparar', kicker, titulo: esc(q || ''), cartoes: fr.slice(0, 3).map((s, i) => ({ t: termos[i] || String(i + 1).padStart(2, '0'), d: esc(s) })), fala }
  if (q && n % 2 === 0) return { id, tipo: 'frase', cap: '', texto: esc(q), autor: 'Ruben Pereira · MoreThanMoney', fala }
  if (q && RE.ruben.test(visual)) return { id, tipo: 'ruben', kicker, texto: esc(q), fala }
  return { id, tipo: 'pontos', kicker, titulo: esc(q || fr[0] || ''), itens: (fr.slice(q ? 0 : 1, (q ? 0 : 1) + 3)).map(esc), fala }
}

// 23/11 (pedido do Ricardo): 20 aulas por língua, ~12 min cada. Cada aula junta 2 a 4 das aulas antigas,
// que passam a SECÇÕES, e cada secção tem a sua animação de tema (video/bootcamp/primeira-chave-temas.js).
const AULAS = [
  ['1.1', '1.2', '1.3', '1.4'], ['2.1', '2.2', '2.3', '2.4'], ['3.1', '3.2', '3.3', '3.4'], ['4.1', '4.2', '4.3', '4.4'], ['5.1', '5.2', '5.3', '5.4'],
  ['6.1', '6.2', '6.3', '6.4'], ['7.1', '7.2', '7.3'], ['7.4', '7.5', '7.6'], ['8.1', '8.2', '8.3', '8.4'], ['9.1', '9.2', '9.3', '9.4'],
  ['10.1', '10.2', '10.3', '10.4'], ['11.1', '11.2', '11.3'], ['11.4', '11.5'], ['12.1', '12.2', '12.3'], ['12.4', '12.5'],
  ['13.1', '13.2', '13.3', '13.4'], ['14.1', '14.2', '14.3'], ['14.4', '14.5'], ['15.1', '15.2'], ['15.3', '15.4'],
]
// títulos das aulas que dividem um módulo (as outras usam o título do módulo)
const TIT = {
  6: { pt: 'As ferramentas MTM para o teu DCA', en: 'MTM tools for your DCA', es: 'Las herramientas MTM para tu DCA', fr: 'Les outils MTM pour ton DCA' },
  7: { pt: 'Momentum, DEFY e o ritual de sexta', en: 'Momentum, DEFY and the Friday ritual', es: 'Momentum, DEFY y el ritual del viernes', fr: 'Momentum, DEFY et le rituel du vendredi' },
  11: { pt: 'Perpétuos: funding, margem e liquidação', en: 'Perpetuals: funding, margin and liquidation', es: 'Perpetuos: funding, margen y liquidación', fr: 'Perpétuels : funding, marge et liquidation' },
  12: { pt: 'Custos reais e alavancagem', en: 'Real costs and leverage', es: 'Costes reales y apalancamiento', fr: 'Coûts réels et levier' },
  13: { pt: 'Aurum Flow Cripto: filosofia e sinal', en: 'Aurum Flow Cripto: philosophy and signal', es: 'Aurum Flow Cripto: filosofía y señal', fr: 'Aurum Flow Cripto : philosophie et signal' },
  14: { pt: 'Alvos, saídas e quando não entrar', en: 'Targets, exits and when not to enter', es: 'Objetivos, salidas y cuándo no entrar', fr: 'Objectifs, sorties et quand ne pas entrer' },
  16: { pt: 'Executar: WebTrader, MTM Auto e diário', en: 'Execute: WebTrader, MTM Auto and journal', es: 'Ejecutar: WebTrader, MTM Auto y diario', fr: 'Exécuter : WebTrader, MTM Auto et journal' },
  17: { pt: 'Rotina, regras de paragem e psicologia', en: 'Routine, stop rules and psychology', es: 'Rutina, reglas de parada y psicología', fr: 'Routine, règles d’arrêt et psychologie' },
  18: { pt: 'Impostos e o teu plano de 90 dias', en: 'Taxes and your 90-day plan', es: 'Impuestos y tu plan de 90 días', fr: 'Impôts et ton plan de 90 jours' },
  19: { pt: 'Revisão final, exame e certificado', en: 'Final review, exam and certificate', es: 'Revisión final, examen y certificado', fr: 'Révision finale, examen et certificat' },
}
// animação de cada secção (chaves de window.PC_TEMAS)
const TEMA = {
  '1.1': 'troca', '1.2': 'inflacao', '1.3': 'nascimento', '1.4': 'blockchain', '2.1': 'oferta', '2.2': 'rede', '2.3': 'stable', '2.4': 'altcoins',
  '3.1': 'kyc', '3.2': 'custos', '3.3': 'ordens', '3.4': 'moeda', '4.1': 'quentefrio', '4.2': 'seed', '4.3': 'chave', '4.4': 'copias',
  '5.1': 'burla', '5.2': 'piramide', '5.3': 'anzol', '5.4': 'lista10', '6.1': 'dca', '6.2': 'halving', '6.3': 'ciclos', '6.4': 'sextas',
  '7.1': 'etiq', '7.2': 'telemovel', '7.3': 'portefolio', '7.4': 'momentum', '7.5': 'defy', '7.6': 'ritual',
  '8.1': 'portefolio', '8.2': 'portefolio', '8.3': 'rebalance', '8.4': 'telemovel', '9.1': 'momentum', '9.2': 'defy', '9.3': 'sentimento', '9.4': 'etiq',
  '10.1': 'escada', '10.2': 'crash', '10.3': 'cofre', '10.4': 'heranca', '11.1': 'perpetuo', '11.2': 'margem', '11.3': 'liquidacao', '11.4': 'taxas', '11.5': 'alavanca',
  '12.1': 'tendencia', '12.2': 'dema', '12.3': 'sinal', '12.4': 'escada', '12.5': 'semaforo', '13.1': 'risco1', '13.2': 'tamanho', '13.3': 'painel', '13.4': 'semaforo',
  '14.1': 'terminal', '14.2': 'copia', '14.3': 'diario', '14.4': 'ritual', '14.5': 'pulso', '15.1': 'calendario', '15.2': 'plano90', '15.3': 'revisao', '15.4': 'certificado',
}
const MERCADO = new Set(['dca', 'tendencia', 'dema', 'sinal', 'terminal', 'momentum', 'defy'])
const SEC = { pt: (j, n) => `Secção ${j} de ${n}`, en: (j, n) => `Section ${j} of ${n}`, es: (j, n) => `Sección ${j} de ${n}`, fr: (j, n) => `Section ${j} sur ${n}` }[lang]
const DE20 = { pt: 'Aula', en: 'Lesson', es: 'Clase', fr: 'Leçon' }[lang]

// 1) ler todas as aulas antigas como secções
const ficheiros = fs.readdirSync(dir).filter(f => /^modulo-\d+\.md$/.test(f)).sort((a, b) => Number(a.match(/\d+/)) - Number(b.match(/\d+/)))
const secoes = {}, modTit = {}
for (const f of ficheiros) {
  const md = fs.readFileSync(path.join(dir, f), 'utf8')
  const num = Number(f.match(/\d+/)[0])
  modTit[num] = limpar((md.match(/^# [^—\n]+— (.+?)(?:\s*\(≈[^)]*\))?\s*$/m) || [])[1] || '')
  const missao = limpar((md.match(/^\*\*[^*\n]*(?:Miss|Misi)[^*\n]*:?\*\*:?\s*(.+)$/mi) || [])[1] || '')
  const blocos = md.split(/^## /m).slice(1)
  blocos.forEach((bloco, bi) => {
    const linha = bloco.split('\n')[0]
    const aid = (linha.match(/(\d+\.\d+)/) || [])[1]
    if (!aid) return
    const cenasMd = []; const re = /\*\*\[CENA (\d+)\]\*\*\s*([^\n]*)\n+\*\*NARRAÇÃO:\*\*\s*([^\n]+)/g; let m
    while ((m = re.exec(bloco))) cenasMd.push({ k: Number(m[1]), visual: m[2], fala: limpar(m[3]) })
    const perg = (bloco.match(/\*\*(?:Pergunta de verificação|Check question|Question de vérification|Pregunta de (?:verificación|control))\s*:?\*\*\s*(.+)/) || [])[1] || ''
    const [pq, pr] = perg.split(/\s*(?:Resposta|Answer|Réponse|Respuesta)\s*:\s*/)
    secoes[aid] = {
      aid, mod: num,
      titulo: limpar(linha.replace(/^[^—]+— /, '').replace(/\s*\(≈[^)]*\)\s*$/, '')),
      gancho: limpar((bloco.match(/\*\*Gancho[^*]*\*\*:?\s*(.+)/) || [])[1]),
      termos: ((bloco.match(/\*\*Texto no ecrã:\*\*\s*(.+)/) || [])[1] || '').split('·').map(limpar).filter(Boolean),
      fecho: limpar((bloco.match(/\*\*Fecho \/ CTA da aula:\*\*\s*(.+)/) || [])[1]),
      pq: limpar(pq || ''), pr: limpar(pr || ''), cenasMd,
      missao: missao && bi === blocos.length - 1 ? missao : '',
    }
  })
}

// 2) montar as 20 aulas
const videos = [], indice = []
AULAS.forEach((ids, vi) => {
  const n = vi + 1, secs = ids.map(id => secoes[id]).filter(Boolean)
  if (!secs.length) return
  const titulo = TIT[vi] ? TIT[vi][lang] : modTit[secs[0].mod]
  const cap = titulo, pre = `a${n}`
  const cenas = [{ id: `${pre}-00`, tipo: 'abertura', tema: TEMA[secs[0].aid], cap, kicker: `${TX.curso} · ${DE20} ${n} / ${AULAS.length}`, titulo: esc(titulo), sub: esc(secs.map(s => s.titulo).join(' · ')), rodape: 'Ruben Pereira · morethanmoney.pt', semVoz: 6 }]
  const todosTermos = []
  secs.forEach((sec, j) => {
    const tema = TEMA[sec.aid], sp = `${pre}-s${j + 1}`
    cenas.push({ id: `${sp}-00`, tipo: 'secao', tema, cap, numero: String(j + 1).padStart(2, '0'), kicker: SEC(j + 1, secs.length), titulo: esc(sec.titulo), ...(sec.gancho ? { fala: sec.gancho } : { semVoz: 5 }) })
    let nv = 0
    sec.cenasMd.forEach((cm, i) => {
      const c = cenaDe(`${sp}-${String(i + 1).padStart(2, '0')}`, cm.k, cm.visual, cm.fala, sec.termos, i + 1)
      c.cap = sec.titulo; c.tema = tema; c.fase = i * 2.7
      if (c.tipo === 'grafico' && !MERCADO.has(tema)) { c.tipo = 'visual'; c.titulo = c.titulo || esc(curta(cm.fala)[0] || sec.titulo) }
      else if (c.tipo === 'pontos' && nv < 2 && i % 3 === 1) { nv++; c.tipo = 'visual'; c.kicker = sec.titulo; c.titulo = c.titulo || esc(curta(cm.fala)[0] || '') }
      if (c.tipo === 'grafico') { c.cenario = tema === 'dca' ? 'tendencia' : 'compra'; c.camadas = ['sinal', 'terminal'].includes(tema) ? ['dca', 'plano'] : ['dca'] }
      cenas.push(c)
    })
    if (sec.pq) cenas.push({ id: `${sp}-91`, tipo: 'pergunta', cap, titulo: esc(sec.pq), texto: esc(sec.pr), fala: `${sec.pq} ${sec.pr}`.trim() })
    if (sec.missao) cenas.push({ id: `${sp}-92`, tipo: 'missao', cap: TX.missao, titulo: TX.missao, itens: frases(sec.missao).slice(0, 5).map(esc), semVoz: 8 })
    todosTermos.push(...sec.termos)
  })
  if (todosTermos.length) cenas.push({ id: `${pre}-90`, tipo: 'termos', cap, kicker: `${DE20} ${n}`, titulo: TX.termos, itens: [...new Set(todosTermos)].slice(0, 12).map(esc), semVoz: 8, seed: n })
  const fecho = secs[secs.length - 1].fecho
  cenas.push({ id: `${pre}-99`, tipo: 'aviso', cap: '', titulo: esc(fecho || titulo), sub: TX.aviso, ...(fecho ? { fala: fecho } : { semVoz: 4 }) })
  videos.push({ rotulo: `${TX.curso} · ${DE20} ${n}`, titulo: `${n} · ${titulo}`, cenas })
  indice.push({ aula: n, video: n, titulo, secoes: secs.map(s => s.aid) })
})

const G = {
  estrategia: TX.curso, motor: 'primeira-chave', marca: 'MoreThanMoney · Ruben Pereira', vel: 1.0, entrada: true, vozObrigatoria: true, voz: '0aee5608f1cc4459a544e79825112e60', marcaVideo: 'morethanmoney',
  tituloPlaylist: `${TX.curso} · Ruben Pereira`,
  pronuncia: [['DCA', 'D C A'], ['BTC', 'B T C'], ['ETH', 'E T H'], ['ETF', 'E T F'], ['ATR', 'A T R'], ['RSI', 'R S I'], ['DEMA', 'D E M A'], ['MTM', 'M T M'], ['DEFY', 'Défi']],
  videos,
}
const out = path.join(RAIZ, 'video/bootcamp/guioes')
fs.writeFileSync(path.join(out, `curso-${base}.${lang}.json`), JSON.stringify(G, null, 1))
fs.writeFileSync(path.join(out, `curso-${base}.aulas.json`), JSON.stringify(indice, null, 1))
const tipos = {}; videos.forEach(v => v.cenas.forEach(c => { tipos[c.tipo] = (tipos[c.tipo] || 0) + 1 }))
const min = videos.reduce((s, v) => s + v.cenas.reduce((a, c) => a + (c.fala ? c.fala.split(/\s+/).length / 2.5 + 0.7 : c.semVoz || 4), 0.5), 0) / 60
console.log(`${slug}: ${ficheiros.length} módulos, ${videos.length} aulas, ~${min.toFixed(0)} min estimados ·`, JSON.stringify(tipos))
