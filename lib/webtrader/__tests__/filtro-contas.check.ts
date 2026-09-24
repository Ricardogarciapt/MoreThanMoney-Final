/**
 * O filtro «As minhas / Mestres / Todas» do seletor do WebTrader.
 * Correr: npx tsx lib/webtrader/__tests__/filtro-contas.check.ts
 */
import assert from 'node:assert/strict'
import {
  contarPorTipo, ehContaMestre, filtrarEntradas, juntarOrdemFiltrada, normalizarFiltro,
  temDoisTipos, FILTRO_POR_OMISSAO,
} from '../filtro-contas'
import { moverConta, ordenarEntradas } from '../ordem-contas'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

const minha = (id: string) => ({ id, mestre: false })
const mestre = (id: string) => ({ id, mestre: true })
const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id)

function main() {
  // ── o que é uma conta mestre ──────────────────────────────────────────────
  caso('mestre = tipo provider, e só esse', () => {
    assert.equal(ehContaMestre({ tipo: 'provider' }), true)
    assert.equal(ehContaMestre({ tipo: 'financiada' }), false)
    assert.equal(ehContaMestre({ tipo: 'desafio' }), false)
    assert.equal(ehContaMestre({ tipo: 'torneio' }), false)
    assert.equal(ehContaMestre({ tipo: 'real' }), false)
  })
  caso('conta sem tipo (real, TradeLocker/MT5) não é mestre', () => {
    assert.equal(ehContaMestre({}), false)
    assert.equal(ehContaMestre({ tipo: null }), false)
    assert.equal(ehContaMestre(null), false)
    assert.equal(ehContaMestre(undefined), false)
  })
  caso('o tipo vem da base sem cuidados de maiúsculas nem espaços', () => {
    assert.equal(ehContaMestre({ tipo: ' Provider ' }), true)
    assert.equal(ehContaMestre({ tipo: 'PROVIDER' }), true)
    assert.equal(ehContaMestre({ tipo: 'providers' }), false)
  })

  // ── limpeza do valor guardado ─────────────────────────────────────────────
  caso('normalizar: os três estados passam, o resto cai em «As minhas»', () => {
    assert.equal(normalizarFiltro('minhas'), 'minhas')
    assert.equal(normalizarFiltro('mestres'), 'mestres')
    assert.equal(normalizarFiltro('todas'), 'todas')
    assert.equal(normalizarFiltro('Todas'), 'todas')
    assert.equal(normalizarFiltro('sei lá'), FILTRO_POR_OMISSAO)
    assert.equal(normalizarFiltro(null), 'minhas')
    assert.equal(normalizarFiltro(3), 'minhas')
    assert.equal(normalizarFiltro(undefined), 'minhas')
  })

  // ── o filtro só aparece a quem tem dos dois tipos ─────────────────────────
  caso('só contas próprias: não há filtro para mostrar', () => {
    assert.equal(temDoisTipos([minha('a'), minha('b')]), false)
  })
  caso('só contas mestre: também não há', () => {
    assert.equal(temDoisTipos([mestre('m1'), mestre('m2')]), false)
  })
  caso('lista vazia: não há', () => {
    assert.equal(temDoisTipos([]), false)
  })
  caso('dos dois tipos (o caso do dono): há', () => {
    assert.equal(temDoisTipos([minha('a'), mestre('m1')]), true)
  })
  caso('sem os dois tipos, um filtro guardado não esconde NADA', () => {
    // Quem só tem as suas não pode ficar com o seletor vazio por causa de um valor antigo.
    const so = [minha('a'), minha('b')]
    assert.deepEqual(ids(filtrarEntradas(so, 'mestres')), ['a', 'b'])
    const soMestres = [mestre('m1'), mestre('m2')]
    assert.deepEqual(ids(filtrarEntradas(soMestres, 'minhas')), ['m1', 'm2'])
  })

  // ── filtrar ───────────────────────────────────────────────────────────────
  const lista = [minha('a'), mestre('m1'), minha('b'), mestre('m2')]
  caso('por defeito («As minhas») as mestres ficam escondidas', () => {
    assert.deepEqual(ids(filtrarEntradas(lista, FILTRO_POR_OMISSAO, 'a')), ['a', 'b'])
  })
  caso('«Mestres» mostra só as da casa', () => {
    assert.deepEqual(ids(filtrarEntradas(lista, 'mestres', 'm1')), ['m1', 'm2'])
  })
  caso('«Todas» mostra tudo, pela mesma ordem', () => {
    assert.deepEqual(ids(filtrarEntradas(lista, 'todas', 'a')), ['a', 'm1', 'b', 'm2'])
  })
  caso('filtrar não arruma: a ordem que entra é a que sai', () => {
    const arrumada = ordenarEntradas(lista, ['m2', 'b', 'm1', 'a'])
    assert.deepEqual(ids(filtrarEntradas(arrumada, 'todas')), ['m2', 'b', 'm1', 'a'])
    assert.deepEqual(ids(filtrarEntradas(arrumada, 'minhas', 'b')), ['b', 'a'])
  })

  // ── a conta escolhida manda sempre ────────────────────────────────────────
  caso('a mestre ESCOLHIDA fica à vista mesmo em «As minhas»', () => {
    assert.deepEqual(ids(filtrarEntradas(lista, 'minhas', 'm1')), ['a', 'm1', 'b'])
  })
  caso('a escolhida fica no LUGAR dela, não é empurrada para o topo', () => {
    assert.deepEqual(ids(filtrarEntradas(lista, 'minhas', 'm2')), ['a', 'b', 'm2'])
  })
  caso('a própria ESCOLHIDA fica à vista mesmo em «Mestres»', () => {
    assert.deepEqual(ids(filtrarEntradas(lista, 'mestres', 'b')), ['m1', 'b', 'm2'])
  })
  caso('a FAVORITA escolhida é a escolhida — fica à vista como as outras', () => {
    // A favorita vai a primeiro por ordenarEntradas; sendo a escolhida, o filtro não a tira.
    const arrumada = ordenarEntradas(
      [minha('a'), { id: 'm1', mestre: true, favorita: true }, minha('b')], [],
    )
    assert.deepEqual(ids(arrumada), ['m1', 'a', 'b'])
    assert.deepEqual(ids(filtrarEntradas(arrumada, 'minhas', 'm1')), ['m1', 'a', 'b'])
  })
  caso('sem conta escolhida o filtro esconde na mesma', () => {
    assert.deepEqual(ids(filtrarEntradas(lista, 'minhas')), ['a', 'b'])
    assert.deepEqual(ids(filtrarEntradas(lista, 'minhas', null)), ['a', 'b'])
    assert.deepEqual(ids(filtrarEntradas(lista, 'minhas', 'fantasma')), ['a', 'b'])
  })
  caso('nunca duplica a escolhida', () => {
    const r = filtrarEntradas(lista, 'minhas', 'a')
    assert.equal(new Set(ids(r)).size, r.length)
  })

  // ── as contas de cada lado ────────────────────────────────────────────────
  caso('contar: o número que vai nos botões', () => {
    assert.deepEqual(contarPorTipo(lista), { minhas: 2, mestres: 2, todas: 4 })
    assert.deepEqual(contarPorTipo([]), { minhas: 0, mestres: 0, todas: 0 })
    assert.deepEqual(contarPorTipo([minha('a')]), { minhas: 1, mestres: 0, todas: 1 })
  })

  // ── arrastar com o filtro ligado ──────────────────────────────────────────
  const todasIds = ['a', 'm1', 'b', 'm2', 'c']
  caso('arrumar as minhas não mexe no lugar das mestres', () => {
    // Visível: a, b, c → arrasta-se «c» para cima de «a».
    const nova = juntarOrdemFiltrada(todasIds, ['c', 'a', 'b'])
    assert.deepEqual(nova, ['c', 'm1', 'a', 'm2', 'b'])
  })
  caso('arrumar as mestres não mexe no lugar das minhas', () => {
    const nova = juntarOrdemFiltrada(todasIds, ['m2', 'm1'])
    assert.deepEqual(nova, ['a', 'm2', 'b', 'm1', 'c'])
  })
  caso('a ordem gravada leva SEMPRE todas as contas, nunca só as visíveis', () => {
    const nova = juntarOrdemFiltrada(todasIds, ['b', 'a', 'c'])
    assert.equal(nova.length, todasIds.length)
    assert.deepEqual([...nova].sort(), [...todasIds].sort())
  })
  caso('sem filtro (tudo visível) é o arrasto de sempre', () => {
    assert.deepEqual(juntarOrdemFiltrada(todasIds, ['m2', 'a', 'm1', 'b', 'c']), ['m2', 'a', 'm1', 'b', 'c'])
  })
  caso('uma conta acabada de abrir não se perde ao gravar', () => {
    assert.deepEqual(juntarOrdemFiltrada(['a', 'b'], ['b', 'nova', 'a']), ['b', 'a', 'nova'])
  })

  // ── ida e volta: arrastar dentro do filtro, ver com «Todas» ───────────────
  caso('arrastar em «As minhas» e voltar a «Todas» deixa tudo onde devia', () => {
    const entradas = [minha('a'), mestre('m1'), minha('b'), mestre('m2'), minha('c')]
    const arrumadas = ordenarEntradas(entradas, [])
    const visiveis = filtrarEntradas(arrumadas, 'minhas', 'a')
    assert.deepEqual(ids(visiveis), ['a', 'b', 'c'])
    // O dedo põe o «c» em cima do «a».
    const gravada = juntarOrdemFiltrada(ids(arrumadas), moverConta(visiveis, 'c', 'a'))
    // Com «Todas»: as minhas trocaram entre si, as mestres estão nos mesmos lugares.
    assert.deepEqual(ids(ordenarEntradas(entradas, gravada)), ['c', 'm1', 'a', 'm2', 'b'])
    // E com o filtro de volta a «As minhas», é exactamente o que o dedo fez.
    assert.deepEqual(ids(filtrarEntradas(ordenarEntradas(entradas, gravada), 'minhas', 'a')), ['c', 'a', 'b'])
  })

  console.log(`\nfiltro-contas: ${n} verificações certas`)
}

main()
