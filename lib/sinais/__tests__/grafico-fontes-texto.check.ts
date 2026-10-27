/**
 * Gráfico nas fontes que chegam como texto (27/10): Premium e Forex Swings no formato único
 * dão parâmetros de gráfico; seguimentos e conversa não. Corre: npx tsx lib/sinais/__tests__/grafico-fontes-texto.check.ts
 */
import assert from 'node:assert/strict'
import { graficoDoFormatoUnico, urlDoGrafico } from '../grafico-publicar'
import { marcaDaEstrategia } from '../grafico-estrategia'
import { premiumParaFormatoUnico } from '../premium-formato'
import { scannerKeyFromStrategy } from '../../mtm-alerts/scanners'
import { alertaDeSinalPago } from '../../direito-sinais'

const premium = premiumParaFormatoUnico('XAUUSD SELL\nZone 3998 - 4004\nSL 4009\nTP1 3993\nTP2 3988\nTP3 3983')
assert.ok(premium, 'premium no formato único')
const g = graficoDoFormatoUnico(premium, 'premium', { timeframe: '15' })
assert.ok(g)
assert.equal(g.simbolo, 'XAUUSD')
assert.equal(g.direcao, 'sell')
assert.equal(g.entrada, 4004)
assert.equal(g.sl, 4009)
assert.deepEqual(g.tps, [3993, 3988, 3983])
assert.equal(g.timeframe, '15')
assert.match(urlDoGrafico(g, { origem: 'https://x' }), /e=premium/)

const swings = '🔴 EURGBP · VENDA\n📌 MTM Auto Forex Swings · Novo sinal\n🎯 Entrada: Mercado\n🛑 SL: 0.8388\n✅ TP1: 0.8316\n⏱ H4 · 27/10 09:17'
const gs = graficoDoFormatoUnico(swings, 'forex-swings', { timeframe: '60' })
assert.ok(gs)
assert.equal(gs.entrada, null)
assert.equal(gs.timeframe, '240', 'H4 do cartão → 240 minutos')

assert.equal(graficoDoFormatoUnico('✅ TP1 HIT +50 pips', 'premium'), null)

assert.equal(marcaDaEstrategia('premium').nome, 'MTM Auto Premium')
assert.equal(marcaDaEstrategia('forex-swings').nome, 'MTM Auto Forex Swings')
assert.equal(marcaDaEstrategia('mtm-auto-edge').nome, 'MTM Auto Edge')
assert.equal(marcaDaEstrategia('sensei').nome, 'MTM Auto Sensei')

assert.equal(scannerKeyFromStrategy('MTM Auto Premium'), 'premium')
assert.equal(alertaDeSinalPago({ strategy: 'MTM Auto Premium', assetClass: 'gold_btc' }), true)

console.log('grafico-fontes-texto: OK')
