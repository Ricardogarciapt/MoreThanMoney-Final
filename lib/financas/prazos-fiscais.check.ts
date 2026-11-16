/**
 * GUARDA: o calendário fiscal não salta prazos nem os põe ao fim de semana.
 *
 *   npx tsx lib/financas/prazos-fiscais.check.ts
 */
import assert from 'node:assert/strict'
import { diaUtil, prazosDoAno, proximosPrazos, prazosParaAvisar } from './prazos-fiscais'

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

caso('sábado passa para segunda', () => {
  // 5/12/2026 é sábado
  assert.equal(diaUtil(2026, 12, 5), '2026-12-07')
})
caso('domingo passa para segunda', () => {
  // 20/9/2026 é domingo
  assert.equal(diaUtil(2026, 9, 20), '2026-09-21')
})
caso('dia útil fica', () => {
  assert.equal(diaUtil(2026, 11, 5), '2026-11-05')
})
caso('SAF-T todos os meses', () => {
  const p = prazosDoAno(2026, { entidade: 'empresa', iva: 'trimestral' })
  assert.equal(p.filter((x) => x.id.startsWith('saft-')).length, 12)
})
caso('IVA trimestral só em fev/mai/ago/nov', () => {
  const p = prazosDoAno(2026, { entidade: 'empresa', iva: 'trimestral' }).filter((x) => /^iva-\d/.test(x.id))
  assert.deepEqual(p.map((x) => x.data.slice(5, 7)), ['02', '05', '08', '11'])
})
caso('IVA mensal 12 declarações', () => {
  const p = prazosDoAno(2026, { entidade: 'empresa', iva: 'mensal' }).filter((x) => /^iva-\d/.test(x.id))
  assert.equal(p.length, 12)
})
caso('empresa não tem IRS, ENI não tem IRC', () => {
  const emp = prazosDoAno(2026, { entidade: 'empresa', iva: 'trimestral' })
  const eni = prazosDoAno(2026, { entidade: 'eni', iva: 'trimestral' })
  assert.ok(!emp.some((x) => x.id.startsWith('irs-')))
  assert.ok(!eni.some((x) => x.id.startsWith('irc-')))
})
caso('regime por confirmar mostra as duas hipóteses', () => {
  const p = prazosDoAno(2026, { entidade: null, iva: null })
  assert.ok(p.some((x) => x.id.startsWith('irs-')) && p.some((x) => x.id.startsWith('irc-')))
})
caso('próximos prazos atravessam o ano', () => {
  const p = proximosPrazos('2026-12-20', { entidade: 'empresa', iva: 'trimestral' }, 30)
  assert.ok(p.some((x) => x.id === 'saft-2027-1'))
  assert.ok(p.some((x) => x.id === 'assinatura-qualificada-2027'))
})
caso('avisos a 7/3/1/0 dias', () => {
  // SAF-T de dezembro 2026 é 2026-12-07 (dia 5 é sábado) → a 7 dias é 30/11
  const a = prazosParaAvisar('2026-11-30', { entidade: 'empresa', iva: 'trimestral' })
  assert.ok(a.some((x) => x.id === 'saft-2026-12' && x.faltam === 7))
})

console.log(`✓ prazos-fiscais: ${n} casos`)
