import assert from 'node:assert/strict'
import { slComMinimo, slMinimoPips, trailingArrancaPips } from '../source-risk-rules'
import { pipSizeForSymbol } from '../trade-outcome'

// Os números reais que motivaram a regra: 73 sinais do MTM Scanner, stop entre 1,6 e 10,4 pips.
assert.equal(slMinimoPips('mtmscanner'), 20, '200 pontos = 20 pips')
assert.equal(trailingArrancaPips('mtmscanner'), 10, 'trailing arranca aos +10 pips')

// EURGBP com stop de 2,3 pips → passa a 20.
const pipFx = pipSizeForSymbol('EURGBP')
const slLargo = slComMinimo('mtmscanner', 'EURGBP', 'buy', 0.856, 0.85577)
assert.ok(slLargo != null)
assert.ok(
  Math.abs((0.856 - slLargo) / pipFx - 20) < 0.01,
  `esperava 20 pips de stop, deu ${(0.856 - slLargo) / pipFx}`,
)
// Venda: o stop vai para CIMA da entrada.
const slVenda = slComMinimo('mtmscanner', 'EURGBP', 'sell', 0.856, 0.85623)
assert.ok(slVenda != null && slVenda > 0.856, 'numa venda o stop fica acima da entrada')

// NUNCA aperta um stop que já é largo — o do trader manda.
const jaLargo = slComMinimo('mtmscanner', 'XAUUSD', 'buy', 4637.54, 4626.07)
assert.equal(jaLargo, 4626.07, 'stop de 114 pips não pode ser mexido')

// Fontes sem regra ficam exatamente como estão.
assert.equal(slComMinimo('premium', 'XAUUSD', 'buy', 4643, 4635), 4635, 'Premium intocado')
assert.equal(slComMinimo(null, 'EURGBP', 'buy', 0.856, 0.85577), 0.85577, 'sem fonte, sem regra')
assert.equal(slMinimoPips('premium'), null)
assert.equal(trailingArrancaPips('james'), null, 'o James não leva trailing de todo')

// Sem entrada ou sem stop não se inventa nada.
assert.equal(slComMinimo('mtmscanner', 'EURGBP', 'buy', null, 0.85577), 0.85577)
assert.equal(slComMinimo('mtmscanner', 'EURGBP', 'buy', 0.856, null), null)

console.log('✓ risco-por-fonte: 11 verificações')
