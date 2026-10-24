/**
 * FECHO À MÃO NA MESTRE → SEGUIDORAS (lib/mestres/fecho-manual.ts).
 *
 * Correr: npx tsx lib/mestres/__tests__/fecho-manual.check.ts
 *
 * Prova-se:
 *   1. só um fecho MANUAL de uma posição de SINAL passa às seguidoras;
 *   2. a parcial copia a proporção, arredonda para baixo ao passo e nunca fecha mais do que a mestre;
 *   3. o `fecharPosicao` chama o acompanhamento nos dois ramos (tudo e parcial) e as seguidoras
 *      fecham com motivo `estrategia` (senão uma seguidora mestre de outra coisa propagava outra vez).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { accaoNaSeguidora, propagaFechoManual } from '../fecho-manual'

let ko = 0
function t(nome: string, f: () => void) {
  try { f(); console.log(`  ✓ ${nome}`) } catch (e) { ko++; console.error(`  ✗ ${nome}\n    ${e instanceof Error ? e.message : String(e)}`) }
}
const raiz = join(__dirname, '..', '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8')
const fx = { volume_min: 0.01, volume_step: 0.01 }

console.log('quem propaga')
t('fecho manual de um sinal → propaga', () => assert.equal(propagaFechoManual({ motivo: 'manual', origem: 'estrategia', ideiaRef: 'sinal:premium:tg:11864' }), true))
t('fecho do motor (sl/tp/estrategia) → não', () => {
  for (const motivo of ['sl', 'tp', 'trailing', 'estrategia']) assert.equal(propagaFechoManual({ motivo, origem: 'estrategia', ideiaRef: 'sinal:x' }), false)
})
t('trade aberta à mão → não (já segue pela rota «só manuais»)', () => assert.equal(propagaFechoManual({ motivo: 'manual', origem: 'manual', ideiaRef: 'sinal:x' }), false))
t('posição sem ponte de sinal → não', () => {
  assert.equal(propagaFechoManual({ motivo: 'manual', origem: 'copia', ideiaRef: null }), false)
  assert.equal(propagaFechoManual({ motivo: 'manual', origem: 'estrategia', ideiaRef: 'espelho-provider:a:1' }), false)
})

console.log('quanto fecha a seguidora')
t('mestre fechou tudo → fecha tudo', () => assert.deepEqual(accaoNaSeguidora(1, 0.37, fx), { tipo: 'fechar_tudo' }))
t('metade de 0,10 → 0,05', () => assert.deepEqual(accaoNaSeguidora(0.5, 0.1, fx), { tipo: 'parcial', volume: 0.05 }))
t('arredonda para BAIXO: 30% de 0,07 → 0,02', () => assert.deepEqual(accaoNaSeguidora(0.3, 0.07, fx), { tipo: 'parcial', volume: 0.02 }))
t('abaixo do lote mínimo → nada', () => assert.equal(accaoNaSeguidora(0.3, 0.02, fx).tipo, 'nada'))
t('o que sobraria abaixo do mínimo → fecha tudo', () => assert.deepEqual(accaoNaSeguidora(0.7, 0.25, { volume_min: 0.1, volume_step: 0.01 }), { tipo: 'fechar_tudo' }))
t('nunca fecha mais do que a proporção da mestre', () => {
  for (const v of [0.01, 0.02, 0.05, 0.13, 0.5, 1.37, 4]) for (const f of [0.1, 0.25, 0.33, 0.5, 0.75]) {
    const a = accaoNaSeguidora(f, v, fx)
    if (a.tipo === 'parcial') assert.ok(a.volume <= v * f + 1e-9, `${f} de ${v} → ${a.volume}`)
  }
})
t('passo de 0,1 (índices)', () => assert.deepEqual(accaoNaSeguidora(0.5, 1.5, { volume_min: 0.1, volume_step: 0.1 }), { tipo: 'parcial', volume: 0.7 }))

console.log('ligação ao fecharPosicao')
const exec = ler('lib/mtmfunded/simulado/execucao.ts')
t('os dois ramos do fecho chamam o acompanhamento', () => assert.equal((exec.match(/await seguidorasAcompanham\(/g) ?? []).length, 2))
t('só o motivo manual acompanha', () => assert.match(exec, /if \(motivo !== 'manual'\) return/))
const srv = ler('lib/mestres/servidor/fecho-manual.ts')
t('as seguidoras fecham com motivo estrategia', () => {
  const fechos = srv.split('\n').filter((l) => l.includes('ex.fecharPosicao('))
  assert.equal(fechos.length, 2)
  for (const l of fechos) assert.match(l, /'estrategia'\)/)
})
t('só a mestre da estratégia do sinal propaga', () => assert.match(srv, /from\('mestres_estrategias'\)[\s\S]*conta_mestre_id/))

if (ko) { console.error(`\n${ko} falhou`); process.exit(1) }
console.log('\nOK')
