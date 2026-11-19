import assert from 'node:assert/strict'
import { distanciaSlFixo, slFixo, timeframeAceite, tpsFixos } from '../sl-por-estrategia'

/** Stop fixo por estratégia (26/10). Correr: npx tsx lib/sinais/__tests__/sl-por-estrategia.check.ts */
// Sensei e GoldKiller ficam com o stop do Pine (backtest de 26/10)
assert.equal(slFixo('sensei', 'XAUUSD', 'sell', 4012.23), null)
assert.equal(slFixo('Goldkiller', 'XAUUSD', 'buy', 4000), null)
// Trendshot 100 pips; MTM Scanner 20 pips desde 19/11 (os nomes como vêm em tradingview_signals.estrategia)
assert.equal(slFixo('trendshot', 'XAUUSD', 'buy', 4000), 3990)
assert.equal(slFixo('mtm-scanner', 'USDJPY', 'sell', 150.123), 150.323)
assert.equal(slFixo('mtm-scanner', 'EURUSD', 'buy', 1.1), 1.098)
// Alvos fixos do MTM Scanner: 1R / 2R / 3R (20 / 40 / 60 pips)
assert.deepEqual(tpsFixos('mtm-scanner', 'EURUSD', 'buy', 1.1), [1.102, 1.104, 1.106])
assert.deepEqual(tpsFixos('mtm-scanner', 'EURJPY', 'sell', 175.516), [175.316, 175.116, 174.916])
assert.equal(tpsFixos('trendshot', 'XAUUSD', 'buy', 4000), null)
assert.equal(tpsFixos('mtm-scanner', 'US30', 'buy', 40000), null)
assert.equal(tpsFixos('mtm-scanner', 'EURUSD', null, 1.1), null)
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
