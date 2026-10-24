/**
 * Tipos de gráfico do WebTrader (velas, barras, linha, área).
 *
 *   npx tsx components/funded/__tests__/tipos-grafico.check.ts
 */
import assert from 'node:assert/strict'
import { TIPOS_GRAFICO, pontoDoTipo } from '../grafico-tipos'

const v = { time: 100, open: 1, high: 3, low: 0.5, close: 2 }
assert.deepEqual(TIPOS_GRAFICO.map(([k]) => k), ['velas', 'barras', 'linha', 'area'])
assert.deepEqual(pontoDoTipo('barras', v), v)
assert.deepEqual(pontoDoTipo('linha', v), { time: 100, value: 2 })
assert.deepEqual(pontoDoTipo('area', v), { time: 100, value: 2 })
console.log('  ok  barras levam OHLC; linha e área o fecho\n\n1 caso ok')
