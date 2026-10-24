/**
 * Grupos do seletor de contas do WebTrader.
 *
 *   npx tsx lib/webtrader/__tests__/grupos-contas.check.ts
 */
import assert from 'node:assert/strict'
import { agruparContas, grupoDaConta } from '../grupos-contas'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }
const tl = (id: string, servidor: string) => ({ id, real: { plataforma: 'tradelocker', servidor, rotulo: null } })

caso('título por plataforma e servidor; MT4 diz-se MT4; sem servidor fica só a plataforma', () => {
  assert.equal(grupoDaConta({ id: 'a' }).titulo, 'MTM Funded')
  assert.equal(grupoDaConta(tl('b', 'HEROFX')).titulo, 'TradeLocker · HEROFX')
  assert.equal(grupoDaConta({ id: 'c', real: { plataforma: 'mt5', servidor: 'ICMarkets-Live', rotulo: null, versao: 'mt4' } }).titulo, 'MT4 · ICMarkets-Live')
  assert.equal(grupoDaConta({ id: 'd', real: { plataforma: 'mt5', servidor: null, rotulo: null } }).titulo, 'MT5')
})

caso('a ordem da pessoa manda: grupos pela primeira conta, contas na ordem dela', () => {
  const g = agruparContas([tl('1', 'HEROFX'), { id: '2' }, tl('3', 'herofx'), { id: '4' }, tl('5', 'Other')])
  assert.deepEqual(g.map((x) => x.titulo), ['TradeLocker · HEROFX', 'MTM Funded', 'TradeLocker · Other'])
  assert.deepEqual(g.map((x) => x.contas.map((c) => c.id)), [['1', '3'], ['2', '4'], ['5']])
})

caso('lista vazia dá zero grupos', () => assert.deepEqual(agruparContas([]), []))

console.log(`\n${n} casos ok`)
