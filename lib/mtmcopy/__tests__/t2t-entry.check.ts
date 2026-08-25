import assert from 'node:assert/strict'
import { parseSignal } from '../signal-parser'
import { entradaT2T } from '../t2t-entry'

const casos: Array<{ nome: string; texto: string; entrada: number; ponta: number }> = [
  {
    nome: 'Premium buy zone entra no primeiro nível',
    texto: '8. GOLD BUY SETUP\nGold Buy Zone 4643  - 4637\nSL : 4635\nTP1 : 4650\nTP2 : 4655',
    entrada: 4643,
    ponta: 4637,
  },
  {
    nome: 'Premium sell zone entra no primeiro nível',
    texto: '3. GOLD SELL SETUP\nGold Sell Zone 4637 - 4643\nSL : 4650\nTP1 : 4630',
    entrada: 4637,
    ponta: 4643,
  },
  {
    nome: 'Golden Moves zona sem etiqueta',
    texto: "I'm buying XAUUSD\n\n4642.50-4638\n\nTP1 4645\n\nSL 4635",
    entrada: 4642.5,
    ponta: 4638,
  },
]

for (const c of casos) {
  const bruto = parseSignal(c.texto)
  assert.ok(bruto, `${c.nome}: sinal não interpretado`)
  assert.equal(bruto.entry, c.ponta, `${c.nome}: provedor devia ficar na ponta`)
  assert.equal(entradaT2T(bruto).entry, c.entrada, `${c.nome}: T2T devia entrar no primeiro nível`)
  assert.equal(entradaT2T(bruto).sl, bruto.sl, `${c.nome}: SL não pode mudar`)
}

// Sinal sem zona fica intacto.
const unico = parseSignal('XAUUSD BUY 4650\nSL 4640\nTP1 4660')
assert.ok(unico)
assert.equal(entradaT2T(unico), unico, 'sinal sem zona devia ficar exactamente igual')

console.log(`✓ t2t-entry: ${casos.length * 3 + 1} verificações`)
