import assert from 'node:assert/strict'
import { pipSizeForSymbol } from '../trade-outcome'

/**
 * A trade real de 2026-08-25: o sinal dizia «Gold Buy Zone 4620 - 4615» (entrada registada 4615)
 * mas o preço já tinha passado a zona e a ordem encheu a 4622,29 a mercado.
 */
const ZONA = 4615
const FILL = 4622.29
const pip = pipSizeForSymbol('XAUUSD')
const BUFFER_BE = 5

const lucroPips = (ref: number, preco: number) => (preco - ref) / pip
const be = (ref: number) => ref + BUFFER_BE * pip

// No instante da abertura, medir pela zona inventa lucro que não existe.
assert.ok(lucroPips(ZONA, FILL) > 70, 'a zona devia dar ~+72 pips falsos à cabeça')
assert.equal(Math.round(lucroPips(FILL, FILL)), 0, 'o preenchimento real dá zero, que é a verdade')

// E o "break-even" calculado pela zona fica ABAIXO da entrada real: um stop de PERDA.
assert.ok(be(ZONA) < FILL, 'BE pela zona ficava abaixo do preenchimento — perda disfarçada')
assert.ok(be(FILL) > FILL, 'BE pelo preenchimento fica acima da entrada, como deve ser')
assert.ok(be(FILL) - FILL > 0.49 && be(FILL) - FILL < 0.51, 'buffer de 5 pips = 0,50 no ouro')

// Fecho real da trade: 4625,50. Pela zona parecia +105 pips; foram +32.
const FECHO = 4625.5
assert.ok(Math.round(lucroPips(ZONA, FECHO)) === 105, 'a zona reportava +105 pips')
assert.ok(Math.round(lucroPips(FILL, FECHO)) === 32, 'o resultado verdadeiro foram +32 pips')

// O limiar da tranca de lucro (12 pips) era ultrapassado à cabeça pela medida errada.
assert.ok(lucroPips(ZONA, FILL) >= 12, 'pela zona a tranca disparava no segundo zero')
assert.ok(lucroPips(FILL, FILL) < 12, 'pelo preenchimento não dispara antes de haver lucro')

console.log('✓ premium-ref-entry: 9 verificações')
