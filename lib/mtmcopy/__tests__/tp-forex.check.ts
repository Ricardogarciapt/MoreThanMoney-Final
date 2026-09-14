import assert from 'node:assert/strict'
import { parseSignal } from '../signal-parser'

/**
 * «Take Profit 1: 4600.5» traz dois números: o NÍVEL (1) e o preço. A guarda que resolvia isso
 * exigia 2+ dígitos — e partiu o forex inteiro: 1.90713 e 0.57517 têm UM dígito antes da vírgula.
 * Resultado a 2026-08-25: todos os sinais de forex ficavam sem alvos, a ordem abria sem TP e o
 * Tap to Trade recusava-os com «sinal incompleto». A regra é: decimais OU 2+ dígitos.
 */
const casos: Array<[string, string, number[]]> = [
  ['forex 1.x', '📊 GBPAUD 🔵 COMPRA\n🎯 Entrada: 1.90507\n🛑 Stop Loss: 1.90403\n✅ Take Profit 1: 1.90713\n✅ Take Profit 2: 1.9092\n✅ Take Profit 3: 1.91127', [1.90713, 1.9092, 1.91127]],
  ['forex 0.x', '📊 AUDCHF 🔵 COMPRA\n🎯 Entrada: 0.57438\n🛑 Stop Loss: 0.57398\n✅ Take Profit 1: 0.57517\n✅ Take Profit 2: 0.57597', [0.57517, 0.57597]],
  ['ouro', '📊 XAUUSD 🔵 COMPRA\n🎯 Entrada: 4637.54\n🛑 Stop Loss: 4626.07\n✅ Take Profit 1: 4654.75\n✅ Take Profit 2: 4666.22', [4654.75, 4666.22]],
  ['Premium', '8. GOLD BUY SETUP\nGold Buy Zone 4643 - 4637\nSL : 4635\nTP1 : 4650\nTP2 : 4655\nTP3 : 4660', [4650, 4655, 4660]],
  ['Aurum Flow', "I'm buying XAUUSD\n4606-4602\nTP1 4609\nTP2 4611\nSL 4598", [4609, 4611]],
]

for (const [nome, texto, esperado] of casos) {
  const p = parseSignal(texto)
  assert.ok(p, `${nome}: sinal não interpretado`)
  assert.deepEqual(p.tp, esperado, `${nome}: alvos errados`)
}

// O NÚMERO DO NÍVEL nunca pode passar por preço.
const semAlvo = parseSignal('📊 XAUUSD 🔵 COMPRA\n🎯 Entrada: 4637.54\n🛑 Stop Loss: 4626.07\nTake Profit 1\nTake Profit 2')
assert.ok(!semAlvo?.tp?.includes(1), 'o nível 1 não é um preço')
assert.ok(!semAlvo?.tp?.includes(2), 'o nível 2 não é um preço')

console.log(`✓ tp-forex: ${casos.length * 2 + 2} verificações`)
