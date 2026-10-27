/** GUARDA: do FOREX swings (entrada livre) só sinais, seguimentos e charts vão para o chat da app. */
import assert from 'node:assert/strict'
import { canalSoSinais, passaParaAApp } from './telegram-espelho-filtro'

assert.equal(canalSoSinais('ideias-e-sinais'), true)
assert.equal(canalSoSinais('premium-ideas'), false)

// Sinais reais (formatos vistos no canal)
assert.equal(passaParaAApp('🌊 MTM Auto FOREX Swings\n\n🔴 EURCHF SELL\n🎯 Take Profit: 0.9158\n🛡️ Stop Loss: 0.9231\n\n⚙️ Set & forget'), true)
assert.equal(passaParaAApp('🔴 EURGBP · VENDA\n📌 MTM Auto Forex Swings · Novo sinal\n🎯 Entrada: Mercado\n🛑 SL: 0.8388\n✅ TP1: 0.8316'), true)
assert.equal(passaParaAApp('🔵 USDCAD BUY\nSL: 1.3848\nTP: 1.392\n🌊 Forex Swings'), true)
// Seguimentos
assert.equal(passaParaAApp('✅ ENTRY HIT · EURGBP 🔴 VENDA\nPosição aberta @ 0.836'), true)
assert.equal(passaParaAApp('qualquer coisa', { respondeAMensagemDoChat: true }), true) // chart em resposta ao sinal
// Conversa e conversão ficam no Telegram
assert.equal(passaParaAApp('👋 Bem-vindo ao grupo! Os sinais Premium são para membros — vê os packs.'), false)
assert.equal(passaParaAApp('Alguém apanhou o EURUSD hoje?'), false)
assert.equal(passaParaAApp('Já és membro? Escreve /membro ao bot e entra nos grupos de sinais.'), false)
assert.equal(passaParaAApp(null), false)
assert.equal(passaParaAApp(''), false)

console.log('telegram-espelho-filtro: ok')
