/**
 * MTM Auto Edge pelo pv-relay — regras puras (lib/mestres/edge-pv.ts).
 * Correr: npx tsx lib/mestres/__tests__/edge-pv.check.ts
 */
import assert from 'node:assert/strict'
import { decidirPedidoPv, estrategiaDoTraderPv, lerTopTraders, SLUG_EDGE, tradersDaEdge, type EntradaDecisaoPv } from '../edge-pv'

const agora = new Date('2026-10-26T10:00:00Z')
const top = lerTopTraders({ top: [{ trader: '@ZATA', pips: 145, trades: 3 }, { trader: 'fxedge', pips: 90, trades: 3 }, { trader: 'kingfkg', pips: 10, trades: 4 }], janelaDias: 14, em: '2026-10-26T09:30:00Z' })

// ranking lido e normalizado; só os 2 primeiros
assert.deepEqual(tradersDaEdge(top, agora), ['zata', 'fxedge'])
assert.equal(estrategiaDoTraderPv('FXEDGE', top, agora), SLUG_EDGE)
assert.equal(estrategiaDoTraderPv('kingfkg', top, agora), null, 'o 3.º não entra')
assert.equal(estrategiaDoTraderPv('zata', top, new Date('2026-10-28T10:00:00Z')), null, 'ranking com > 36 h = relay morto → ninguém executa')
assert.equal(lerTopTraders({ top: ['a b'], em: 'x' }), null, 'sem data não há ranking')
assert.deepEqual(lerTopTraders({ top: ['xy', 'XY', 'bad name!'], em: agora.toISOString() })?.top.map((t) => t.trader), ['xy'])
assert.equal(tradersDaEdge(null, agora).length, 0)

const base: EntradaDecisaoPv = {
  kind: 'entry_hit', estrategia: SLUG_EDGE, viva: true, agora, dataMensagem: new Date(agora.getTime() - 20_000),
  repetido: false, rajada: false, setupVistoAoVivo: false, entrada: 4300, sl: 4290, preco: null,
}
assert.equal(decidirPedidoPv(base).accao, 'executar')
assert.equal(decidirPedidoPv({ ...base, estrategia: null, viva: false }).accao, 'ignorar', 'trader fora do top não executa')
assert.equal(decidirPedidoPv({ ...base, dataMensagem: new Date(agora.getTime() - 200_000) }).accao, 'atrasado')
assert.equal(decidirPedidoPv({ ...base, repetido: true }).accao, 'repetido')
assert.equal(decidirPedidoPv({ ...base, kind: 'close' }).accao, 'seguir')
assert.equal(decidirPedidoPv({ ...base, kind: 'close', estrategia: null }).accao, 'ignorar', 'seguimento de entrada que não abriu')
console.log('edge-pv: OK (top 2 dinâmico, ranking velho fecha a porta, frescura e duplicados)')
