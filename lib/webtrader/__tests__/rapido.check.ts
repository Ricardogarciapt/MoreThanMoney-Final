/**
 * WebTrader rápido (2026-09) — colagem das velas (corpo em cache + cauda recente) e a regra única
 * de que ligações recebem o Tap to Trade (TradeLocker ligada no WebTrader nasce com o T2T desligado).
 * Correr: npx tsx lib/webtrader/__tests__/rapido.check.ts
 */
import assert from 'node:assert/strict'
import { recebeT2T, t2tDesligadoNaConta } from '../../mtmcopy/alvo-t2t'
import { colarVelas, type VelaOHLCV } from '../../mtmfunded/simulado/velas'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }
const v = (t: number, c = t): VelaOHLCV => ({ t, o: c, h: c, l: c, c, v: 1 })

caso('velas: a cauda ganha a partir da sua primeira vela e não há repetidas', () => {
  const corpo = [100, 200, 300, 400, 500].map((t) => v(t))
  const cauda = [400, 500, 600].map((t) => v(t, t + 1))
  const r = colarVelas(corpo, cauda, 10)
  assert.deepEqual(r.map((x) => x.t), [100, 200, 300, 400, 500, 600])
  assert.equal(r.find((x) => x.t === 500)!.c, 501)
})
caso('velas: fica com as `limite` mais recentes', () => {
  const r = colarVelas([1, 2, 3, 4].map((t) => v(t)), [4, 5].map((t) => v(t)), 3)
  assert.deepEqual(r.map((x) => x.t), [3, 4, 5])
})
caso('velas: sem cauda devolve o corpo; sem corpo devolve a cauda', () => {
  assert.deepEqual(colarVelas([v(1), v(2)], [], 5).map((x) => x.t), [1, 2])
  assert.deepEqual(colarVelas([], [v(7)], 5).map((x) => x.t), [7])
})

caso('T2T: conta dedicada do ligador (sem bandeira) recebe — nada muda', () => {
  assert.equal(recebeT2T({ purpose: 'tap_to_trade', t2t_enabled: null }), true)
  assert.equal(recebeT2T({ purpose: 'tap_to_trade' }), true)
})
caso('T2T: conta de cópia com o T2T marcado recebe; sem marca não', () => {
  assert.equal(recebeT2T({ purpose: 'mtmcopy', t2t_enabled: true }), true)
  assert.equal(recebeT2T({ purpose: 'mtmcopy', t2t_enabled: null }), false)
  assert.equal(recebeT2T({ purpose: 'mtmcopy', t2t_enabled: false }), false)
})
caso('T2T: TradeLocker ligada no WebTrader (dedicada, t2t_enabled=false) NÃO recebe até se ligar', () => {
  const doWebtrader = { purpose: 'tap_to_trade', t2t_enabled: false }
  assert.equal(recebeT2T(doWebtrader), false)
  assert.equal(t2tDesligadoNaConta(doWebtrader), true)
  assert.equal(recebeT2T({ ...doWebtrader, t2t_enabled: true }), true)
  assert.equal(t2tDesligadoNaConta({ ...doWebtrader, t2t_enabled: true }), false)
})

console.log(`\n${n} verificações OK`)
