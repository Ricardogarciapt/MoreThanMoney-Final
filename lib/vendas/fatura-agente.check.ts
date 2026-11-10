/**
 * GUARDA: o primeiro pagamento com valor de uma subscrição leva o código do agente; os outros não.
 *
 *   npx tsx lib/vendas/fatura-agente.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { codigoParaFatura, metadataDaSubscricaoNaFatura, subscricaoDaFatura } from './fatura-agente'

let n = 0
const caso = (nome: string, f: () => void) => {
  try {
    f()
    n++
  } catch (e) {
    console.error('✗', nome)
    throw e
  }
}

caso('conversão do trial: código da subscrição ganha', () => {
  const r = codigoParaFatura({ pagoCents: 6500, pagamentosAnterioresComValor: 0, codigoNaSubscricao: 'ag-setter', codigoDoCheckoutGratis: 'AG-EMAIL' })
  assert.deepEqual([r.codigo, r.origem], ['AG-SETTER', 'metadata_subscricao'])
})
caso('subscrição antiga sem metadata: herda do checkout de 0 €', () => {
  const r = codigoParaFatura({ pagoCents: 6500, pagamentosAnterioresComValor: 0, codigoDoCheckoutGratis: 'CEO-MTM' })
  assert.deepEqual([r.codigo, r.origem], ['CEO-MTM', 'checkout_do_trial'])
})
caso('segundo pagamento com valor: sem código (a permanência não é do link)', () => {
  const r = codigoParaFatura({ pagoCents: 6500, pagamentosAnterioresComValor: 1, codigoNaSubscricao: 'AG-SETTER' })
  assert.equal(r.codigo, null)
  assert.equal(r.motivo, 'nao_e_o_primeiro_pagamento')
})
caso('fatura de 0 € (cupão 100 %) não leva código', () => {
  assert.equal(codigoParaFatura({ pagoCents: 0, pagamentosAnterioresComValor: 0, codigoNaSubscricao: 'AG-SETTER' }).motivo, 'sem_valor')
})
caso('um cupão de desconto no lugar do código não credita ninguém', () => {
  assert.equal(codigoParaFatura({ pagoCents: 6500, pagamentosAnterioresComValor: 0, codigoNaSubscricao: 'BLACKFRIDAY50' }).codigo, null)
})
caso('id e metadata da subscrição nas duas formas da API', () => {
  assert.equal(subscricaoDaFatura({ subscription: 'sub_1' }), 'sub_1')
  assert.equal(subscricaoDaFatura({ parent: { subscription_details: { subscription: 'sub_2' } } }), 'sub_2')
  assert.equal(metadataDaSubscricaoNaFatura({ subscription_details: { metadata: { agente_codigo: 'AG-X1' } } }).agente_codigo, 'AG-X1')
  assert.equal(metadataDaSubscricaoNaFatura({ parent: { subscription_details: { metadata: { agente_codigo: 'AG-X2' } } } }).agente_codigo, 'AG-X2')
})
caso('os checkouts de subscrição escrevem o código na subscrição', () => {
  for (const p of [
    'app/api/stripe/create-checkout-session/route.ts',
    'app/api/stripe/register-checkout/route.ts',
    'app/api/stripe/oauth-register-checkout/route.ts',
    'app/api/stripe/scanner-checkout/route.ts',
  ]) {
    assert.match(readFileSync(p, 'utf8'), /subscription_data[\s\S]{0,200}agente_codigo/, p)
  }
})
caso('o webhook já não grava renovações com agenteCodigo: null fixo', () => {
  const w = readFileSync('app/api/stripe/webhook/route.ts', 'utf8')
  assert.ok(!/tipo: 'renovacao',[\s\S]{0,400}agenteCodigo: null,/.test(w))
  assert.match(w, /codigoDaFaturaSemFalhar\(invoice\)/)
})
caso('a reconciliação diária está agendada', () => {
  assert.match(readFileSync('vercel.json', 'utf8'), /\/api\/cron\/vendas-reconciliar/)
})
console.log(`✓ fatura-agente: ${n} casos`)
