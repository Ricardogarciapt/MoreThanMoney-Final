/**
 * Registo das acções do WebTrader (separador «Registo»).
 *
 *   npx tsx components/funded/__tests__/registo.check.ts
 */
import assert from 'node:assert/strict'
import { MAX_REGISTO, juntarAoRegisto, type EntradaRegisto } from '../um-clique'

const e = (id: number): EntradaRegisto => ({ id, em: id, descricao: `acção ${id}`, ok: id % 2 === 0, texto: 'x', ms: 10 })
let r: EntradaRegisto[] = []
for (let i = 1; i <= 130; i++) r = juntarAoRegisto(r, e(i))
assert.equal(r.length, MAX_REGISTO)
assert.equal(r[0].id, 130, 'a mais recente primeiro')
assert.equal(r[r.length - 1].id, 31, 'as mais antigas saem')
console.log('  ok  mais recente primeiro, no máximo 100\n\n1 caso ok')
