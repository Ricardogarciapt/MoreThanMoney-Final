import assert from 'node:assert/strict'
import { flutuanteDasPosicoes, volumeParcial } from '../lote'

/** Lotes no ecrã (fecho parcial, flutuante). Correr: npx tsx lib/webtrader/__tests__/lote.check.ts */
const S = { volume_min: 0.01, volume_step: 0.01 }
assert.equal(volumeParcial(1.16, 50, S), 0.58, 'o erro da vírgula flutuante (dava 0,57)')
assert.equal(volumeParcial(1, 25, S), 0.25)
assert.equal(volumeParcial(0.03, 50, S), 0.01, '0,015 → para baixo ao passo')
assert.equal(volumeParcial(0.01, 50, S), null, 'fecharia abaixo do mínimo')
assert.equal(volumeParcial(0.02, 75, S), 0.01)
assert.equal(volumeParcial(0.15, 75, { volume_min: 0.1, volume_step: 0.01 }), null, 'deixaria 0,04 < mínimo 0,1')
assert.equal(volumeParcial(0.15, 50, { volume_min: 0.1, volume_step: 0.01 }), null, 'fecharia 0,07 < mínimo 0,1')
assert.equal(volumeParcial(1, 100, S), null, '100 % não é parcial')
assert.equal(volumeParcial(3, 33, { volume_min: 0.1, volume_step: 0.1 }), 0.9)
// Todos os volumes de 0,01 a 3 com 25/50/75 %: nunca acima do exacto, nunca mais de um passo abaixo.
for (let c = 1; c <= 300; c++) {
  const v = c / 100
  for (const pct of [25, 50, 75]) {
    const x = volumeParcial(v, pct, S)
    if (x == null) continue
    const exacto = (v * pct) / 100
    assert.ok(x <= exacto + 1e-9 && exacto - x < 0.01 - 1e-9, `${v} × ${pct}% → ${x}`)
  }
}
assert.equal(flutuanteDasPosicoes([{ lucro: 10.004, swap: -1.5 }, { lucro: null, swap: 0 }, { lucro: -3 }]), 5.5)
console.log('  ok  lotes: parcial sem erro de vírgula flutuante; flutuante com swap como o da conta')

import { arredAosDigitos } from '../formato'
assert.equal(arredAosDigitos(2650.123456, 2), 2650.12)
assert.equal(arredAosDigitos(1.098768, 5), 1.09877)
assert.equal(arredAosDigitos(42000.04, 0), 42000)
assert.equal(arredAosDigitos(1.5, -3), 2, 'dígitos negativos não rebentam o toFixed')
console.log('  ok  arredAosDigitos: um arredondamento de preço para o gráfico, o rascunho e as avançadas')
