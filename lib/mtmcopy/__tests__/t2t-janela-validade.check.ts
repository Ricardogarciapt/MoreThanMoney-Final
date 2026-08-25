import assert from 'node:assert/strict'

/**
 * Espelha o `hasEntryLevel` de components/mobile/tap-to-trade-feed.tsx e o do código nativo.
 * Um SETUP PENDENTE vale 24h; um sinal a mercado morre em 5 minutos. Confundir os dois faz o
 * cartão desaparecer do Tap to Trade antes de o cliente lhe tocar.
 */
function hasEntryLevel(content?: string | null): boolean {
  if (!content) return false
  if (/(entrada|entry|zona|zone)[^\n\d]{0,20}[0-9]+[.,]?[0-9]*/i.test(content)) return true
  return /^\s*\d{2,7}(?:[.,]\d+)?\s*[-–—]\s*\d{2,7}(?:[.,]\d+)?\s*$/m.test(content)
}

// Golden Moves escreve a zona A SECO — era isto que caía na janela dos 5 minutos.
assert.equal(
  hasEntryLevel("I'm buying XAUUSD\n\n4606-4602\n\nTP1 4609\nTP2 4611\n\nSL 4598"),
  true,
  'zona sem etiqueta devia contar como nível de entrada',
)
assert.equal(hasEntryLevel('4642.50 - 4638'), true, 'zona com decimais e espaços')
assert.equal(hasEntryLevel('4624–4620'), true, 'zona com travessão')

// Os formatos etiquetados continuam a contar.
assert.equal(hasEntryLevel('Gold Buy Zone 4643 - 4637'), true, 'Premium/Gold Did')
// O Sensei mete uma palavra entre a etiqueta e o número — com `\\s*:?\\s*` ficava de fora.
assert.equal(hasEntryLevel('🎯 Entrada activada: 4637.54'), true, 'Sensei')
assert.equal(hasEntryLevel('Entry: 4398'), true, 'entry inglês')

// A mercado NÃO tem nível: 5 minutos e acabou.
assert.equal(hasEntryLevel('XAUUSD BUY NOW\nSL 4600\nTP1 4650'), false, 'sinal a mercado')
assert.equal(hasEntryLevel('TP1 HIT'), false, 'follow-up não é entrada')
assert.equal(hasEntryLevel(''), false, 'vazio')
assert.equal(hasEntryLevel(null), false, 'nulo')

// Uma data ou um resultado em pips não podem passar por zona.
assert.equal(hasEntryLevel('+50 pips'), false, 'resultado não é zona')

console.log('✓ t2t-janela-validade: 11 verificações')
