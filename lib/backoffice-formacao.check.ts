/**
 * A GUARDA DA ACADEMIA DE VENDAS.
 *
 *   npx tsx lib/backoffice-formacao.check.ts
 *
 * O curso é visto por toda a equipa e narrado em vídeo: uma frase errada aqui é repetida por toda a
 * gente durante meses. Prova que PT e EN têm as mesmas cenas, que nada traz preço, percentagem ou
 * promessa de ganhos, que o MTM Funded nunca é vendido como capital real, que não se nomeia a
 * plataforma dos cursos, e que cada papel recebe as suas aulas.
 */
import { AULAS, aulasPara, narracao, type T } from './backoffice-formacao'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }

const textos: T[] = []
for (const a of AULAS) {
  textos.push(a.titulo, a.objetivo, a.tarefa)
  for (const c of a.cenas) {
    textos.push(c.fala)
    if ('titulo' in c) textos.push(c.titulo)
    if (c.tipo === 'capa') textos.push(c.sub)
    if (c.tipo === 'lista' || c.tipo === 'regra') textos.push(...c.itens)
    if (c.tipo === 'fluxo') textos.push(...c.passos)
    if (c.tipo === 'mapa') textos.push(c.centro, ...c.ramos.flatMap((r) => [r.nome, ...r.folhas]))
    if (c.tipo === 'ecra') textos.push(...c.destaques)
    if (c.tipo === 'guiao') textos.push(c.quando, c.texto)
    if (c.tipo === 'fim') textos.push(c.cta)
  }
  for (const q of a.quiz) textos.push(q.pergunta, ...q.opcoes, q.porque)
}

for (const L of ['pt', 'en'] as const) {
  const tudo = textos.map((t) => t[L]).join('\n')
  teste(`${L}: todos os textos preenchidos`, textos.every((t) => t[L] && t[L].trim().length > 0))
  teste(`${L}: nenhum símbolo de moeda nem percentagem`, !/[€$%]/.test(tudo))
  // números permitidos: os que são nomes de produto ou contagens de passos (30 dias, 10K, 7 dias, 360°, 24 h)
  const semPermitidos = tudo
    .replace(/https?:\/\/\S+|morethanmoney\.pt\/\S+/g, '')
    .replace(/\{[a-z_0-9]+\}/g, '')
    .replace(/\b(30|7|10|5|3|2|1|360|24|15:30|8)\b/g, '')
  teste(`${L}: sem valores escritos à mão`, !/\d{2,}/.test(semPermitidos))
  teste(`${L}: sem promessas de ganhos`, !/(lucro garantido|ganhos garantidos|rendimento fixo garantido|guaranteed (profit|returns|income)|dinheiro autom)/i.test(tudo))
  teste(`${L}: MTM Funded nunca como prop firm`, !/prop firm/i.test(tudo.replace(/não é prop firm|not a prop firm|Chamar «prop firm» ao MTM Funded: é conta simulada|Call MTM Funded a “prop firm”: it is a simulated account|^(Uma|A) prop firm$/gim, '')))
  teste(`${L}: não se nomeia a plataforma dos cursos`, !/skool/i.test(tudo))
}

for (const a of AULAS) {
  teste(`aula ${a.numero}: começa com capa e acaba com fim`, a.cenas[0]?.tipo === 'capa' && a.cenas[a.cenas.length - 1]?.tipo === 'fim')
  teste(`aula ${a.numero}: narração PT e EN não vazias`, narracao(a, 'pt').length > 200 && narracao(a, 'en').length > 200)
  teste(`aula ${a.numero}: quiz com resposta válida`, a.quiz.every((q) => q.certa >= 0 && q.certa < q.opcoes.length))
}
teste('números das aulas seguidos', AULAS.every((a, i) => a.numero === i + 1))
teste('slugs únicos', new Set(AULAS.map((a) => a.slug)).size === AULAS.length)

// cada papel vê as gerais e as suas; o dono vê todas
const setter = aulasPara(['setter'], false)
teste('setter vê a aula de setter', setter.some((a) => a.papel === 'setter'))
teste('setter não vê a de closer na lista dele', !setter.some((a) => a.papel === 'closer'))
teste('dono vê todas', aulasPara([], true).length === AULAS.length)

if (falhas.length) {
  console.error('FALHOU:\n - ' + falhas.join('\n - '))
  process.exit(1)
}
console.log(`ok — academia de vendas (${AULAS.length} aulas, PT e EN)`)
