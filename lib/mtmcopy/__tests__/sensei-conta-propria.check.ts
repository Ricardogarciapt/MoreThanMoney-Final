import assert from 'node:assert/strict'
import {
  CANONICAL_PREMIUM_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
  SENSEI_PROVIDER_ACCOUNT_ID,
} from '../provider-constants'
import { SENSEI_PROVIDER_EXECUTION, TRADE_IDEAS_PROVIDER_EXECUTION } from '../provider-execution'

// A 2026-08-25 a ideia Sensei #14509 abriu na conta MESTRE do Premium e a CopyFactory
// replicou-a para os 8 subscritores do Premium. A conta do Sensei nunca pode voltar a ser
// a do Premium — é essa a regra que este teste tranca.
assert.notEqual(
  SENSEI_PROVIDER_ACCOUNT_ID,
  CANONICAL_PREMIUM_ACCOUNT_ID,
  'o Sensei NÃO pode abrir na conta mestre do Premium',
)
assert.notEqual(
  SENSEI_PROVIDER_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
  'o Sensei deve ter conta própria, não a do Trade Ideas',
)
assert.match(SENSEI_PROVIDER_ACCOUNT_ID, /^[0-9a-f-]{36}$/, 'id de conta MetaApi inválido')

// E o perfil tem de ser o do Sensei, não o do Trade Ideas: era o comentário MTM-TI e os
// 0,05% de risco que denunciavam a trade trocada no MT5.
assert.equal(SENSEI_PROVIDER_EXECUTION.mt_comment, 'MTM-SENSEI', 'comentário errado nas ordens')
assert.notEqual(SENSEI_PROVIDER_EXECUTION.mt_comment, TRADE_IDEAS_PROVIDER_EXECUTION.mt_comment)
assert.equal(SENSEI_PROVIDER_EXECUTION.lot_value, 0.5, 'Sensei corre a 0,5% por trade')
assert.equal(SENSEI_PROVIDER_EXECUTION.auto_trailing_stop, false, 'Sensei sem trailing da corretora')

console.log('✓ sensei-conta-propria: 7 verificações')
