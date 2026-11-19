import assert from 'node:assert/strict'
import { beDoTraderPremium, slDeBePremium } from '../premium'

/** BE pedido pelo trader do Premium (19/11). Correr: npx tsx lib/mestres/__tests__/premium-be-trader.check.ts */
const CAUDA = ' ✅ Take partials. Manage Trade Risk. If hold set BE. Hold risk with Breakeven(BE)'
assert.equal(beDoTraderPremium('Trade active and running +50PIPS' + CAUDA), true)
assert.equal(beDoTraderPremium('Trade active and running +45PIPS' + CAUDA), true)
assert.equal(beDoTraderPremium('Trade active and running +30PIPS' + CAUDA), false, 'abaixo de 40 pips não mexe')
assert.equal(beDoTraderPremium('HIT TP1 ✅ +55PIPS' + CAUDA), true)
assert.equal(beDoTraderPremium('HIT TP3 ✅ +162PIPS HIT ALL TP ✅' + CAUDA), true)
assert.equal(beDoTraderPremium('Move SL to entry now'), true)
assert.equal(beDoTraderPremium('HIT SL'), false)
assert.equal(beDoTraderPremium('Close all now'), false)
assert.equal(beDoTraderPremium('London performance 📊 18 November 2026'), false)

// Venda 12260 (18/11): mestre vendeu a 3765.52; trader diz +50 com o preço a 3763.0
const venda = { direcao: 'sell' as const, entrada: 3765.52, slActual: 3779, offset: 0.2, folga: 0.5 }
assert.equal(slDeBePremium({ ...venda, preco: { bid: 3762.8, ask: 3763.1 } }), 3765.32)
// Preço ainda não passou a entrada com folga → não mexe (o stop ficaria inválido)
assert.equal(slDeBePremium({ ...venda, preco: { bid: 3764.9, ask: 3765.2 } }), null)
// Já em BE (ou melhor) → nada a fazer
assert.equal(slDeBePremium({ ...venda, slActual: 3765.0, preco: { bid: 3760, ask: 3760.3 } }), null)
// Compra
assert.equal(slDeBePremium({ direcao: 'buy', entrada: 3771.35, slActual: 3762, offset: 0.2, folga: 0.5, preco: { bid: 3776, ask: 3776.3 } }), 3771.55)
assert.equal(slDeBePremium({ direcao: 'buy', entrada: 3771.35, slActual: 3762, offset: 0.2, folga: 0.5, preco: null }), null)
console.log('premium-be-trader: ok')
