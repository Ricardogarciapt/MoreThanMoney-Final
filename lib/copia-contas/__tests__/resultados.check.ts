/**
 * Resultado real das cópias vs mestre, em pips, e a «sombra B» (sair com a mestre). Números à mão.
 *
 *   npx tsx lib/copia-contas/__tests__/resultados.check.ts
 */
import assert from 'node:assert/strict'
import { compararComMestre, factosParaAuditor, fechosPorPosicao, pipsEntre, resumoPorConta, vigiarCopias } from '../resultados'

// deals: venda XAU 0,02 a 3865,00, parcial 0,01 a 3863,00 (motor), resto no SL a 3864,00
const deals = [
  { positionId: '1', symbol: 'XAUUSD.r', type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_IN', volume: 0.02, price: 3865, profit: 0, commission: -0.1, time: '2026-11-17T01:40:00Z' },
  { positionId: '1', symbol: 'XAUUSD.r', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_OUT', volume: 0.01, price: 3863, profit: 2, reason: 'DEAL_REASON_EXPERT', time: '2026-11-17T01:45:00Z' },
  { positionId: '1', symbol: 'XAUUSD.r', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_OUT', volume: 0.01, price: 3864, profit: 1, reason: 'DEAL_REASON_SL', time: '2026-11-17T01:53:10Z' },
  // posição 2 ainda aberta (só entrada) — não conta
  { positionId: '2', symbol: 'XAUUSD.r', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_IN', volume: 0.01, price: 3870, time: '2026-11-17T02:00:00Z' },
  { type: 'DEAL_TYPE_BALANCE', profit: 100, time: '2026-11-17T00:00:00Z' },
]
const f = fechosPorPosicao(deals)
assert.equal(f.size, 1)
const c = f.get('1')!
assert.equal(c.precoEntrada, 3865)
assert.equal(c.precoFecho, 3863.5)
assert.equal(c.lucro, 2.9)
assert.equal(c.motivo, 'sl')
assert.equal(c.fechadaEm, '2026-11-17T01:53:10Z')

// pips: ouro 0,1 · venda 3865 → 3863,5 = +15
assert.equal(pipsEntre('sell', 3865, 3863.5, 'XAUUSD'), 15)
assert.equal(pipsEntre('buy', 1.1, 1.1012, 'EURUSD'), 12)
assert.equal(pipsEntre('buy', null, 1, 'EURUSD'), null)

// mestre: venda 3865,42 → 3862,80 às 01:54:02 (+26,2 pips); a cópia entrou a 3865,00 (4,2 pips pior) e saiu 52 s antes
const k = compararComMestre({
  direcao: 'sell', simbolo: 'XAUUSD', copia: c,
  mestre: { precoEntrada: 3865.42, precoFecho: 3862.8, fechadaEm: '2026-11-17T01:54:02Z' },
})
assert.equal(k.pipsCopia, 15)
assert.equal(k.pipsMestre, 26.2)
assert.equal(k.divergenciaPips, -11.2)
assert.equal(k.custoEntradaPips, 4.2)
assert.equal(k.saiuAntes, true)
assert.equal(k.pipsSombraB, 22)

const r = resumoPorConta([
  { destino_chave: 'mt:a', pips_copia: 15, pips_mestre: 26.2, pips_sombra_b: 22, saiu_antes: true },
  { destino_chave: 'mt:a', pips_copia: -75, pips_mestre: -75, pips_sombra_b: -76, saiu_antes: false },
  { destino_chave: 'mt:b', pips_copia: 10, pips_mestre: 10, pips_sombra_b: 10, saiu_antes: false },
  { destino_chave: 'mt:b', pips_copia: null, pips_mestre: 10, pips_sombra_b: 10, saiu_antes: false },
])
assert.deepEqual(r[0], { conta: 'mt:a', n: 2, copia: -60, mestre: -48.8, sombraB: -54, saiuAntes: 1 })
assert.equal(r[1].n, 1)

// ── vigia ──
const agora = Date.parse('2026-11-17T12:00:00Z')
const mestres = new Map([
  ['m1', { estado: 'fechada', fechada_em: '2026-11-17T11:00:00Z' }], // fechou há 1 h
  ['m2', { estado: 'fechada', fechada_em: '2026-11-17T11:58:00Z' }], // há 2 min (dentro da tolerância)
  ['m3', { estado: 'aberta', fechada_em: null }],
])
const v = vigiarCopias({
  agora, mestres,
  copias: [
    { id: 'a', estado: 'aberta', destino_posicao_id: '10', client_id: null, origem_posicao_id: 'm1', destino_simbolo: 'XAUUSD.s', direcao: 'sell' }, // órfã
    { id: 'b', estado: 'aberta', destino_posicao_id: '11', client_id: null, origem_posicao_id: 'm2' }, // ainda dentro da tolerância
    { id: 'c', estado: 'aberta', destino_posicao_id: '1', client_id: null, origem_posicao_id: 'm1' }, // fechou na corretora
    { id: 'd', estado: 'erro', destino_posicao_id: null, client_id: 'cid-1', origem_posicao_id: 'm1' }, // encheu e fechou
    { id: 'e', estado: 'erro', destino_posicao_id: null, client_id: 'cid-9', origem_posicao_id: 'm3' }, // encheu e está aberta (mestre aberta)
    { id: 'f', estado: 'erro', destino_posicao_id: null, client_id: 'cid-x', origem_posicao_id: 'm1' }, // nunca existiu
    { id: 'g', estado: 'aberta', destino_posicao_id: '12', client_id: null, origem_posicao_id: 'm3' }, // normal
  ],
  abertasNoDestino: [{ id: '10', clientId: null }, { id: '11', clientId: null }, { id: '12', clientId: null }, { id: '20', clientId: 'cid-9' }],
  deals: deals.map((d) => (d.positionId === '1' && d.entryType === 'DEAL_ENTRY_IN' ? { ...d, clientId: 'cid-1' } : d)),
})
assert.deepEqual(v.orfas.map((o) => o.copiaId), ['a'])
assert.equal(v.orfas[0].positionId, '10')
assert.deepEqual(v.correcoes.map((x) => [x.copiaId, x.estado, x.destino_posicao_id ?? null]), [
  ['c', 'fechada', null],
  ['d', 'fechada', '1'],
  ['e', 'aberta', '20'],
])

// ── factos do auditor ──
const fa = factosParaAuditor([
  { destino_chave: 'mt:a', simbolo: 'XAUUSD', pips_copia: 15, pips_mestre: 26.2, pips_sombra_b: 22, custo_entrada_pips: 4.2, saiu_antes: true, motivo: 'sl', fechada_em: '2026-11-17T01:53:10Z' },
  { destino_chave: 'mt:a', simbolo: 'XAUUSD', pips_copia: -75, pips_mestre: -75, pips_sombra_b: -76, custo_entrada_pips: 1, saiu_antes: false, motivo: 'sl', fechada_em: '2026-11-17T14:10:00Z' },
  { destino_chave: 'mt:b', simbolo: 'XAUUSD', pips_copia: null, pips_mestre: 3, pips_sombra_b: 3, custo_entrada_pips: null, saiu_antes: false, motivo: 'tp', fechada_em: null },
])
assert.equal(fa.contas.length, 1)
assert.deepEqual({ ...fa.contas[0], piorHorasUtc: undefined }, { conta: 'mt:a', n: 2, pipsCopia: -60, pipsMestre: -48.8, pipsSairComMestre: -54, saiuAntesDaMestre: 1, custoEntradaMedioPips: 2.6, motivosFecho: { sl: 2 }, piorHorasUtc: undefined })
assert.deepEqual(fa.contas[0].piorHorasUtc[0], { hora: 1, n: 1, divergenciaPips: -11.2 })

console.log('copia-contas/resultados: fechos por posição, pips, divergência, sombra B, vigia das cópias vivas ✓')
