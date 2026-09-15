/**
 * WebTrader rápido (2026-09) — colagem das velas (corpo em cache + cauda recente) e a regra única
 * de que ligações recebem o Tap to Trade (TradeLocker ligada no WebTrader nasce com o T2T desligado).
 * Correr: npx tsx lib/webtrader/__tests__/rapido.check.ts
 */
import assert from 'node:assert/strict'
import { recebeT2T, t2tDesligadoNaConta } from '../../mtmcopy/alvo-t2t'
import { colarVelas, type VelaOHLCV } from '../../mtmfunded/simulado/velas'
import { APELIDOS, candidatosDeTicker } from '../../mtmfunded/simulado/ordens'
import { acrescentarAntigas, agregarVelas, colar, deColunas, fontesDerivacao, paraColunas, URL_VELAS } from '../velas'
import { candidatosInline, scriptPreCarga } from '../pre-carga-inline'

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

// ── WebTrader «como o TradingView» (2026-09): armazém de velas do cliente ──
caso('agregar: M5 → M15 alinhado à época, OHLC e volume certos', () => {
  const m5 = [0, 300, 600, 900, 1200].map((t, i) => ({ t, o: 10 + i, h: 20 + i, l: 5 - i, c: 11 + i, v: 1 }))
  const m15 = agregarVelas(m5, 900)
  assert.deepEqual(m15.map((x) => x.t), [0, 900])
  assert.deepEqual(m15[0], { t: 0, o: 10, h: 22, l: 3, c: 13, v: 3 })
  assert.deepEqual(m15[1], { t: 900, o: 13, h: 24, l: 1, c: 15, v: 2 })
})
caso('agregar: começa a meio de um bloco (vela parcial) e salta buracos de fim de semana', () => {
  const r = agregarVelas([{ t: 3900, o: 1, h: 2, l: 1, c: 2 }, { t: 3600 * 50, o: 3, h: 3, l: 3, c: 3 }], 3600)
  assert.deepEqual(r.map((x) => x.t), [3600, 3600 * 50])
})
caso('derivação: o maior que divide primeiro; D1 nunca de intradiário; H4 de H1', () => {
  assert.deepEqual(fontesDerivacao('H1'), ['M15', 'M5', 'M1'])
  assert.deepEqual(fontesDerivacao('H4'), ['H1', 'M15', 'M5', 'M1'])
  assert.deepEqual(fontesDerivacao('M1'), [])
  assert.deepEqual(fontesDerivacao('D1'), [])
})
caso('colar (cliente): igual ao do servidor e sem cortar', () => {
  const corpo = [100, 200, 300, 400, 500].map((t) => v(t))
  const cauda = [400, 500, 600].map((t) => v(t, t + 1))
  assert.deepEqual(colar(corpo, cauda), colarVelas(corpo, cauda, 99))
  assert.deepEqual(colar([], cauda), cauda)
  assert.deepEqual(colar(corpo, []), corpo)
})
caso('histórico para trás: só entram as mais antigas do que a primeira', () => {
  const r = acrescentarAntigas([300, 400].map((t) => v(t)), [100, 200, 300].map((t) => v(t, 9)))
  assert.deepEqual(r.map((x) => x.t), [100, 200, 300, 400])
  assert.equal(r[2].c, 300)
})
caso('formato compacto: colunas ida e volta', () => {
  const velas = [v(1, 1.5), v(2, 2.5)]
  assert.deepEqual(deColunas(paraColunas(velas)), velas)
  assert.deepEqual(deColunas(null), [])
})
caso('pré-carga do HTML: candidatos iguais aos do servidor e URL igual ao do armazém', () => {
  for (const t of ['OANDA:XAUUSD', 'BINANCE:BTCUSDT', 'GC1!', 'XAUUSDm', 'EURUSD.pro', 'TVC:DJI', 'gold', 'NAS100USD', '']) {
    assert.deepEqual(candidatosInline(t, APELIDOS), candidatosDeTicker(t), t)
  }
  const js = scriptPreCarga()
  assert.ok(js.includes('&limit=300&f=a') && URL_VELAS('XAUUSD', 'M5', 300).endsWith('&limit=300&f=a'))
  // O script vai para o HTML por toString: tem de ser JavaScript válido sozinho.
  assert.doesNotThrow(() => new Function(js))
})

console.log(`\n${n} verificações OK`)
