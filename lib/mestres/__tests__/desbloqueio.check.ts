/**
 * Desbloqueio automático: só causas conhecidas e inofensivas.
 *
 *   npx tsx lib/mestres/__tests__/desbloqueio.check.ts
 */
import assert from 'node:assert/strict'
import { causaDoBloqueio, podeDesbloquearSozinha } from '../desbloqueio'

const pnf = { bloqueio_motivo: '6 falhas seguidas: A corretora recusou: Position not found', ultima_falha: 'A corretora recusou: Position not found' }
assert.equal(causaDoBloqueio(pnf), 'A corretora recusou: Position not found')
assert.equal(podeDesbloquearSozinha(pnf), true, '«Position not found» desbloqueia')
assert.equal(podeDesbloquearSozinha({ bloqueio_motivo: '6 falhas seguidas: Invalid stops', ultima_falha: null }), true, '«Invalid stops» desbloqueia')
assert.equal(
  podeDesbloquearSozinha({ bloqueio_motivo: '6 falhas seguidas: Invalid account', ultima_falha: 'Invalid account' }),
  false, 'avaria real fica para uma pessoa',
)
assert.equal(
  podeDesbloquearSozinha({ bloqueio_motivo: '6 falhas seguidas: Position not found', ultima_falha: 'Not enough money' }),
  false, 'se a última falha for avaria, não desbloqueia',
)
assert.equal(podeDesbloquearSozinha({ bloqueio_motivo: null, ultima_falha: null }), false, 'sem causa escrita, não adivinha')
assert.equal(podeDesbloquearSozinha({ bloqueio_motivo: null, ultima_falha: 'Position not found' }), true)

console.log('desbloqueio: ok')
