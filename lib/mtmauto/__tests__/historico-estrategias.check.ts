/**
 * Histórico do separador MTM Auto: uma trade por posição e a estratégia de cada cópia.
 *
 *   npx tsx lib/mtmauto/__tests__/historico-estrategias.check.ts
 */
import assert from 'node:assert/strict'
import { estrategiaDaPosicao, resumoPorEstrategia, tradesDosNegocios } from '../historico-estrategias'

const pip = (s: string) => (s.startsWith('XAU') ? 0.1 : 0.0001)

// Uma compra de 0,03 em XAUUSD a 4000 que sai 1/3 a 4005, 1/3 a 4010 e o resto a 4000 (BE).
const deals = [
  { positionId: 'P1', symbol: 'XAUUSD', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_IN', volume: 0.03, price: 4000, profit: 0, commission: -0.2, time: '2026-11-10T08:00:00Z' },
  { positionId: 'P1', symbol: 'XAUUSD', type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_OUT', volume: 0.01, price: 4005, profit: 5, time: '2026-11-10T09:00:00Z' },
  { positionId: 'P1', symbol: 'XAUUSD', type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_OUT', volume: 0.01, price: 4010, profit: 10, time: '2026-11-10T10:00:00Z' },
  { positionId: 'P1', symbol: 'XAUUSD', type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_OUT', volume: 0.01, price: 4000, profit: 0, time: '2026-11-10T11:00:00Z' },
  // Uma venda de EURUSD com só um parcial feito: o resto continua aberto.
  { positionId: 'P2', symbol: 'EURUSD', type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_IN', volume: 0.02, price: 1.1, time: '2026-11-11T08:00:00Z' },
  { positionId: 'P2', symbol: 'EURUSD', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_OUT', volume: 0.01, price: 1.098, profit: 2, time: '2026-11-11T09:00:00Z' },
  // Depósitos não são trades.
  { id: 'D1', type: 'DEAL_TYPE_BALANCE', profit: 1000, time: '2026-11-09T08:00:00Z' },
  // Uma posição sem fecho na janela não dá linha.
  { positionId: 'P3', symbol: 'EURUSD', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_IN', volume: 0.01, price: 1.1, time: '2026-11-12T08:00:00Z' },
]

const trades = tradesDosNegocios(deals, pip)
assert.equal(trades.length, 2, 'três fechos da mesma posição são UMA trade; depósito e posição aberta ficam fora')
const p1 = trades.find((t) => t.positionId === 'P1')!
assert.equal(p1.direcao, 'buy')
assert.equal(p1.terminada, true)
assert.equal(p1.resultado, 14.8, 'resultado líquido de todos os negócios, comissão incluída')
assert.equal(p1.pips, 50, 'pips pesados pelo volume: (50 + 100 + 0) / 3')
assert.equal(p1.quando, '2026-11-10T11:00:00.000Z')
const p2 = trades.find((t) => t.positionId === 'P2')!
assert.equal(p2.direcao, 'sell')
assert.equal(p2.terminada, false, 'parcial com o resto aberto não é trade terminada')
assert.equal(p2.pips, 20)

// A estratégia casa pela posição E pela conta de destino.
const copias = [
  { destinoPosicaoId: 'P1', destinoRef: 'site:a', estrategia: 'mtm-auto-premium-ii', tipoRota: 'estrategia' },
  { destinoPosicaoId: 'P1', destinoRef: 'auto:b', estrategia: 'aurum-flow', tipoRota: 't2t' },
]
assert.deepEqual(estrategiaDaPosicao(copias, 'site:a', 'P1'), { estrategia: 'mtm-auto-premium-ii', t2t: false })
assert.deepEqual(estrategiaDaPosicao(copias, 'auto:b', 'P1'), { estrategia: 'aurum-flow', t2t: true })
assert.equal(estrategiaDaPosicao(copias, 'site:x', 'P1'), null, 'o mesmo número de posição noutra conta não é a mesma trade')

const resumo = resumoPorEstrategia([
  { estrategia: 'Premium II', pips: 50, resultado: 14.8 },
  { estrategia: 'Premium II', pips: -20, resultado: -6 },
  { estrategia: 'Premium II', pips: 10, resultado: 3, contaParaTaxa: false },
  { estrategia: null, pips: 5, resultado: 1 },
])
assert.equal(resumo.length, 1)
assert.deepEqual(resumo[0], { estrategia: 'Premium II', trades: 2, ganhas: 1, pips: 40, winrate: 50 })

console.log('historico-estrategias: ok')
