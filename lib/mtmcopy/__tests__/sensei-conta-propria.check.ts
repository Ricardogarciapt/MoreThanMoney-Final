import assert from 'node:assert/strict'
import {
  CANONICAL_PREMIUM_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
  SENSEI_PROVIDER_ACCOUNT_ID,
  SENSEI_MT5_LOGIN_NOVO,
  senseiPronto,
  GOLDENASTRO_PROVIDER_ACCOUNT_ID,
  goldenAstroPronta,
  goldenAstroColideCom,
  CONTAS_MOTOR_TEMPO_REAL,
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

// 2026-09-04: o Sensei foi REFORMADO da 34744071, que passou a ser a conta da Golden Astro.
// Enquanto não tiver a MT5 35044320 ligada, não executa — e não executar é o estado correto,
// não uma avaria. O que este teste tranca é que ninguém lhe devolva uma conta por engano.
assert.equal(SENSEI_PROVIDER_ACCOUNT_ID, '', 'o Sensei está reformado: sem conta até à 35044320')
assert.equal(senseiPronto(), false, 'sem conta, o Sensei não pode executar')
assert.equal(SENSEI_MT5_LOGIN_NOVO, '35044320', 'a conta que o Sensei vai receber')
assert.ok(
  !CONTAS_MOTOR_TEMPO_REAL.includes(''),
  'uma conta vazia nunca pode entrar na lista do motor',
)

// E a conta que era dele é agora, sem ambiguidade, a da Golden Astro.
assert.equal(
  GOLDENASTRO_PROVIDER_ACCOUNT_ID,
  '16f4f233-5cbe-4fe9-9530-89a58965bfe0',
  'a Golden Astro fica com a conta que era do Sensei',
)
assert.equal(goldenAstroColideCom(), null, 'com o Sensei fora, a colisão desaparece')
assert.equal(goldenAstroPronta(), true, 'a Golden Astro pode executar')
assert.ok(
  CONTAS_MOTOR_TEMPO_REAL.includes(GOLDENASTRO_PROVIDER_ACCOUNT_ID),
  'a conta da Golden Astro tem de ser visitada pelo motor',
)

// E o perfil tem de ser o do Sensei, não o do Trade Ideas: era o comentário MTM-TI e os
// 0,05% de risco que denunciavam a trade trocada no MT5.
assert.equal(SENSEI_PROVIDER_EXECUTION.mt_comment, 'MTM-SENSEI', 'comentário errado nas ordens')
assert.notEqual(SENSEI_PROVIDER_EXECUTION.mt_comment, TRADE_IDEAS_PROVIDER_EXECUTION.mt_comment)
assert.equal(SENSEI_PROVIDER_EXECUTION.lot_value, 0.5, 'Sensei corre a 0,5% por trade')
assert.equal(SENSEI_PROVIDER_EXECUTION.auto_trailing_stop, false, 'Sensei sem trailing da corretora')

console.log('✓ sensei-conta-propria: 14 verificações')
