/** Guarda: `npx tsx lib/conteudo/ganchos.check.ts` — as fórmulas respeitam as regras da casa. */
import assert from 'node:assert/strict'
import { FORMULAS, PARA_DEDO, SEGURA, blocoGanchos, blocoLegendaReel } from './ganchos'
import { verificarTexto } from '@/lib/conteudo-magnetico/regras'

const gatilhos = new Set(FORMULAS.map((f) => f.gatilho))
assert.equal(gatilhos.size, 10, 'os 10 gatilhos estão todos representados')
for (const g of [...PARA_DEDO, ...SEGURA]) assert.ok(gatilhos.has(g))
for (const f of FORMULAS) {
  assert.ok(f.exemplo.split(/\s+/).length <= 14, `exemplo curto: ${f.exemplo}`)
  assert.deepEqual(verificarTexto(f.exemplo), [], `exemplo passa as regras da casa: ${f.exemplo}`)
  assert.ok(!/você|celular|tela\b/i.test(f.exemplo), `PT-PT: ${f.exemplo}`)
}
assert.ok(blocoGanchos().length < 4000)
assert.ok(blocoLegendaReel().includes('5 hashtags'))
console.log(`ok — ${FORMULAS.length} fórmulas, 10 gatilhos`)
