/**
 * A guarda de `idsDeLigacao` — prova o CASO MAU: uma linha com `connection_id` a null (ou "null")
 * NÃO pode chegar ao `.in('id', …)`, senão o PostgREST manda `id=in.(null)` e o Postgres recusa
 * o pedido inteiro (erro «invalid input syntax for type uuid: "null"», ~980×/2 h a 05/10).
 *
 *   npx tsx lib/mtmcopy/__tests__/ids-de-ligacao.check.ts
 */
import assert from 'node:assert/strict'
import { idsDeLigacao } from '../ids-de-ligacao'

let n = 0
const teste = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

console.log('\nIDS DE LIGAÇÃO\n')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

teste('o caso mau: null e "null" ficam de fora, os bons passam', () => {
  const ids = idsDeLigacao([
    { connection_id: null }, { connection_id: 'null' }, { connection_id: undefined },
    { connection_id: '' }, { connection_id: 'undefined' }, { connection_id: A },
  ])
  assert.deepEqual(ids, [A])
  // o que ia para a URL: nunca «null»
  assert.ok(!ids.join(',').includes('null'))
})

teste('só linhas sem ligação → lista vazia (quem chama não faz o pedido)', () => {
  assert.deepEqual(idsDeLigacao([{ connection_id: null }, {}]), [])
})

teste('sem repetidos e pela ordem da primeira ocorrência', () => {
  assert.deepEqual(idsDeLigacao([{ connection_id: B }, { connection_id: A }, { connection_id: B }]), [B, A])
})

console.log(`\n${n} provas, tudo ok\n`)
