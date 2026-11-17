/**
 * Resultado real das cópias vs mestre, em pips, e a «sombra B» (sair com a mestre). Números à mão.
 *
 *   npx tsx lib/copia-contas/__tests__/resultados.check.ts
 */
import assert from 'node:assert/strict'
import { compararComMestre, fechosPorPosicao, pipsEntre, resumoPorConta } from '../resultados'

// deals: venda XAU 0,02 a 3865,00, parcial 0,01 a 3863,00 (motor), resto no SL a 3864,00
const deals = [
  { positionId: '1', symbol: 'XAUUSD.r', type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_IN', volume: 0.02, price: 3865, profit: 0, commission: -0.1, time: '2026-11-17T01:40:00Z' },
  { positionId: '1', symbol: 'XAUUSD.r', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_OUT', volume: 0.01, price: 3863, profit: 2, reason: 'DEAL_REASON_EXPERT', time: '2026-11-17T01:45:00Z' },
  { positionId: '1', symbol: 'XAUUSD.r', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_OUT', volume: 0.01, price: 3864, profit: 1, reason: 'DEAL_REASON_SL', time: '2026-11-17T01:53:10Z' },
  // posição 2 ainda aberta (só entrada) — não conta
  { positionId: '2', symbol: 'XAUUSD.r', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_IN', volume: 0.01, price: 3870, time: '2026-11-17T02:00:00Z' },
  { type: 'DEAL_TYPE_BALANCE', profit: 100, time: '2026-11-17T00:00:00Z' },
]
const f = fechosPorPosicao(deals)
assert.equal(f.size, 1)
const c = f.get('1')!
assert.equal(c.precoEntrada, 3865)
assert.equal(c.precoFecho, 3863.5)
assert.equal(c.lucro, 2.9)
assert.equal(c.motivo, 'sl')
assert.equal(c.fechadaEm, '2026-11-17T01:53:10Z')

// pips: ouro 0,1 · venda 3865 → 3863,5 = +15
assert.equal(pipsEntre('sell', 3865, 3863.5, 'XAUUSD'), 15)
assert.equal(pipsEntre('buy', 1.1, 1.1012, 'EURUSD'), 12)
assert.equal(pipsEntre('buy', null, 1, 'EURUSD'), null)

// mestre: venda 3865,42 → 3862,80 às 01:54:02 (+26,2 pips); a cópia entrou a 3865,00 (4,2 pips pior) e saiu 52 s antes
const k = compararComMestre({
  direcao: 'sell', simbolo: 'XAUUSD', copia: c,
  mestre: { precoEntrada: 3865.42, precoFecho: 3862.8, fechadaEm: '2026-11-17T01:54:02Z' },
})
assert.equal(k.pipsCopia, 15)
assert.equal(k.pipsMestre, 26.2)
assert.equal(k.divergenciaPips, -11.2)
assert.equal(k.custoEntradaPips, 4.2)
assert.equal(k.saiuAntes, true)
assert.equal(k.pipsSombraB, 22)

const r = resumoPorConta([
  { destino_chave: 'mt:a', pips_copia: 15, pips_mestre: 26.2, pips_sombra_b: 22, saiu_antes: true },
  { destino_chave: 'mt:a', pips_copia: -75, pips_mestre: -75, pips_sombra_b: -76, saiu_antes: false },
  { destino_chave: 'mt:b', pips_copia: 10, pips_mestre: 10, pips_sombra_b: 10, saiu_antes: false },
  { destino_chave: 'mt:b', pips_copia: null, pips_mestre: 10, pips_sombra_b: 10, saiu_antes: false },
])
assert.deepEqual(r[0], { conta: 'mt:a', n: 2, copia: -60, mestre: -48.8, sombraB: -54, saiuAntes: 1 })
assert.equal(r[1].n, 1)

console.log('copia-contas/resultados: fechos por posição, pips, divergência e sombra B ✓')
