import assert from 'node:assert/strict'
import { faixaDeLargura, graficoVisivelGuardado, painelAoLado } from '../layout'

/** Ocupação do ecrã do WebTrader. Correr: npx tsx lib/webtrader/__tests__/layout.check.ts */
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

caso('faixas: telemóvel, tablet (768–1179), secretária', () => {
  assert.equal(faixaDeLargura(375), 'estreito')
  assert.equal(faixaDeLargura(767), 'estreito')
  assert.equal(faixaDeLargura(768), 'tablet', 'iPad mini retrato')
  assert.equal(faixaDeLargura(1024), 'tablet', 'iPad paisagem')
  assert.equal(faixaDeLargura(1179), 'tablet')
  assert.equal(faixaDeLargura(1180), 'largo')
  assert.equal(faixaDeLargura(Number.NaN), 'estreito')
})

caso('Simple: painel ao lado só em paisagem com largura e altura', () => {
  assert.equal(painelAoLado(1024, 768), true, 'iPad deitado')
  assert.equal(painelAoLado(1180, 820), true, 'iPad Air deitado')
  assert.equal(painelAoLado(768, 1024), false, 'iPad em pé')
  assert.equal(painelAoLado(844, 390), false, 'iPhone deitado: estreito e baixo')
  assert.equal(painelAoLado(932, 430), false, 'iPhone Pro Max deitado: pouca altura')
})

caso('Mostrar gráfico: por modo, com a chave antiga como defeito', () => {
  assert.equal(graficoVisivelGuardado(null, null), true)
  assert.equal(graficoVisivelGuardado('0', null), false)
  assert.equal(graficoVisivelGuardado('1', '0'), true, 'o do modo manda')
  assert.equal(graficoVisivelGuardado(null, '0'), false, 'sem valor do modo vale o antigo')
})

console.log(`\n${n} verificações OK`)
