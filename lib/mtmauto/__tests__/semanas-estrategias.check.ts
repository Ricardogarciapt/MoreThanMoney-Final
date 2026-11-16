/**
 * Semanas das estratégias e a regra do arquivo (3 semanas negativas).
 *
 *   npx tsx lib/mtmauto/__tests__/semanas-estrategias.check.ts
 */
import assert from 'node:assert/strict'
import { porSemana, segundaDe, segundasAte, semanaFechada, semanasParaArquivo, type Semana } from '../semanas-estrategias'

// Sábado 21/11/2026 09:30 UTC — a semana de 16/11 já fechou.
const sabado = new Date('2026-11-21T09:30:00Z')
assert.equal(segundaDe(sabado).toISOString().slice(0, 10), '2026-11-16')
assert.equal(segundaDe(new Date('2026-11-16T00:00:00Z')).toISOString().slice(0, 10), '2026-11-16')
assert.equal(segundaDe(new Date('2026-11-22T23:00:00Z')).toISOString().slice(0, 10), '2026-11-16', 'domingo pertence à semana de segunda')
const segs = segundasAte(sabado, 4)
assert.deepEqual(segs.map((s) => s.toISOString().slice(0, 10)), ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'])
assert.equal(semanaFechada(segs[3]!, sabado), true)
assert.equal(semanaFechada(segs[3]!, new Date('2026-11-20T23:59:00Z')), false, 'à sexta a semana ainda não fechou')

const semanas = porSemana([
  { quando: '2026-11-17T10:00:00Z', symbol: 'XAUUSD', pips: -30, resultado: -3, terminada: true },
  { quando: '2026-11-18T10:00:00Z', symbol: 'XAUUSD', pips: 12, resultado: 1, terminada: true },
  { quando: '2026-11-18T11:00:00Z', symbol: 'XAUUSD', pips: 5, resultado: 0.5, terminada: false },
  { quando: '2026-11-19T10:00:00Z', symbol: 'BTCUSD', pips: 300, resultado: 3, terminada: true },
  { quando: '2026-10-01T10:00:00Z', symbol: 'EURUSD', pips: 99, resultado: 9, terminada: true },
], segs, sabado)
const w = semanas[3]!
assert.equal(w.trades, 3, 'o parcial não conta como trade')
assert.equal(w.ganhas, 2)
assert.equal(w.perdas, 1)
assert.equal(w.pips, -13, 'parcial entra nos pips')
assert.equal(w.pontos, 300, 'cripto em pontos, à parte')
assert.equal(w.melhorPips, 12)
assert.equal(semanas.reduce((a, s) => a + s.trades, 0), 3, 'fora da janela fica de fora')

const s = (pips: number, trades = 5, fechada = true): Semana =>
  ({ inicio: 'x', trades, ganhas: 0, perdas: 0, pips, pontos: 0, melhorPips: 0, melhorSimbolo: null, fechada })
assert.ok(semanasParaArquivo([s(50), s(-1), s(-2), s(-3)]), 'três fechadas negativas seguidas → arquivo')
assert.equal(semanasParaArquivo([s(-1), s(-2), s(4), s(-3)]), null, 'uma positiva pelo meio quebra a sequência')
assert.equal(semanasParaArquivo([s(-1), s(-2), s(0, 0), s(-3)]), null, 'semana parada não é negativa e quebra a sequência')
assert.equal(semanasParaArquivo([s(-1), s(-2), s(-3, 5, false)]), null, 'a semana corrente (aberta) não conta')
assert.equal(semanasParaArquivo([s(-1), s(-2)]), null, 'menos de três semanas não chega')

console.log('semanas-estrategias: ok')
