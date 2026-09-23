/**
 * A ordem das contas no seletor do WebTrader (arrastada pelo dono).
 * Correr: npx tsx lib/webtrader/__tests__/ordem-contas.check.ts
 */
import assert from 'node:assert/strict'
import { moverConta, normalizarOrdem, ordenarEntradas, MAX_ORDEM } from '../ordem-contas'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

const e = (id: string, favorita = false) => ({ id, favorita })
const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id)

function main() {
  // ── limpeza da lista guardada ─────────────────────────────────────────────
  caso('normalizar: fora o que não é texto, o vazio e os repetidos', () => {
    assert.deepEqual(normalizarOrdem(['a', '', '  b ', 'a', 3, null, 'c']), ['a', 'b', 'c'])
    assert.deepEqual(normalizarOrdem('a'), [])
    assert.deepEqual(normalizarOrdem(null), [])
    assert.deepEqual(normalizarOrdem([{ id: 'a' }]), [])
  })
  caso('normalizar: tecto de ids e ids absurdos', () => {
    assert.equal(normalizarOrdem(Array.from({ length: 200 }, (_, i) => `c${i}`)).length, MAX_ORDEM)
    assert.deepEqual(normalizarOrdem(['x'.repeat(201), 'ok']), ['ok'])
  })

  // ── ordenar ───────────────────────────────────────────────────────────────
  caso('sem ordem guardada, fica tudo como estava', () => {
    const lista = [e('a'), e('b'), e('c')]
    assert.deepEqual(ids(ordenarEntradas(lista, [])), ['a', 'b', 'c'])
  })
  caso('a ordem do dono manda', () => {
    assert.deepEqual(ids(ordenarEntradas([e('a'), e('b'), e('c')], ['c', 'a', 'b'])), ['c', 'a', 'b'])
  })
  caso('conta NOVA entra no fim, não desaparece', () => {
    const r = ordenarEntradas([e('a'), e('nova'), e('c')], ['c', 'a'])
    assert.deepEqual(ids(r), ['c', 'a', 'nova'])
  })
  caso('duas novas mantêm entre si a ordem natural', () => {
    const r = ordenarEntradas([e('n1'), e('b'), e('n2')], ['b'])
    assert.deepEqual(ids(r), ['b', 'n1', 'n2'])
  })
  caso('id de conta que já não existe é ignorado', () => {
    assert.deepEqual(ids(ordenarEntradas([e('a'), e('b')], ['morta', 'b', 'a'])), ['b', 'a'])
  })
  caso('a favorita fica em primeiro mesmo contra a lista', () => {
    assert.deepEqual(ids(ordenarEntradas([e('a'), e('b'), e('c', true)], ['a', 'b', 'c'])), ['c', 'a', 'b'])
  })
  caso('nunca perde nem duplica entradas', () => {
    const lista = [e('a'), e('b'), e('c'), e('d', true)]
    const r = ordenarEntradas(lista, ['c', 'x', 'a'])
    assert.equal(r.length, lista.length)
    assert.deepEqual([...ids(r)].sort(), ['a', 'b', 'c', 'd'])
  })

  // ── arrastar ──────────────────────────────────────────────────────────────
  caso('arrastar para cima deixa a linha ANTES do alvo', () => {
    assert.deepEqual(moverConta([e('a'), e('b'), e('c')], 'c', 'a'), ['c', 'a', 'b'])
  })
  caso('arrastar para baixo deixa a linha DEPOIS do alvo', () => {
    assert.deepEqual(moverConta([e('a'), e('b'), e('c')], 'a', 'c'), ['b', 'c', 'a'])
  })
  caso('largar em cima de si mesmo não muda nada', () => {
    assert.deepEqual(moverConta([e('a'), e('b')], 'a', 'a'), ['a', 'b'])
  })
  caso('ids que não estão à vista não mexem na lista', () => {
    assert.deepEqual(moverConta([e('a'), e('b')], 'z', 'a'), ['a', 'b'])
    assert.deepEqual(moverConta([e('a'), e('b')], 'a', 'z'), ['a', 'b'])
  })
  caso('o que sai do arrasto já não tem ids mortos', () => {
    // A lista guardada tinha uma conta apagada; arrastar grava só o que existe.
    const visiveis = ordenarEntradas([e('a'), e('b'), e('c')], ['morta', 'b', 'a', 'c'])
    assert.deepEqual(moverConta(visiveis, 'c', 'b'), ['c', 'b', 'a'])
  })
  caso('arrastar e ordenar dão a mesma lista (ida e volta)', () => {
    const lista = [e('a'), e('b'), e('c'), e('d')]
    const nova = moverConta(lista, 'd', 'b')
    assert.deepEqual(ids(ordenarEntradas(lista, nova)), ['a', 'd', 'b', 'c'])
  })

  console.log(`\nordem-contas: ${n} verificações certas`)
}

main()
