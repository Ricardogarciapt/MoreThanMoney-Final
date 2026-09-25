/**
 * Ocultar contas no seletor do WebTrader (o modo organizar).
 * Correr: npx tsx lib/webtrader/__tests__/ocultar-contas.check.ts
 */
import assert from 'node:assert/strict'
import { alternarOculta, aplicarOcultas, contarOcultas, estaOculta, normalizarOcultas } from '../ocultar-contas'
import { filtrarEntradas, juntarOrdemFiltrada } from '../filtro-contas'
import { moverConta, ordenarEntradas, MAX_ORDEM } from '../ordem-contas'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

const minha = (id: string) => ({ id, mestre: false })
const mestre = (id: string) => ({ id, mestre: true })
const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id)

function main() {
  // ── limpeza do que vem da base ────────────────────────────────────────────
  caso('normalizar: texto, sem repetidos, sem vazios', () => {
    assert.deepEqual(normalizarOcultas(['a', 'a', ' b ', '', 3, null, 'c']), ['a', 'b', 'c'])
    assert.deepEqual(normalizarOcultas(null), [])
    assert.deepEqual(normalizarOcultas('a'), [])
    assert.deepEqual(normalizarOcultas(undefined), [])
  })
  caso('normalizar: tem tecto, como a ordem', () => {
    const muitas = Array.from({ length: MAX_ORDEM + 20 }, (_, i) => `c${i}`)
    assert.equal(normalizarOcultas(muitas).length, MAX_ORDEM)
  })
  caso('estaOculta diz o que está gravado', () => {
    assert.equal(estaOculta(['a', 'b'], 'a'), true)
    assert.equal(estaOculta(['a', 'b'], 'c'), false)
    assert.equal(estaOculta([], 'a'), false)
  })

  // ── o olho: esconder e repor ──────────────────────────────────────────────
  caso('o olho esconde uma conta que não estava oculta', () => {
    assert.deepEqual(alternarOculta([], 'b', 'a'), ['b'])
    assert.deepEqual(alternarOculta(['b'], 'c', 'a'), ['b', 'c'])
  })
  caso('o olho repõe uma conta oculta', () => {
    assert.deepEqual(alternarOculta(['b', 'c'], 'b', 'a'), ['c'])
    assert.deepEqual(alternarOculta(['b'], 'b', 'a'), [])
  })
  caso('a conta ABERTA não se deixa esconder', () => {
    assert.deepEqual(alternarOculta([], 'a', 'a'), [])
    assert.deepEqual(alternarOculta(['b'], 'a', 'a'), ['b'])
  })
  caso('mas a conta aberta PODE ser reposta (ficou oculta antes de ser aberta)', () => {
    assert.deepEqual(alternarOculta(['a', 'b'], 'a', 'a'), ['b'])
  })
  caso('esconder duas vezes não duplica, e o lixo não entra', () => {
    assert.deepEqual(alternarOculta(['b'], ' b ', 'a'), [])
    assert.deepEqual(alternarOculta(['b'], '', 'a'), ['b'])
    assert.deepEqual(alternarOculta(['b'], '   ', 'a'), ['b'])
  })

  // ── o que fica no ecrã ────────────────────────────────────────────────────
  const lista = [minha('a'), mestre('m1'), minha('b'), mestre('m2'), minha('c')]
  caso('sem nada oculto, a lista é a que entrou', () => {
    assert.deepEqual(ids(aplicarOcultas(lista, [], 'a')), ['a', 'm1', 'b', 'm2', 'c'])
  })
  caso('uma conta oculta sai da lista', () => {
    assert.deepEqual(ids(aplicarOcultas(lista, ['b'], 'a')), ['a', 'm1', 'm2', 'c'])
  })
  caso('as que ficam mantêm a ordem e o lugar', () => {
    assert.deepEqual(ids(aplicarOcultas(lista, ['m1', 'c'], 'a')), ['a', 'b', 'm2'])
  })
  caso('ids de contas que já não existem não fazem mal nenhum', () => {
    assert.deepEqual(ids(aplicarOcultas(lista, ['apagada', 'b'], 'a')), ['a', 'm1', 'm2', 'c'])
  })
  caso('a conta ABERTA fica à vista mesmo estando na lista das ocultas', () => {
    assert.deepEqual(ids(aplicarOcultas(lista, ['a', 'b'], 'a')), ['a', 'm1', 'm2', 'c'])
  })

  // ── no modo organizar aparece tudo ────────────────────────────────────────
  caso('modo organizar: aparecem TODAS, para se poderem repor', () => {
    assert.deepEqual(ids(aplicarOcultas(lista, ['a', 'b', 'm1'], 'c', true)), ['a', 'm1', 'b', 'm2', 'c'])
  })
  caso('modo organizar com tudo oculto: continua a mostrar tudo', () => {
    assert.deepEqual(ids(aplicarOcultas(lista, ids(lista), null, true)), ids(lista))
  })

  // ── ocultar tudo não deixa o seletor vazio ────────────────────────────────
  caso('ocultar TUDO sem conta aberta: a ocultação é ignorada, mostram-se todas', () => {
    assert.deepEqual(ids(aplicarOcultas(lista, ids(lista), null)), ids(lista))
    assert.deepEqual(ids(aplicarOcultas(lista, ids(lista), 'fantasma')), ids(lista))
  })
  caso('ocultar tudo com uma conta aberta: fica a aberta (não se ignora nada)', () => {
    assert.deepEqual(ids(aplicarOcultas(lista, ids(lista), 'b')), ['b'])
  })
  caso('a lista guardada não se altera por ter sido ignorada', () => {
    // Ignorar é só no que se mostra: repor uma conta continua a tirá-la da lista gravada.
    const todasOcultas = ids(lista)
    assert.deepEqual(ids(aplicarOcultas(lista, todasOcultas, null)), ids(lista))
    assert.deepEqual(alternarOculta(todasOcultas, 'a', null), ['m1', 'b', 'm2', 'c'])
  })
  caso('lista de contas vazia não rebenta', () => {
    assert.deepEqual(aplicarOcultas([], ['a'], null), [])
    assert.deepEqual(aplicarOcultas([], [], null, true), [])
  })

  // ── ocultar e filtrar compõem ─────────────────────────────────────────────
  caso('uma conta oculta continua oculta com o filtro em «Todas»', () => {
    const semOcultas = aplicarOcultas(lista, ['b'], 'a')
    assert.deepEqual(ids(filtrarEntradas(semOcultas, 'todas', 'a')), ['a', 'm1', 'm2', 'c'])
  })
  caso('esconder + «As minhas»: sai o que cada um tira', () => {
    const semOcultas = aplicarOcultas(lista, ['c'], 'a')
    assert.deepEqual(ids(filtrarEntradas(semOcultas, 'minhas', 'a')), ['a', 'b'])
  })
  caso('esconder + «Mestres»: a mestre oculta não volta pelo filtro', () => {
    const semOcultas = aplicarOcultas(lista, ['m1'], 'a')
    // Fica a «m2» e a conta aberta («a»), que o filtro nunca esconde.
    assert.deepEqual(ids(filtrarEntradas(semOcultas, 'mestres', 'a')), ['a', 'm2'])
  })
  caso('esconder todas as minhas com o filtro em «As minhas»: a aberta segura a lista', () => {
    const semOcultas = aplicarOcultas(lista, ['a', 'b', 'c'], 'a')
    assert.deepEqual(ids(semOcultas), ['a', 'm1', 'm2'])
    assert.deepEqual(ids(filtrarEntradas(semOcultas, 'minhas', 'a')), ['a'])
  })
  caso('no modo organizar o filtro continua a valer (só a ocultação é que pára)', () => {
    const tudo = aplicarOcultas(lista, ['b'], 'a', true)
    assert.deepEqual(ids(filtrarEntradas(tudo, 'minhas', 'a')), ['a', 'b', 'c'])
  })

  // ── arrastar no modo organizar grava a ordem INTEIRA ──────────────────────
  caso('arrumar com contas ocultas não as apaga da ordem gravada', () => {
    const arrumadas = ordenarEntradas(lista, [])
    const visiveis = filtrarEntradas(aplicarOcultas(arrumadas, ['m1'], 'a'), 'todas', 'a')
    assert.deepEqual(ids(visiveis), ['a', 'b', 'm2', 'c'])
    // O dedo põe o «c» em cima do «a».
    const gravada = juntarOrdemFiltrada(ids(arrumadas), moverConta(visiveis, 'c', 'a'))
    assert.equal(gravada.length, lista.length)
    assert.deepEqual([...gravada].sort(), ids(lista).sort())
    // A oculta («m1») ficou no segundo lugar, onde estava; as visíveis trocaram entre si.
    assert.deepEqual(gravada, ['c', 'm1', 'a', 'b', 'm2'])
  })
  caso('arrumar no modo organizar (tudo à vista) é o arrasto de sempre', () => {
    const arrumadas = ordenarEntradas(lista, [])
    const visiveis = aplicarOcultas(arrumadas, ['m1', 'c'], 'a', true)
    const gravada = juntarOrdemFiltrada(ids(arrumadas), moverConta(visiveis, 'm2', 'a'))
    assert.deepEqual(gravada, ['m2', 'a', 'm1', 'b', 'c'])
  })
  caso('a conta ESCOLHIDA não se perde nem sai do ecrã por causa de um arrasto', () => {
    const arrumadas = ordenarEntradas(lista, [])
    const visiveis = aplicarOcultas(arrumadas, ['b'], 'm2')
    assert.deepEqual(ids(visiveis), ['a', 'm1', 'm2', 'c'])
    // O dedo põe o «c» em cima do «m1»; a oculta («b») não sai do terceiro lugar.
    const gravada = juntarOrdemFiltrada(ids(arrumadas), moverConta(visiveis, 'c', 'm1'))
    assert.deepEqual(gravada, ['a', 'c', 'b', 'm1', 'm2'])
    // E a escolhida continua na lista depois de tudo voltar a ser ordenado e escondido.
    const depois = aplicarOcultas(ordenarEntradas(lista, gravada), ['b'], 'm2')
    assert.deepEqual(ids(depois), ['a', 'c', 'm1', 'm2'])
  })

  // ── a favorita e as ocultas ───────────────────────────────────────────────
  caso('uma favorita oculta continua oculta (o dono é que manda no olho)', () => {
    const arrumadas = ordenarEntradas(
      [minha('a'), { id: 'b', mestre: false, favorita: true }, minha('c')], [],
    )
    assert.deepEqual(ids(arrumadas), ['b', 'a', 'c'])
    assert.deepEqual(ids(aplicarOcultas(arrumadas, ['b'], 'a')), ['a', 'c'])
  })

  // ── contar, para o botão ──────────────────────────────────────────────────
  caso('contar só as ocultas que existem mesmo', () => {
    assert.equal(contarOcultas(lista, ['b', 'm1', 'apagada']), 2)
    assert.equal(contarOcultas(lista, []), 0)
    assert.equal(contarOcultas([], ['a']), 0)
  })

  console.log(`\nocultar-contas: ${n} verificações certas`)
}

main()
