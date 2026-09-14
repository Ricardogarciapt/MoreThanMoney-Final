import assert from 'node:assert/strict'
import { t2tUsaTrailing, t2tSourceKey } from '../t2t-source'

const FOREX_SWINGS = 'Forex Swings\nEURUSD BUY\nEntrada: 1.0850\nSL: 1.0800\nTP1: 1.0950'
const IDEIAS_FOREX = '💱 Ideias de Forex — Novo Sinal\n📊 EURGBP 🔵 COMPRA\n🎯 Entrada: 0.8420\n🛑 Stop Loss: 0.8390\n✅ Take Profit 1: 0.8480'
const PREMIUM = '8. GOLD BUY SETUP\nGold Buy Zone 4643 - 4637\nSL : 4635\nTP1 : 4650'
const SENSEI = '🧠 Sensei Scanner — Entry Alert\n📊 XAUUSD 🔵 COMPRA\n🎯 Entrada activada: 4637.54\n🛑 Stop Loss: 4626.07\n✅ Take Profit 1: 4654.75'
const GOLDEN = "I'm buying XAUUSD\n4624-4620\nTP1 4627\nSL 4616"

// O James (Forex Swings) é a ÚNICA exceção: swing de vários dias, sem trailing.
assert.equal(t2tSourceKey('ideias-e-sinais', FOREX_SWINGS), 'james', 'fonte do James mal identificada')
assert.equal(t2tUsaTrailing('ideias-e-sinais', FOREX_SWINGS), false, 'o James NÃO leva trailing')

// As Ideias de Forex são outro canal e levam trailing — foi o pedido explícito.
assert.equal(t2tSourceKey('trade-ideas-setup', IDEIAS_FOREX), 'forexideas', 'Ideias de Forex mal identificadas')
assert.equal(t2tUsaTrailing('trade-ideas-setup', IDEIAS_FOREX), true, 'Ideias de Forex LEVAM trailing')

// As restantes fontes negociáveis levam todas.
for (const [slug, txt, nome] of [
  ['premium-ideas', PREMIUM, 'Premium'],
  ['sensei-scanner', SENSEI, 'Sensei'],
  ['aurum-flow', GOLDEN, 'Aurum Flow'],
  // Alias do slug antigo (até 2026-10-14).
  ['golden-moves', GOLDEN, 'Aurum Flow (slug antigo)'],
] as const) {
  assert.equal(t2tUsaTrailing(slug, txt), true, `${nome} devia levar trailing`)
}

// Uma fonte que nem sequer é negociável não pode "levar trailing".
assert.equal(t2tUsaTrailing('geral', 'bom dia malta'), false, 'canal sem T2T não leva trailing')
assert.equal(t2tUsaTrailing(null, null), false, 'sem canal não leva trailing')

console.log('✓ t2t-trailing-fontes: 9 verificações')
