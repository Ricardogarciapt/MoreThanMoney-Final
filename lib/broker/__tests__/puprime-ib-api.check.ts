/**
 * `npx tsx lib/broker/__tests__/puprime-ib-api.check.ts`
 *
 * O cliente da API de IB está adormecido (não há chave ainda), por isso o que se testa é o que
 * tem de estar certo no dia em que alguém a ligar: o formato das datas, o facto de as credenciais
 * só virem do ambiente, e a tolerância ao invólucro do JSON.
 */

import assert from 'node:assert/strict'
import {
  construirCorpo,
  credenciaisIb,
  formatarInstante,
  ibApiDisponivel,
  normalizarContas,
} from '@/lib/broker/puprime-ib-api'

// `yyyy-MM-dd HH:mm:ss` em UTC — o único formato que a API aceita.
assert.equal(formatarInstante(new Date('2026-09-24T07:05:09Z')), '2026-09-24 07:05:09')
assert.equal(formatarInstante(new Date('2026-01-02T00:00:00Z')), '2026-01-02 00:00:00')

// As credenciais só podem vir do ambiente.
{
  const antes = { u: process.env.PUPRIME_IB_USER_ID, s: process.env.PUPRIME_IB_SECRET }
  delete process.env.PUPRIME_IB_USER_ID
  delete process.env.PUPRIME_IB_SECRET
  assert.equal(credenciaisIb(), null)
  assert.equal(ibApiDisponivel(), false, 'sem chave, o sistema tem de seguir sem ela')

  process.env.PUPRIME_IB_USER_ID = 'ib-1'
  assert.equal(credenciaisIb(), null, 'meia credencial não é credencial')
  process.env.PUPRIME_IB_SECRET = 'abc'
  assert.deepEqual(credenciaisIb(), { userId: 'ib-1', secret: 'abc' })

  const corpo = construirCorpo({ userId: 'ib-1', secret: 'abc' }, new Date('2026-09-01T00:00:00Z'), new Date('2026-09-24T23:59:59Z'))
  assert.deepEqual(corpo, {
    userId: 'ib-1',
    secret: 'abc',
    startTime: '2026-09-01 00:00:00',
    endTime: '2026-09-24 23:59:59',
  })

  if (antes.u) process.env.PUPRIME_IB_USER_ID = antes.u; else delete process.env.PUPRIME_IB_USER_ID
  if (antes.s) process.env.PUPRIME_IB_SECRET = antes.s; else delete process.env.PUPRIME_IB_SECRET
}

// O invólucro do JSON pode vir de três formas; nenhuma delas pode partir a leitura.
{
  const esperado = [{ uid: '100041585', conta: '100041585', plataforma: 'MT5', moeda: 'USD' }]
  const item = { uid: '100041585', accountNo: '100041585', platform: 'MT5', currency: 'USD' }
  assert.deepEqual(normalizarContas([item]), esperado)
  assert.deepEqual(normalizarContas({ data: [item] }), esperado)
  assert.deepEqual(normalizarContas({ code: 200, data: { list: [item] } }), esperado)

  assert.deepEqual(normalizarContas(null), [])
  assert.deepEqual(normalizarContas({ code: 500, msg: 'No access permission' }), [])
  assert.deepEqual(normalizarContas([{ accountNo: '1' }]), [], 'linha sem UID não conta')
}

console.log('✓ puprime-ib-api: datas, credenciais do ambiente e invólucro tolerante')
