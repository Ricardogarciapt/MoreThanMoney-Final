/**
 * Negociações já feitas no gráfico do WebTrader (entradas, saídas, últimas 100).
 *
 *   npx tsx components/funded/__tests__/negocios-grafico.check.ts
 */
import assert from 'node:assert/strict'
import { marcasDosNegocios } from '../grafico-tipos'
import { negociosSimulados } from '../trader-contexto'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }
const T = Date.UTC(2026, 9, 23, 10, 7) / 1000

caso('entrada com seta do lado; saída com o resultado e a cor dele, na vela certa', () => {
  const m = marcasDosNegocios([
    { id: 'a', em: T, preco: 2000, direcao: 'buy', tipo: 'entrada' },
    { id: 'b', em: T + 600, preco: 2010, direcao: 'buy', tipo: 'saida', lucro: 10 },
    { id: 'c', em: T + 900, preco: 1990, direcao: 'sell', tipo: 'saida', lucro: -3.5 },
  ], 'M5')
  assert.deepEqual(m.map((x) => [x.shape, x.text, x.color]), [['arrowUp', 'B', '#089981'], ['circle', '+10.00', '#089981'], ['circle', '-3.50', '#F23645']])
  assert.equal(m[0].time, Date.UTC(2026, 9, 23, 10, 5) / 1000)
})

caso('fica só com as últimas 100, por ordem de tempo', () => {
  const muitos = Array.from({ length: 130 }, (_, i) => ({ id: String(i), em: T + (130 - i) * 60, preco: 1, direcao: 'sell' as const, tipo: 'entrada' as const }))
  const m = marcasDosNegocios(muitos, 'M1')
  assert.equal(m.length, 100)
  assert.ok(m.every((x, i) => i === 0 || x.time >= m[i - 1].time))
})

caso('histórico simulado: entrada em aberta_em, saída em fechada_em com o pnl', () => {
  const r = negociosSimulados([{ id: 7, symbol: 'XAUUSD', direcao: 'sell', aberta_em: '2026-10-23T10:00:00Z', fechada_em: '2026-10-23T11:00:00Z', preco_entrada: '2000', preco_fecho: '1990', pnl: '10' }])
  assert.deepEqual(r.map((x) => [x.tipo, x.direcao, x.preco, x.lucro ?? null]), [['entrada', 'sell', 2000, null], ['saida', 'sell', 1990, 10]])
  assert.deepEqual(negociosSimulados(null), [])
})

console.log(`\n${n} casos ok`)
