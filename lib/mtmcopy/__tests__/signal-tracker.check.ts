import assert from 'node:assert/strict'
import { isT2TEntrySignal, t2tMode, t2tSourceKey } from '../t2t-source'
import { parseSignal } from '../signal-parser'

/**
 * Regras de ADMISSÃO do motor que segue todos os sinais. O que entra aqui abre 0,03 lotes na
 * conta-espelho e passa a dar métricas; o que não entra fica de fora para sempre.
 */
function admite(canal: string, texto: string): { ok: boolean; porque: string } {
  if (!isT2TEntrySignal(canal, texto)) return { ok: false, porque: 'não é entrada' }
  if (t2tMode(canal, texto) === 'follow') return { ok: false, porque: 'perpétuo (segue na Bybit)' }
  const p = parseSignal(texto)
  if (!p?.symbol || !p.direction) return { ok: false, porque: 'sem par/direção' }
  if (!p.sl) return { ok: false, porque: 'sem SL' }
  if (!(p.tp ?? []).length) return { ok: false, porque: 'sem alvos' }
  return { ok: true, porque: '' }
}

// As fontes que ANTES não tinham métricas nenhumas — são estas que motivaram o motor.
const IDEIAS_FOREX = '📊 MTM Scanner · Forex — Novo Sinal\n📊 GBPAUD 🔵 COMPRA\n🎯 Entrada: 1.90507\n🛑 Stop Loss: 1.90403\n✅ Take Profit 1: 1.90713\n✅ Take Profit 2: 1.9092'
const JAMES = '🔵 USDCAD BUY\nSL: 1.3848\nTP: 1.392\n🌊 Forex Swings — set & forget'
assert.equal(admite('trade-ideas-setup', IDEIAS_FOREX).ok, true, 'Ideias de Forex têm de entrar')
assert.equal(admite('ideias-e-sinais', JAMES).ok, true, 'James tem de entrar')
assert.equal(t2tSourceKey('ideias-e-sinais', JAMES), 'james', 'fonte do James mal identificada')

// E as que já tinham.
assert.equal(admite('premium-ideas', '8. GOLD BUY SETUP\nGold Buy Zone 4643 - 4637\nSL : 4635\nTP1 : 4650\nTP2 : 4655').ok, true, 'Premium')
assert.equal(admite('aurum-flow', "I'm buying XAUUSD\n4606-4602\nTP1 4609\nTP2 4611\nSL 4598").ok, true, 'Aurum Flow')
assert.equal(admite('sensei-scanner', '🧠 Sensei Scanner — Entry Alert — Ideia Activada #1 ✅\n📊 XAUUSD 🔵 COMPRA\n🎯 Entrada activada: 4637.54\n🛑 Stop Loss: 4626.07\n✅ Take Profit 1: 4654.75').ok, true, 'Sensei')

// O que NÃO pode entrar.
assert.equal(admite('premium-ideas', 'HIT TP1 ✅ +105PIPS').ok, false, 'follow-up não é sinal')
assert.equal(admite('premium-ideas', 'London performance\n1- GOLD BUY 45 PIPS ✅').ok, false, 'resumo não é sinal')
assert.equal(admite('premium-ideas', '🏁 Alvo final · XAUUSD 🔵 COMPRA · +173 pips').ok, false, 'o nosso próprio cartão não é sinal')
assert.equal(
  admite('cripto-perps', 'MTM Perps · PEPEUSDT.P\n🟢 LONG\nEntrada 0.0000121\nSL 0.0000115 · TP1 0.0000133').ok,
  false,
  'perpétuo sem par MT5 não abre — segue-se na Bybit',
)
// Um perpétuo COM par em MT5 entra: o cliente pode mesmo abri-lo.
assert.equal(
  admite('cripto-perps', 'AURUM FLOW · ETHUSDT.P\n🟢 LONG\nEntrada 3120\nSL 3050 · TP1 3210 · TP2 3290').ok,
  true,
  'ETH existe em MT5 e deve entrar',
)

console.log('✓ signal-tracker: 11 verificações')

// ── O NÚMERO DA IDEIA NÃO É UM PREÇO ─────────────────────────────────────────
// O cabeçalho do Sensei — «Entry Alert — Ideia Activada #14509» — casa com o teste de «entrada»
// e o primeiro número da linha era lido como preço: 14509 num sinal de ouro a 4637. O motor
// media o lucro contra 14509 e o cartão anunciava −97 763 pips.
const SENSEI_ID_GRANDE =
  '🧠 Sensei Scanner — Entry Alert — Ideia Activada #14509 ✅\n📊 XAUUSD 🔵 COMPRA\n🎯 Entrada activada: 4637.54\n🛑 Stop Loss: 4626.07\n✅ Take Profit 1: 4654.75'
assert.equal(parseSignal(SENSEI_ID_GRANDE)?.entry, 4637.54, 'o #14509 não pode virar entrada')
assert.equal(
  parseSignal(SENSEI_ID_GRANDE.replace('#14509', '#7'))?.entry,
  4637.54,
  'um id pequeno também não',
)
// E os formatos que já funcionavam continuam iguais.
assert.equal(parseSignal('📊 GBPAUD 🔵 COMPRA\n🎯 Entrada: 1.90507\n🛑 Stop Loss: 1.90403\n✅ Take Profit 1: 1.90713')?.entry, 1.90507, 'Ideias de Forex')
assert.equal(parseSignal('8. GOLD BUY SETUP\nGold Buy Zone 4643 - 4637\nSL : 4635\nTP1 : 4650')?.entry, 4637, 'Premium (ponta da zona)')

console.log('✓ signal-tracker: +4 verificações de id-vs-preço')
