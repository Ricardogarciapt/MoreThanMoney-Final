/**
 * GUARDA: o resumo do fecho soma certo, avisa do que falta e o CSV abre no Excel português.
 *
 *   npx tsx lib/financas/fecho-mes.check.ts
 */
import assert from 'node:assert/strict'
import { csv, janelaDoMes, mesAnterior, resumir, resumoEmTexto } from './fecho-mes'

let n = 0
const caso = (nome: string, f: () => void) => {
  try {
    f()
    n++
  } catch (e) {
    console.error(`✗ ${nome}`)
    throw e
  }
}

const v = (valor: number, pais: string | null, reembolsado = 0) => ({ data: '2026-10-03', id: 'ch', valor, reembolsado, moeda: 'EUR', pais, cliente: null, descricao: null, fatura: null })

caso('mês anterior atravessa o ano', () => {
  assert.equal(mesAnterior(new Date('2027-01-02T07:00:00Z')), '2026-12')
  assert.equal(mesAnterior(new Date('2026-11-02T07:00:00Z')), '2026-10')
})
caso('janela do mês', () => {
  const j = janelaDoMes('2026-12')
  assert.equal(new Date(j.de * 1000).toISOString(), '2026-12-01T00:00:00.000Z')
  assert.equal(new Date(j.ate * 1000).toISOString(), '2027-01-01T00:00:00.000Z')
})
caso('soma vendas, reembolsos, taxas e transferências', () => {
  const r = resumir(
    '2026-10',
    [v(65, 'PT'), v(35, 'PT', 35), v(50, 'ES')],
    [
      { data: '', id: 't1', tipo: 'charge', valor: 65, taxa: 1.23, liquido: 63.77, moeda: 'EUR', descricao: null },
      { data: '', id: 't2', tipo: 'payout', valor: -100, taxa: 0, liquido: -100, moeda: 'EUR', descricao: null },
    ],
    [{ data: '2026-10-01', fornecedor: 'Vercel', descricao: null, valor: 20, iva: null, moeda: 'USD', categoria: 'infra', numero_fatura: 'X1', nif_fornecedor: null }],
  )
  assert.equal(r.vendas.porMoeda.EUR, 150)
  assert.equal(r.vendas.reembolsado.EUR, 35)
  assert.equal(r.stripe.taxas.EUR, 1.23)
  assert.equal(r.stripe.transferencias.EUR, 100)
  assert.equal(r.despesas.porMoeda.USD, 20)
  assert.ok(r.avisos.some((a) => a.includes('UE')))
  assert.ok(r.avisos.some((a) => a.includes('sem IVA')))
})
caso('avisa vendas sem país', () => {
  const r = resumir('2026-10', [v(10, null)], [], [])
  assert.ok(r.avisos[0].includes('sem país'))
})
caso('CSV com ; e vírgula decimal', () => {
  assert.equal(csv([{ a: 1.5, b: 'x;y' }]), 'a;b\n1,5;"x;y"\n')
})
caso('texto diz que o IB não entra', () => {
  assert.ok(resumoEmTexto(resumir('2026-10', [], [], [])).includes('PU Prime'))
})

console.log(`✓ fecho-mes: ${n} casos`)
