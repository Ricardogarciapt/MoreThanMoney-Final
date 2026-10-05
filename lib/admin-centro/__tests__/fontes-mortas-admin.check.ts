/**
 * F5 — nenhum ecrã de admin mostra James/PrimeVerse/Forex Swings como fonte VIVA, e o Centro mostra
 * o estado novo (fonte desligada, canal, MT5 por ligar).
 *   npx tsx lib/admin-centro/__tests__/fontes-mortas-admin.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FONTES } from '../regras'

const RAIZ = join(__dirname, '..', '..', '..')
for (const chave of ['primeverse', 'forex'] as const) {
  const f = FONTES.find((x) => x.chave === chave)!
  assert.match(f.nome, /histórico/i, `${chave} aparece como fonte viva no Centro`)
  assert.equal(f.limiteSilencioMin, null, `${chave} não pode gerar alarme de silêncio (já não publica)`)
}
const estr = readFileSync(join(RAIZ, 'lib/admin-centro/servidor/estrategias.ts'), 'utf8')
for (const campo of ['fonteDesligada', 'canalChat', 'mt5Estado', 'fora do motor das mestres']) assert.ok(estr.includes(campo), `Centro sem «${campo}»`)
const ui = readFileSync(join(RAIZ, 'components/admin/centro/seccoes/estrategias.tsx'), 'utf8')
assert.ok(ui.includes('fonte desligada') && ui.includes('ProvidersExternos'), 'Centro → Estratégias sem fonte desligada / Nova estratégia')
const mtmcopy = readFileSync(join(RAIZ, 'app/admin/mtmcopy/page.tsx'), 'utf8')
// 05/10: criar provider saiu de /admin/mtmcopy (duplicado) — decide-se no Centro; aqui só leitura.
assert.ok(!mtmcopy.includes('ProvidersExternos') && mtmcopy.includes('DecideNoCentro'), '/admin/mtmcopy tem de ser só leitura e mandar para o Centro')
// componentes de admin: james/primeverse só dentro da lista de RETIRADAS
const ctrl = readFileSync(join(RAIZ, 'components/admin/mtmcopy-strategy-control.tsx'), 'utf8')
const fora = ctrl.split('\n').filter((l) => /james|primeverse|forex.?swings/i.test(l) && !/RETIRADAS|410|retirad|histór|saiu|desligad/i.test(l))
assert.deepEqual(fora, [], 'strategy-control mostra uma fonte morta fora das retiradas')
console.log('fontes-mortas-admin: Forex/PrimeVerse históricos; Centro e /admin/mtmcopy mostram o modelo novo')
