/**
 * GUARDA DO DCA SEMANAL das contas de portefólio.
 *   npx tsx lib/portfolios/dca-semanal.check.ts
 */
import assert from 'node:assert/strict'
import { PLANOS_DCA, carteira, comprasDaSemana, liquidez, totalDoPlano, ultimaSextaFechada, valorDeMercado } from './dca-semanal'

let falhas = 0
function teste(nome: string, f: () => void) {
  try { f(); console.log('ok  ', nome) } catch (e) { falhas++; console.error('FALHA', nome, e) }
}

const cripto = PLANOS_DCA.find((p) => p.login === 'PORTF-CRIPTO')!
const etf = PLANOS_DCA.find((p) => p.login === 'PORTF-ETF')!

teste('totais do plano: ETF 50 $, Cripto 15,38 $', () => {
  assert.equal(totalDoPlano(etf), 50)
  assert.equal(totalDoPlano(cripto), 15.38)
})

teste('sábado → a sexta de ontem; sexta → a sexta anterior (ainda não fechou)', () => {
  assert.equal(ultimaSextaFechada(new Date('2026-11-07T06:00:00Z')), '2026-11-06')
  assert.equal(ultimaSextaFechada(new Date('2026-11-06T12:00:00Z')), '2026-10-30')
  assert.equal(ultimaSextaFechada(new Date('2026-11-05T20:00:00Z')), '2026-10-30')
})

teste('falta uma cotação → não se grava a semana', () => {
  assert.equal(comprasDaSemana(cripto, { XRPUSDT: 1.25, LINKUSDT: 11 }), null)
})

teste('compras: unidades = valor / preço', () => {
  const c = comprasDaSemana(cripto, { XRPUSDT: 1.2567, LINKUSDT: 11.465, HBARUSDT: 0.07231, ONDOUSDT: 0.4161, AEROUSDT: 0.6187 })!
  assert.equal(c.length, 5)
  assert.ok(Math.abs(c[0].unidades - 5.77 / 1.2567) < 1e-9)
})

teste('carteira e liquidez: as vendas da limpeza ficam em caixa', () => {
  const movs = [
    { symbol: 'ADA', tipo: 'compra', unidades: 10, valor: 5 },
    { symbol: 'ADA', tipo: 'venda', unidades: 10, valor: 7 },
    { symbol: 'XRP', tipo: 'compra', unidades: 4, valor: 4 },
  ]
  const h = carteira(movs)
  assert.deepEqual(h, { XRP: 4 })
  assert.equal(liquidez(movs), 7)
  assert.equal(valorDeMercado(h, { XRP: 2 }, 7), 15)
  assert.equal(valorDeMercado(h, {}, 7), null)
})

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1) }
console.log('dca-semanal: tudo certo')
