/**
 * TrendShot no gráfico do WebTrader — cruzamentos EMA20/EMA50, sessão e níveis AUTO.
 *
 *   npx tsx lib/estudos/trendshot/__tests__/trendshot.check.ts
 */
import assert from 'node:assert/strict'
import { calcularTrendShot, naSessao } from '../motor'
import { niveisTrendshot } from '@/lib/sinais/trendshot'
import type { Vela } from '../../comum/velas'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

// Velas de 15 min a partir de 2026-10-22 00:00 UTC: 120 a descer, depois 120 a subir.
const T0 = Date.UTC(2026, 9, 22) / 1000
const velas = (precos: number[]): Vela[] => precos.map((c, i) => ({ t: T0 + i * 900, o: c, h: c + 1, l: c - 1, c }))
const vale = [...Array.from({ length: 120 }, (_, i) => 2000 - i), ...Array.from({ length: 120 }, (_, i) => 1880 + i * 2)]

caso('sessão: 08–21 UTC, fim exclusivo, e sessões que atravessam a meia-noite', () => {
  const h = (hora: number) => T0 + hora * 3600
  assert.equal(naSessao(h(8), 8, 21), true)
  assert.equal(naSessao(h(20), 8, 21), true)
  assert.equal(naSessao(h(21), 8, 21), false)
  assert.equal(naSessao(h(7), 8, 21), false)
  assert.equal(naSessao(h(23), 22, 2), true)
  assert.equal(naSessao(h(1), 22, 2), true)
  assert.equal(naSessao(h(12), 22, 2), false)
})

caso('cruzamento para cima dá um BUY na vela do cruzamento, com os níveis do servidor', () => {
  const r = calcularTrendShot(velas(vale), { simbolo: 'XAUUSD', sessaoInicio: 0, sessaoFim: 24 })
  const buys = r.sinais.filter((s) => s.direcao === 'buy')
  assert.equal(buys.length, 1)
  const s = buys[0]
  assert.ok(r.emaRapida[s.i] > r.emaLenta[s.i] && r.emaRapida[s.i - 1] <= r.emaLenta[s.i - 1])
  assert.equal(s.entrada, vale[s.i])
  const esperado = niveisTrendshot('XAUUSD', 'buy', s.entrada)
  assert.equal(s.sl, esperado.sl)
  assert.deepEqual(s.tps, esperado.tps)
  assert.equal(s.sl, s.entrada - 20)
})

caso('fora da sessão o cruzamento não conta', () => {
  const r = calcularTrendShot(velas(vale), { simbolo: 'XAUUSD', sessaoInicio: 0, sessaoFim: 24 })
  const hora = new Date(r.sinais.find((s) => s.direcao === 'buy')!.t * 1000).getUTCHours()
  const fora = calcularTrendShot(velas(vale), { simbolo: 'XAUUSD', sessaoInicio: (hora + 1) % 24, sessaoFim: (hora + 2) % 24 })
  assert.equal(fora.sinais.filter((s) => s.direcao === 'buy').length, 0)
})

caso('a vela ainda aberta não confirma sinal', () => {
  const r = calcularTrendShot(velas(vale), { simbolo: 'XAUUSD', sessaoInicio: 0, sessaoFim: 24 })
  const i = r.sinais.find((s) => s.direcao === 'buy')!.i
  const cortado = velas(vale.slice(0, i + 1))
  assert.equal(calcularTrendShot(cortado, { simbolo: 'XAUUSD', sessaoInicio: 0, sessaoFim: 24 }).sinais.filter((s) => s.direcao === 'buy').length, 0)
  assert.equal(calcularTrendShot(cortado, { simbolo: 'XAUUSD', sessaoInicio: 0, sessaoFim: 24, incluirVelaAberta: true }).sinais.filter((s) => s.direcao === 'buy').length, 1)
})

caso('sem velas suficientes para a EMA50: nada, sem rebentar', () => {
  const r = calcularTrendShot(velas(vale.slice(0, 30)), { simbolo: 'EURUSD' })
  assert.equal(r.sinais.length, 0)
  assert.ok(Number.isNaN(r.emaLenta[29]))
})

caso('o último sinal sabe se já tocou no SL ou nos TPs (SL primeiro na mesma vela)', () => {
  const r = calcularTrendShot(velas(vale), { simbolo: 'XAUUSD', sessaoInicio: 0, sessaoFim: 24 })
  const u = r.ultima!
  assert.equal(u.sinal.direcao, 'buy')
  // Depois do BUY o preço sobe 2 por vela até ao fim: TP1 (+6), TP2 (+12), TP3 (+20) e TP4 (+30) tocados.
  assert.equal(u.slTocado, false)
  assert.deepEqual(u.tpTocado, [true, true, true, true])
  const queda = [...vale.slice(0, u.sinal.i + 1), vale[u.sinal.i] - 25, vale[u.sinal.i] - 26]
  const r2 = calcularTrendShot(velas(queda), { simbolo: 'XAUUSD', sessaoInicio: 0, sessaoFim: 24, incluirVelaAberta: false })
  assert.equal(r2.ultima?.slTocado, true)
  assert.deepEqual(r2.ultima?.tpTocado, [false, false, false, false])
})

console.log(`\n${n} casos ok`)
