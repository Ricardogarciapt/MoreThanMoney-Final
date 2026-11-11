/**
 * AUDITORIA PÚBLICA (249) — o que não pode falhar.
 *
 *  · as parciais somam-se na trade-mãe (uma trade, um R, pips ponderados pelo lote);
 *  · pips: 0,1 no ouro, 0,01 no JPY, 0,0001 no resto do forex; índices/cripto em pontos;
 *  · a trade fica ligada ao sinal (estratégia, latência, desvio da entrada);
 *  · um ajuste de capital NÃO entra no retorno ponderado nem no drawdown;
 *  · risco de ruína determinista (mesma semente → mesmo número) e nulo com amostra < 10;
 *  · o token tem 24 caracteres sem ambíguos.
 *
 * Correr: npx tsx lib/mtmfunded/__tests__/auditoria.check.ts
 */
import assert from 'node:assert/strict'
import { agruparTrades, gerarTokenAuditoria, metricasAuditoria, riscoDeRuina, tamanhoPip, type PernaAuditoria } from '../auditoria'

assert.deepEqual(tamanhoPip('XAUUSD'), { pip: 0.1, unidade: 'pips' })
assert.deepEqual(tamanhoPip('GBPJPY'), { pip: 0.01, unidade: 'pips' })
assert.deepEqual(tamanhoPip('EURUSD'), { pip: 0.0001, unidade: 'pips' })
assert.deepEqual(tamanhoPip('NAS100'), { pip: 1, unidade: 'pts' })
assert.deepEqual(tamanhoPip('BTCUSD'), { pip: 1, unidade: 'pts' })

const pernas: PernaAuditoria[] = [
  // Compra de ouro: 1 lote, parcial de 0,5 a +5 $ (50 pips) e resto a +2 $ (20 pips). Risco 100 $.
  { id: 'a', mae_id: null, symbol: 'XAUUSD', direcao: 'buy', volume: 0.5, preco_entrada: 2000, preco_fecho: 2002, pnl: 100, aberta_em: '2026-11-02T10:00:05Z', fechada_em: '2026-11-02T12:00:00Z', origem: 'estrategia', risco_inicial: 100 },
  { id: 'a1', mae_id: 'a', symbol: 'XAUUSD', direcao: 'buy', volume: 0.5, preco_entrada: 2000, preco_fecho: 2005, pnl: 250, aberta_em: '2026-11-02T10:00:05Z', fechada_em: '2026-11-02T11:00:00Z', origem: 'estrategia' },
  // Venda EURUSD perdida: −1 R, −20 pips.
  { id: 'b', mae_id: null, symbol: 'EURUSD', direcao: 'sell', volume: 1, preco_entrada: 1.1, preco_fecho: 1.102, pnl: -200, comissao: 0, aberta_em: '2026-11-03T09:00:00Z', fechada_em: '2026-11-03T10:00:00Z', origem: 'manual', risco_inicial: 200 },
]
const trades = agruparTrades(pernas, [{ funded_position_id: 'a', estrategia: 'mtm-auto-premium-ii', created_at: '2026-11-02T10:00:00Z', entrada: 1999.8 }])
assert.equal(trades.length, 2)
const [ouro, eur] = trades
assert.equal(ouro.partes, 2)
assert.equal(ouro.resultado, 350)
assert.equal(ouro.r, 3.5)
assert.equal(ouro.movimento, 35) // (0,5×50 + 0,5×20) / 1
assert.equal(ouro.estrategia, 'mtm-auto-premium-ii')
assert.equal(ouro.latenciaSeg, 5)
assert.equal(ouro.desvioEntrada, 2) // comprou 0,2 $ acima do sinal = 2 pips
assert.equal(ouro.fechadaEm, '2026-11-02T12:00:00Z')
assert.equal(eur.r, -1)
assert.equal(eur.movimento, -20)
assert.equal(eur.origem, 'manual')
const pend = agruparTrades([pernas[2]], [{ funded_position_id: 'b', estrategia: 'premium-ouro', created_at: '2026-11-03T08:00:00Z', funded_order_id: 'o1' }])
assert.equal(pend[0].ordemPendente, true)
assert.equal(pend[0].latenciaSeg, null)

// Ajuste de +10 000 $ entre as duas trades: não é ganho nem drawdown.
const semAjuste = metricasAuditoria(trades, { saldoInicial: 10000 })
const comAjuste = metricasAuditoria(trades, { saldoInicial: 10000, ajustes: [{ em: '2026-11-02T20:00:00Z', delta: 10000 }] })
assert.equal(semAjuste.rTotal, 2.5)
assert.equal(semAjuste.pips, 15)
assert.equal(semAjuste.taxaAcertoPct, 50)
assert.equal(semAjuste.drawdownMaxR, 1)
assert.equal(semAjuste.retornoPonderadoPct, 1.5) // 1,035 × (1 − 200/10 350) − 1
assert.equal(comAjuste.retornoPonderadoPct, 2.48) // 1,035 × (1 − 200/20 350) − 1: o ajuste só muda a base
assert.ok(comAjuste.drawdownMaxPct < 1)
assert.deepEqual(comAjuste.ajustes, { quantidade: 1, total: 10000 })
assert.equal(semAjuste.porMes[0].mes, '2026-11')
assert.equal(semAjuste.porEstrategia.find((g) => g.chave === 'MTM Auto Premium II')?.trades, 1)

// Risco de ruína.
assert.equal(riscoDeRuina([1, -1], { riscoPct: 1, limitePct: 30 }), null)
const seq = Array.from({ length: 50 }, (_, i) => (i % 3 === 0 ? -1 : 0.3))
const r1 = riscoDeRuina(seq, { riscoPct: 2, limitePct: 30 })
assert.equal(r1, riscoDeRuina(seq, { riscoPct: 2, limitePct: 30 }))
assert.ok(r1 != null && r1 > 0.5) // expectativa negativa a 2 %: ruína quase certa
assert.equal(riscoDeRuina(Array(20).fill(0.5), { riscoPct: 1, limitePct: 30 }), 0)

// Token.
const tok = gerarTokenAuditoria((n) => Uint8Array.from({ length: n }, (_, i) => i * 37))
assert.equal(tok.length, 24)
assert.match(tok, /^[A-HJ-NP-Za-km-z2-9]+$/)

console.log('auditoria.check: ok')
