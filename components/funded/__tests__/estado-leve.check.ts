/**
 * Releitura leve do WebTrader — quando pedir o estado inteiro.
 *
 *   npx tsx components/funded/__tests__/estado-leve.check.ts
 */
import assert from 'node:assert/strict'
import {
  CHEIO_MAX_MS, SONDAGEM_ATIVA_MS, SONDAGEM_PARADA_MS,
  assinaturaEstado, intervaloDeSondagem, juntarLeve, precisaDeEstadoCheio,
} from '../estado-leve'

const e = (saldo: number, posicoes: Array<{ id: string; volume: number }>, ordens: Array<{ id: string }> = []) => ({ estado: { saldo }, posicoes, ordens })
const base = e(10000, [{ id: 'a', volume: 0.03 }], [{ id: 'o1' }])
const a0 = assinaturaEstado(base)
const t0 = 1_000_000
const cheio = { em: t0, assinatura: a0 }

assert.equal(precisaDeEstadoCheio(null, a0, t0), true, 'primeira leitura é inteira')
assert.equal(precisaDeEstadoCheio(cheio, a0, t0 + 4_000), false, 'nada mudou → fica a leve')
assert.equal(precisaDeEstadoCheio(cheio, a0, t0 + CHEIO_MAX_MS), true, 'de minuto a minuto, inteira')
assert.equal(precisaDeEstadoCheio(cheio, assinaturaEstado(e(10012.5, [{ id: 'a', volume: 0.03 }], [{ id: 'o1' }])), t0 + 4_000), true, 'saldo mudou (fecho)')
assert.equal(precisaDeEstadoCheio(cheio, assinaturaEstado(e(10000, [], [{ id: 'o1' }])), t0 + 4_000), true, 'posição desapareceu (SL/TP do motor)')
assert.equal(precisaDeEstadoCheio(cheio, assinaturaEstado(e(10000, [{ id: 'a', volume: 0.02 }], [{ id: 'o1' }])), t0 + 4_000), true, 'fecho parcial (volume)')
assert.equal(precisaDeEstadoCheio(cheio, assinaturaEstado(e(10000, [{ id: 'a', volume: 0.03 }, { id: 'b', volume: 0.01 }], [])), t0 + 4_000), true, 'pendente executada')
assert.equal(assinaturaEstado(e(1, [{ id: 'b', volume: 1 }, { id: 'a', volume: 1 }])), assinaturaEstado(e(1, [{ id: 'a', volume: 1 }, { id: 'b', volume: 1 }])), 'ordem da lista não conta')

assert.equal(intervaloDeSondagem(null), SONDAGEM_ATIVA_MS)
assert.equal(intervaloDeSondagem(base), SONDAGEM_ATIVA_MS)
assert.equal(intervaloDeSondagem(e(1, [], [{ id: 'x' }])), SONDAGEM_ATIVA_MS, 'pendente conta como activa')
assert.equal(intervaloDeSondagem(e(1, [])), SONDAGEM_PARADA_MS)

const anterior = { historico: ['h1'], desempenho: { trades: 3 }, posicoes: [1] }
const leve = { historico: [], desempenho: { trades: 0 }, posicoes: [2] }
assert.deepEqual(juntarLeve(anterior, leve), { historico: ['h1'], desempenho: { trades: 3 }, posicoes: [2] }, 'fica o histórico, entram as posições')
assert.deepEqual(juntarLeve(null, leve), leve)

console.log('estado-leve: todos certos')
