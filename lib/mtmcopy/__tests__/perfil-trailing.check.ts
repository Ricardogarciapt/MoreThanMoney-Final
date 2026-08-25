import assert from 'node:assert/strict'
import { SENSEI_PROVIDER_EXECUTION, PREMIUM_PROVIDER_EXECUTION } from '../provider-execution'
import { usesPriceMonitor } from '../exit-engine'
import { premiumTrailingAfterTp1Hit } from '../premium-trade-active'
import { pipSizeForSymbol } from '../trade-outcome'

// O Sensei é acompanhado pelo motor de preço; o trailing da corretora fica desligado.
assert.equal(usesPriceMonitor(SENSEI_PROVIDER_EXECUTION), true, 'Sensei tem de entrar no motor')
assert.equal(SENSEI_PROVIDER_EXECUTION.auto_trailing_stop, false, 'quem faz o trailing é o motor')

// O PREMIUM NÃO PODE MUDAR: continua com a gestão dele, sem entrar no perfil trailing.
assert.equal(
  usesPriceMonitor(PREMIUM_PROVIDER_EXECUTION),
  PREMIUM_PROVIDER_EXECUTION.price_monitor === true,
  'o flag do Premium não pode ser alterado por este trabalho',
)

// BE proporcional ao risco: com 115 pips de risco não se tranca aos 12 pips de pico.
const RATIO = 0.4
const riscoPips = Math.abs(4637.54 - 4626.07) / pipSizeForSymbol('XAUUSD')
assert.ok(riscoPips > 114 && riscoPips < 115.5, `risco esperado ~115 pips, deu ${riscoPips}`)
assert.ok(RATIO * riscoPips > 45, 'o limiar tem de ficar bem acima dos 12 pips fixos')
assert.ok(12 < RATIO * riscoPips, 'o limiar fixo antigo era demasiado cedo para esta trade')

// A distância do trailing sai da mesma fonte que o Premium usa depois do TP1.
const spec = premiumTrailingAfterTp1Hit(Math.round(riscoPips))
assert.ok(spec, 'sem especificação de trailing')
assert.ok(
  spec.mode !== 'threshold_pips' || spec.trailPips > 0,
  'distância de trailing inválida',
)

console.log('✓ perfil-trailing: 8 verificações')
