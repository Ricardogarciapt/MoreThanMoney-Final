/**
 * AUDITORIA DE CONTAS REAIS (250) — o histórico cru da corretora vira as mesmas trades da auditoria.
 *
 *  · MT5: entrada + duas saídas = UMA trade com duas partes; comissão da entrada fica na mãe;
 *  · posição aberta antes da janela (só a saída) entra, com a direcção contrária à do deal de saída;
 *  · depósito (DEAL_TYPE_BALANCE) é ajuste, não trade; posição ainda aberta não entra;
 *  · TradeLocker: sem lucro, mas pips e ganha/perde por pips (`criterio: 'movimento'`).
 *
 * Correr: npx tsx lib/mtmfunded/__tests__/auditoria-real.check.ts
 */
import assert from 'node:assert/strict'
import { agruparTrades, metricasAuditoria } from '../auditoria'
import { historicoDasOrdensTL, historicoDosDealsMt5 } from '../auditoria-real'

const h = historicoDosDealsMt5([
  { id: 'd0', type: 'DEAL_TYPE_BALANCE', profit: 1000, time: '2026-11-01T08:00:00Z' },
  { id: 'd1', positionId: 'P1', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_IN', symbol: 'XAUUSD', volume: 0.2, price: 2000, commission: -1, time: '2026-11-02T10:00:00Z' },
  { id: 'd2', positionId: 'P1', type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_OUT', symbol: 'XAUUSD', volume: 0.1, price: 2003, profit: 30, commission: -0.5, time: '2026-11-02T11:00:00Z' },
  { id: 'd3', positionId: 'P1', type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_OUT', symbol: 'XAUUSD', volume: 0.1, price: 2001, profit: 10, commission: -0.5, swap: -0.2, time: '2026-11-02T12:00:00Z' },
  // Aberta antes da janela: só a saída (BUY fecha uma venda).
  { id: 'd4', positionId: 'P0', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_OUT', symbol: 'EURUSD', volume: 1, price: 1.1, profit: -50, time: '2026-11-01T09:00:00Z' },
  // Ainda aberta.
  { id: 'd5', positionId: 'P2', type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_IN', symbol: 'EURUSD', volume: 1, price: 1.1, commission: -3, time: '2026-11-03T09:00:00Z' },
])
assert.equal(h.ajustes.length, 1)
assert.equal(h.ajustes[0].delta, 1000)
assert.equal(h.pernas.length, 3)
assert.equal(Math.round(h.variacaoSaldo * 100) / 100, 1000 - 1 + 29.5 + 9.3 - 50 - 3)
const t = agruparTrades(h.pernas)
assert.equal(t.length, 2)
const ouro = t.find((x) => x.symbol === 'XAUUSD')!
assert.equal(ouro.partes, 2)
assert.equal(ouro.direcao, 'buy')
assert.equal(ouro.resultado, 37.8)
assert.equal(ouro.movimento, 20) // (30 + 10 pips) / 2 lotes iguais
assert.equal(ouro.r, null)
const eur = t.find((x) => x.symbol === 'EURUSD')!
assert.equal(eur.direcao, 'sell')
assert.equal(eur.movimento, null) // sem preço de entrada na janela
const m = metricasAuditoria(t, { saldoInicial: 500, ajustes: h.ajustes })
assert.equal(m.taxaAcertoPct, 50) // sem R: conta sobre todas as trades

const tl = historicoDasOrdensTL([
  { id: 'o1', tradableInstrumentId: 7, side: 'buy', qty: 1, status: 'filled', price: null, stopPrice: null, avgPrice: 1.1, filledQty: 1, positionId: 'X', createdDate: 1, lastModified: 1 },
  { id: 'o2', tradableInstrumentId: 7, side: 'sell', qty: 1, status: 'filled', price: null, stopPrice: null, avgPrice: 1.1025, filledQty: 1, positionId: 'X', createdDate: 2, lastModified: 2 },
  { id: 'o3', tradableInstrumentId: 7, side: 'sell', qty: 1, status: 'filled', price: null, stopPrice: null, avgPrice: 1.1, filledQty: 1, positionId: 'Y', createdDate: 3, lastModified: 3 },
  { id: 'o4', tradableInstrumentId: 7, side: 'buy', qty: 1, status: 'filled', price: null, stopPrice: null, avgPrice: 1.101, filledQty: 1, positionId: 'Y', createdDate: 4, lastModified: 4 },
  { id: 'o5', tradableInstrumentId: 7, side: 'buy', qty: 1, status: 'cancelled', price: 1.05, stopPrice: null, avgPrice: null, filledQty: 0, positionId: null, createdDate: 5, lastModified: 5 },
], new Map([[7, 'EURUSD']]))
assert.equal(tl.comValor, false)
const tt = agruparTrades(tl.pernas)
assert.deepEqual(tt.map((x) => x.movimento), [25, -10])
const mt = metricasAuditoria(tt, { saldoInicial: 0, criterio: 'movimento' })
assert.equal(mt.ganhas, 1)
assert.equal(mt.perdidas, 1)
assert.equal(mt.pips, 15)

console.log('auditoria-real.check: ok')
