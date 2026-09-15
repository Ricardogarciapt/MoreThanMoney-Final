/**
 * Estatísticas da conta simulada — números feitos à mão.
 *
 *   npx tsx lib/mtmfunded/__tests__/estatisticas.check.ts
 */
import assert from 'node:assert/strict'
import { estatisticasDaConta, type LinhaTrade } from '../simulado/estatisticas'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`✓ ${nome}`) }
const t = (x: Partial<LinhaTrade>): LinhaTrade => ({
  id: 'x', mae_id: null, symbol: 'XAUUSD', direcao: 'buy', volume: 1, pnl: 0, comissao: 0, swap: 0,
  aberta_em: '2026-09-14T09:00:00Z', fechada_em: '2026-09-14T10:00:00Z', origem: 'manual', comentario: null, risco_inicial: null, ...x,
})

const fechadas: LinhaTrade[] = [
  // trade A: parcial +300 e resto −400 → UMA perda de −100 (com 7 de comissão na raiz → −107)
  t({ id: 'a1', mae_id: 'A', pnl: 300, fechada_em: '2026-09-14T10:00:00Z' }),
  t({ id: 'A', pnl: -400, comissao: 7, fechada_em: '2026-09-14T11:00:00Z', risco_inicial: 500 }),
  // trade B: +200 com risco 100 → +2R
  t({ id: 'B', symbol: 'EURUSD', direcao: 'sell', pnl: 200, fechada_em: '2026-09-15T10:00:00Z', aberta_em: '2026-09-15T08:00:00Z', risco_inicial: 100, comentario: 'GoldKiller' }),
  // trade C: +100 sem SL
  t({ id: 'C', pnl: 100, fechada_em: '2026-09-15T12:00:00Z' }),
  // trade D: aberta com parcial já fechado — não conta nos KPIs
  t({ id: 'd1', mae_id: 'D', pnl: 50, fechada_em: '2026-09-15T13:00:00Z' }),
]
const e = estatisticasDaConta({ saldoInicial: 10000, equity: 10243, fechadas, abertasIds: new Set(['D']), agora: new Date('2026-09-15T14:00:00Z') })

caso('parciais pesam dentro da trade: A é uma perda', () => {
  assert.equal(e.trades, 3)
  assert.deepEqual([e.ganhas, e.perdidas], [2, 1])
  assert.equal(e.taxaAcertoPct, 66.7)
})
caso('fator de lucro, médias e expectativa', () => {
  assert.equal(e.lucroBruto, 300)
  assert.equal(e.perdaBruta, 107)
  assert.equal(e.fatorLucro, 2.8)
  assert.equal(e.mediaGanho, 150)
  assert.equal(e.mediaPerda, -107)
  assert.equal(e.expectativaUsd, 64.33)
})
caso('expectativa em R só com trades com risco inicial', () => {
  assert.equal(e.tradesComR, 2)
  assert.equal(e.expectativaR, 0.89) // (−107/500 + 200/100) / 2 = (−0,214 + 2) / 2
})
caso('melhor/pior e sequências', () => {
  assert.equal(e.melhorTrade?.id, 'B')
  assert.equal(e.piorTrade?.resultado, -107)
  assert.deepEqual([e.maxGanhasSeguidas, e.maxPerdidasSeguidas], [2, 1])
})
caso('agrupamentos por símbolo, estratégia e hora (UTC)', () => {
  assert.deepEqual(e.porSimbolo.map((g) => [g.chave, g.trades]), [['XAUUSD', 2], ['EURUSD', 1]])
  assert.ok(e.porEstrategia.some((g) => g.chave === 'GoldKiller' && g.resultado === 200))
  assert.equal(e.porHora.find((g) => g.chave === '08')?.trades, 1)
  assert.equal(e.porDiaSemana.length, 7)
})
caso('curva de saldo inclui o parcial da trade aberta e o drawdown sai do pico', () => {
  const ultimo = e.curva[e.curva.length - 1]
  assert.equal(ultimo.saldo, 10243) // 10000 + 300 − 407 + 200 + 100 + 50
  assert.equal(e.drawdownMaxUsd, 407) // pico 10300 → 9893
  assert.equal(e.trades + 0, 3)
  assert.equal(e.tradesPorDia, 1.5)
})
caso('conta sem trades não rebenta', () => {
  const v = estatisticasDaConta({ saldoInicial: 5000, equity: 5000, fechadas: [], abertasIds: new Set() })
  assert.deepEqual([v.trades, v.taxaAcertoPct, v.fatorLucro, v.drawdownMaxPct], [0, null, null, 0])
})
console.log(`\ntodos certos (${n})`)
