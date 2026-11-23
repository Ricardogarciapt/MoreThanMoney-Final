import assert from 'node:assert/strict'
import { quemFecha, ehAltoValor, ALTO_VALOR_EUR, regrasDeFechoParaPrompt } from './regras-fecho'
import { MIN_DEPOSIT, MEMBRO_MENSAL_EUR, PREMIUM_MENSAL_EUR, TOPO_ANUAL_EUR } from '@/lib/escada-precos'

/**
 * Guarda das regras de fecho (16/11): o agente fecha 35 €, 65 €/mês, anuais e Rota Corretora;
 * o resto sobe para o Ricardo; sem capital → MTM Funded.
 *
 *   npx tsx lib/vendas/regras-fecho.check.ts
 */
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

caso('o agente fecha a escada', () => {
  for (const tipo of ['membro', 'premium', 'anual', 'rota_corretora'] as const) assert.equal(quemFecha({ tipo }), 'agente', tipo)
  assert.equal(quemFecha({ tipo: 'bootcamp' }), 'agente', 'bootcamp 310 € fecha-se com link')
  assert.equal(quemFecha({ tipo: 'mentoria' }), 'ricardo', 'mentoria 2.000 € é do Ricardo')
})
caso('MAU: oferta à medida nunca fecha sozinha, nem barata nem sem valor', () => {
  assert.equal(quemFecha({ tipo: 'outro', valorEur: 1500 }), 'ricardo')
  assert.equal(quemFecha({ tipo: 'outro', valorEur: 200 }), 'ricardo')
  assert.equal(quemFecha({ tipo: 'outro', valorEur: null }), 'ricardo')
})
caso('sem capital → MTM Funded, não é venda', () => {
  assert.equal(quemFecha({ tipo: 'funded' }), 'parar')
})
caso('alto valor a partir de 1.200 €', () => {
  assert.equal(ALTO_VALOR_EUR, 1200)
  assert.equal(ehAltoValor(1199), false)
  assert.equal(ehAltoValor(1200), true)
  assert.equal(ehAltoValor(null), false)
  assert.ok(TOPO_ANUAL_EUR < ALTO_VALOR_EUR, 'o anual da escada tem de continuar a ser do agente')
})
caso('o prompt leva os números da escada, a Rota Corretora primeiro e o fecho ético', () => {
  const p = regrasDeFechoParaPrompt('https://x/agendar?t=fecho-alto-valor')
  for (const v of [String(MEMBRO_MENSAL_EUR), String(PREMIUM_MENSAL_EUR), String(TOPO_ANUAL_EUR), `${MIN_DEPOSIT}$`, 'https://x/agendar?t=fecho-alto-valor']) {
    assert.ok(p.includes(v), `falta ${v}`)
  }
  assert.ok(p.indexOf('1. Rota Corretora') > 0, 'a Rota Corretora é o 1.º destino')
  assert.ok(/risco de perda/.test(p) && /prazos inventados/.test(p) && /cancela quando quiser/.test(p))
  assert.ok(!/garant|lucro certo|rendimento passivo/i.test(p.replace('Nada de pressão', '')), 'MAU: promessa no prompt')
})
console.log(`regras-fecho: ${n} casos — o agente fecha a escada, o alto valor sobe ✓`)
