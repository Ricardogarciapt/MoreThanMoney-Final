/**
 * A GUARDA DA SIMETRIA — o que se esconde no admin tem de desaparecer em TODOS os destinos.
 *
 * ═══ PORQUE ESTE TESTE LÊ FICHEIROS EM VEZ DE CHAMAR FUNÇÕES ════════════════════════════════
 *
 * «Esconder uma estratégia» não é uma função: é um filtro repetido em cada sítio que lista o
 * catálogo — o site, a app-mobile, o T2T, o MTM Funded, a criação de contas. Um filtro esquecido
 * num deles não dá erro nenhum: a estratégia simplesmente continua à vista no ecrã do cliente,
 * e só se descobre quando alguém a subscreve. Foi por isso que `/api/mtm-auto/estado` ficou meses
 * a listar estratégias apagadas enquanto `/mtmauto` já as escondia.
 *
 * Por isso a guarda é sobre o CÓDIGO: cada destino do catálogo tem de conter a marca do filtro. Um
 * destino novo que se esqueça dela parte este teste em vez de aparecer na app.
 *
 * Isto é o mesmo espírito de `ESTRATEGIAS_PRIMEVERSE` vs `ESTRATEGIAS_PRIMEVERSE_VIVAS`: as duas
 * listas existem porque «conhecer» e «oferecer» são coisas diferentes, e a guarda que as separa
 * (lib/mtmcopy/__tests__/fontes-e-estrategias-vivas.check.ts) é o que impede que voltem a ser uma.
 *
 *   npx tsx lib/estrategias-admin/__tests__/simetria-escondidas.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { semEscondidas } from '../escondidas-servidor'

const casos: { nome: string; f: () => void }[] = []
const caso = (nome: string, f: () => void) => casos.push({ nome, f })

const RAIZ = join(__dirname, '..', '..', '..')
const fonte = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

/**
 * Todos os sítios que oferecem o catálogo a quem NÃO é admin, e a marca que prova que filtram.
 *
 * `apagado_em` = filtra na consulta. `slugsEscondidos` = filtra a resposta de outro repositório.
 * Um destino que precise de outra forma de filtrar acrescenta-se aqui com a sua marca — o que não
 * se pode é sair da lista.
 */
type Marca = 'is-null' | 'igual-null' | 'slugs-escondidos'

/** O que cada marca procura na fonte. Indiferente ao tipo de aspas — não é isso que se testa. */
const PADRAO: Record<Marca, { re: RegExp; texto: string }> = {
  // `.is('apagado_em', null)` / `.is("apagado_em", null)` — filtrado na consulta
  'is-null': { re: /\.is\(\s*['"]apagado_em['"]\s*,\s*null\s*\)/, texto: ".is('apagado_em', null)" },
  // `x.apagado_em == null` — filtrado em memória, sobre linhas já lidas
  'igual-null': { re: /apagado_em\s*==\s*null/, texto: 'apagado_em == null' },
  // filtrado sobre a resposta de outro repositório
  'slugs-escondidos': { re: /slugsEscondidos/, texto: 'slugsEscondidos()' },
}

const DESTINOS: { ficheiro: string; marca: Marca; porque: string }[] = [
  { ficheiro: 'app/api/mtm-auto/estado/route.ts', marca: 'is-null', porque: 'o painel MTM Auto da app-mobile' },
  { ficheiro: 'app/mtmauto/page.tsx', marca: 'is-null', porque: 'a página pública do MTM Auto' },
  { ficheiro: 'lib/mtmauto/desempenho-estrategia.ts', marca: 'is-null', porque: 'a lista de desempenho que alimenta os painéis do cliente' },
  { ficheiro: 'lib/mtmfunded/contas-estrategia.ts', marca: 'igual-null', porque: 'a criação de contas por estratégia (não se criam contas para uma estratégia escondida)' },
  { ficheiro: 'app/api/mtm-auto/estrategias/route.ts', marca: 'slugs-escondidos', porque: 'o catálogo vem do repositório da MTM Auto — filtra-se a resposta' },
  { ficheiro: 'lib/copia-contas/servidor/cadeia.ts', marca: 'is-null', porque: 'a cadeia «quem copia o quê» não oferece estratégias escondidas como destino de arrasto' },
]

for (const d of DESTINOS) {
  caso(`${d.ficheiro} respeita o escondido (${d.porque})`, () => {
    const p = PADRAO[d.marca]
    assert.match(fonte(d.ficheiro), p.re, `${d.ficheiro} lista estratégias e não filtra as escondidas — falta «${p.texto}»`)
  })
}

caso('apagar NUNCA é um DELETE: as FKs dos sinais e das subscrições são CASCADE', () => {
  const escritores = [
    'lib/admin-centro/servidor/opcoes-estrategia.ts',
    'app/api/admin/centro/estrategia-opcoes/route.ts',
  ]
  for (const f of escritores) {
    const src = fonte(f)
    assert.doesNotMatch(src, /\.delete\(\)/, `${f} faz um DELETE — apagar uma estratégia tem de ser apagado_em`)
    assert.match(src, /apagado_em/, `${f} devia escrever apagado_em`)
  }
})

caso('o padrão vivo continua a existir: PRIMEVERSE conhece todas, VIVAS só as que se oferecem', () => {
  const src = fonte('lib/mtmfunded/estrategias-sinais/calculo.ts')
  assert.match(src, /ESTRATEGIAS_PRIMEVERSE_VIVAS = ESTRATEGIAS_PRIMEVERSE\.filter/)
  // `contas.ts` (quem OFERECE) tem de importar a lista das vivas, nunca a lista toda.
  const contas = fonte('lib/mtmfunded/estrategias-sinais/contas.ts')
  assert.match(contas, /ESTRATEGIAS_PRIMEVERSE_VIVAS/)
  assert.doesNotMatch(
    contas,
    /ESTRATEGIAS_PRIMEVERSE(?!_VIVAS)/,
    'contas.ts oferece estratégias: só pode usar a lista das VIVAS',
  )
})

caso('semEscondidas tira o que está escondido e deixa o resto (slug em falta passa)', () => {
  const lista = [{ slug: 'sensei' }, { slug: 'MTM-Auto-King' }, { slug: null }]
  const fora = semEscondidas(lista, new Set(['mtm-auto-king']), (x) => x.slug)
  assert.deepEqual(fora, [{ slug: 'sensei' }, { slug: null }])
})

caso('sem nada escondido, semEscondidas devolve a MESMA lista (sem trabalho nem cópia)', () => {
  const lista = [{ slug: 'sensei' }]
  assert.equal(semEscondidas(lista, new Set(), (x) => x.slug), lista)
})

let n = 0
for (const c of casos) {
  try { c.f(); n++ } catch (e) { console.error(`✗ ${c.nome}\n  ${e instanceof Error ? e.message : e}`); process.exitCode = 1 }
}
console.log(process.exitCode ? `falharam ${casos.length - n} de ${casos.length}` : `simetria-escondidas: ${n} casos, todos certos`)
