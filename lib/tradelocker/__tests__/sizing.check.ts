/** Símbolos e lotes na TradeLocker. Correr: npx tsx lib/tradelocker/__tests__/sizing.check.ts */
import assert from 'node:assert/strict'
import { ajustarQty, faixaPara, lotePorRisco, qtyParcial, regraDeLote, resolverInstrumento } from '../sizing'
import { loteTL } from '../executor'
import type { TLInstrumento } from '../client'

const inst = (id: number, name: string, trade = true): TLInstrumento => ({
  tradableInstrumentId: id,
  name,
  routes: trade ? [{ id: 900 + id, type: 'TRADE' }, { id: 100 + id, type: 'INFO' }] : [{ id: 100 + id, type: 'INFO' }],
})

// ── Símbolo: sufixos de corretora, aliases e rota TRADE ────────────────────────────────────
const lista = [inst(1, 'EURUSD'), inst(2, 'XAUUSD.r'), inst(3, 'US3000'), inst(4, 'US30.cash'), inst(5, 'GBPUSD', false)]
assert.equal(resolverInstrumento('XAUUSD', lista)?.instrumento.name, 'XAUUSD.r', 'ouro com sufixo')
assert.equal(resolverInstrumento('US30', lista)?.instrumento.name, 'US30.cash', 'US30 nunca casa com US3000')
assert.equal(resolverInstrumento('GBPUSD', lista), null, 'sem rota TRADE não é negociável')
assert.equal(resolverInstrumento('GOLD', [inst(7, 'XAUUSD')])?.instrumento.name, 'XAUUSD', 'alias GOLD → XAUUSD')
const r = resolverInstrumento('EURUSD', lista)!
assert.equal(r.routeTrade, 901)
assert.equal(r.routeInfo, 101)

// ── Regra de lote: lotStep em unidades (exemplo da documentação) ou em lotes ───────────────
assert.deepEqual(regraDeLote({ lotSize: 100000, lotStep: 1000, minLot: 0.01, maxLot: 1000 }), { min: 0.01, max: 1000, passo: 0.01 })
assert.deepEqual(regraDeLote({ lotSize: 100, lotStep: 0.01, minLot: 0.01, maxLot: 50 }), { min: 0.01, max: 50, passo: 0.01 })
assert.deepEqual(regraDeLote(null), { min: 0.01, max: 50, passo: 0.01 })

// Arredonda para BAIXO (nunca sobe o risco) e prende ao mínimo/máximo.
assert.equal(ajustarQty(0.279, { min: 0.01, max: 50, passo: 0.01 }), 0.27)
assert.equal(ajustarQty(0.004, { min: 0.01, max: 50, passo: 0.01 }), 0.01)
assert.equal(ajustarQty(80, { min: 0.01, max: 50, passo: 0.01 }), 50)
assert.equal(ajustarQty(1.26, { min: 0.1, max: 50, passo: 0.1 }), 1.2)
assert.equal(ajustarQty(0, { min: 0.01, max: 50, passo: 0.01 }), 0)

// ── Faixas de tick ─────────────────────────────────────────────────────────────────────────
assert.equal(faixaPara([{ leftRangeLimit: 0, tickSize: 0.01 }, { leftRangeLimit: 1000, tickSize: 0.1 }], 2500)?.tickSize, 0.1)
assert.equal(faixaPara([{ leftRangeLimit: 0, tickSize: 0.01 }, { leftRangeLimit: 1000, tickSize: 0.1 }], 5)?.tickSize, 0.01)

// ── Lote por risco com custo de tick da corretora ──────────────────────────────────────────
// EURUSD: 10.000 de equity, 1% = 100; stop a 20 pips (0.0020); tick 0.00001 custa 1 por lote
// → perda por lote = 200 ticks × 1 = 200 → 0,5 lote.
const eur = { lotSize: 100000, lotStep: 1000, minLot: 0.01, maxLot: 100, tickSize: [{ leftRangeLimit: 0, tickSize: 0.00001 }], tickCost: [{ leftRangeLimit: 0, tickCost: 1 }] }
assert.equal(Math.round(lotePorRisco({ equity: 10000, riscoPct: 1, entrada: 1.1, stop: 1.098, detalhe: eur })! * 1000) / 1000, 0.5)
// Ouro: 5.000, 1% = 50; stop 5$ ; tick 0.01 custa 1 por lote → 500 por lote → 0,1 lote.
const ouro = { lotSize: 100, lotStep: 0.01, minLot: 0.01, maxLot: 50, tickSize: [{ leftRangeLimit: 0, tickSize: 0.01 }], tickCost: [{ leftRangeLimit: 0, tickCost: 1 }] }
assert.equal(Math.round(lotePorRisco({ equity: 5000, riscoPct: 1, entrada: 2400, stop: 2395, detalhe: ouro })! * 100) / 100, 0.1)
assert.equal(lotePorRisco({ equity: 5000, riscoPct: 1, entrada: 2400, stop: 2395, detalhe: { lotSize: 100 } }), null, 'sem tick → null (usa heurística)')

// loteTL: usa o tick quando existe, cai na heurística do MT5 quando não, e ajusta ao passo.
const sinal = { symbol: 'XAUUSD', direction: 'buy' as const, entry: 2400, sl: 2395, tp: [2410], orderType: 'market' as const, raw: '' }
const ctxBase = { balance: 5000, equity: 5000, marketPrice: 2400, instrumento: null, detalhe: ouro }
assert.equal(loteTL({ lot_mode: 'risk_percent', lot_value: 1, max_risk_percent: 2 }, sinal, ctxBase), 0.1)
assert.equal(loteTL({ lot_mode: 'risk_percent', lot_value: 1, max_risk_percent: 2 }, sinal, { ...ctxBase, detalhe: null }), 0.1, 'heurística: contrato 100 no ouro')
// Lote fixo segue o arredondamento do MT5 (computeLotSize → 0,24) e depois o passo da corretora.
assert.equal(loteTL({ lot_mode: 'fixed', lot_value: 0.237, max_risk_percent: null }, sinal, ctxBase), 0.24)
assert.equal(loteTL({ lot_mode: 'fixed', lot_value: 0.25, max_risk_percent: null }, sinal, { ...ctxBase, detalhe: { minLot: 0.1, maxLot: 50, lotStep: 0.1 } }), 0.2)

// ── Parciais: fração da posição, sobra tem de ser válida ───────────────────────────────────
const regra = { min: 0.01, max: 50, passo: 0.01 }
assert.equal(qtyParcial(1, 0.33, regra), 0.33)
assert.equal(qtyParcial(0.01, 0.5, regra), 0, 'sobra abaixo do mínimo → fecha tudo')
assert.equal(qtyParcial(0.5, 1, regra), 0, 'fração 1 → 0 (fecha tudo)')

console.log('tradelocker sizing: OK')
