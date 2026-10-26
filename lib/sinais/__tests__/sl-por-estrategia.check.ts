import assert from 'node:assert/strict'
import { distanciaSlFixo, slFixo, timeframeAceite } from '../sl-por-estrategia'

/** Stop fixo por estratégia (26/10). Correr: npx tsx lib/sinais/__tests__/sl-por-estrategia.check.ts */
// Sensei e GoldKiller ficam com o stop do Pine (backtest de 26/10)
assert.equal(slFixo('sensei', 'XAUUSD', 'sell', 4012.23), null)
assert.equal(slFixo('Goldkiller', 'XAUUSD', 'buy', 4000), null)
// MTM Scanner e Trendshot 100 pips (os nomes como vêm em tradingview_signals.estrategia)
assert.equal(slFixo('trendshot', 'XAUUSD', 'buy', 4000), 3990)
assert.equal(slFixo('mtm-scanner', 'USDJPY', 'sell', 150.123), 151.123)
assert.equal(slFixo('mtm-scanner', 'EURUSD', 'buy', 1.1), 1.09)
// Cripto e índices contam em pontos: fica o stop do alerta
assert.equal(slFixo('trendshot', 'BTCUSDT.P', 'sell', 80000), null)
assert.equal(distanciaSlFixo('mtm-scanner', 'US30'), null)
// Estratégias sem stop fixo e dados em falta
assert.equal(slFixo('aurum-flow', 'XAUUSD', 'buy', 4000), null)
assert.equal(slFixo('mtm-scanner', 'EURUSD', null, 1.1), null)
assert.equal(slFixo('mtm-scanner', 'EURUSD', 'buy', null), null)
// Timeframes: Sensei só 15m; o resto aceita tudo; sem timeframe no alerta, aceita-se
assert.equal(timeframeAceite('sensei', '15'), true)
assert.equal(timeframeAceite('sensei', '5'), false)
assert.equal(timeframeAceite('sensei', null), true)
assert.equal(timeframeAceite('Goldkiller', '5'), true)
assert.equal(timeframeAceite('trendshot', '3'), true)
console.log('sl-por-estrategia: ok')

// direção em maiúsculas
if (slFixo('trendshot', 'XAUUSD', 'SELL', 4000) !== 4010) throw new Error('SELL maiúsculo')
console.log('sl-por-estrategia maiúsculas: ok')
