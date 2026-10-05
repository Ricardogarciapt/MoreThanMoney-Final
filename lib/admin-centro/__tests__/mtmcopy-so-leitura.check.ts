/**
 * F2 · /admin/mtmcopy só leitura — e nada perdido.
 *   npx tsx lib/admin-centro/__tests__/mtmcopy-so-leitura.check.ts
 *
 * Caso MAU: um painel que DECIDE aparece em /admin/mtmcopy fora do `<DecideNoCentro>` (com os botões
 * vivos), ou deixa de existir no Centro (funcionalidade perdida).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..', '..')
const ler = (f: string) => readFileSync(join(RAIZ, f), 'utf8')
const mtmcopy = ler('app/admin/mtmcopy/page.tsx')

const DECIDEM = ['MotorMestres', 'MtmcopyStrategyControl', 'TrailingEstrategias', 'MtmcopyTelegramSenders', 'MtmcopyProviderPipeline', 'MtmcopyProviderAccounts']

/** Cada `<X` tem de estar entre um `<DecideNoCentro` e o `</DecideNoCentro>` seguinte. */
function dentroDoSoLeitura(src: string, comp: string): boolean[] {
  const out: boolean[] = []
  const re = new RegExp(`<${comp}[\\s/>]`, 'g')
  for (const m of src.matchAll(re)) {
    const antes = src.slice(0, m.index)
    const abre = antes.lastIndexOf('<DecideNoCentro')
    const fecha = antes.lastIndexOf('</DecideNoCentro>')
    out.push(abre > fecha)
  }
  return out
}

for (const c of DECIDEM) {
  const usos = dentroDoSoLeitura(mtmcopy, c)
  assert.ok(usos.length > 0, `${c} desapareceu de /admin/mtmcopy (o estado tem de continuar visível)`)
  assert.ok(usos.every(Boolean), `${c} aparece em /admin/mtmcopy com os controlos vivos (fora do DecideNoCentro)`)
}
assert.ok(!/ProvidersExternos/.test(mtmcopy), 'criar provider externo ficou duplicado em /admin/mtmcopy')
assert.match(ler('components/admin/decide-no-centro.tsx'), /<fieldset disabled/, 'o só-leitura é um fieldset disabled')
assert.match(ler('components/admin/decide-no-centro.tsx'), /s=estrategias&e=/, '«Abrir no Centro» leva à estratégia certa')

// Nada perdido: tudo o que se fazia em mtmcopy faz-se no Centro.
const centro = ler('components/admin/centro/seccoes/estrategias.tsx') + ler('components/admin/centro/estrategia-pagina.tsx') + ler('components/admin/centro/opcoes-estrategia.tsx')
for (const c of ['MotorMestres', 'MtmcopyStrategyControl', 'MtmcopyTelegramSenders', 'MtmcopyProviderPipeline', 'MtmcopyProviderAccounts', 'ProvidersExternos', 'OpcoesEstrategia']) {
  assert.ok(centro.includes(c), `${c} não tem destino no Centro`)
}
// trailing: no Centro vive nas opções (campos partilhados), na página da estratégia
assert.match(ler('lib/estrategias-admin/opcoes.ts'), /trailing_arranca_pips[\s\S]*trailing_distancia_pips[\s\S]*trailing_passo_pips[\s\S]*trailing_tempo_real/, 'trailing tem de estar nas opções do Centro')
// e os interruptores de T2T/cópia por rota (t2t-controls) estão na página
assert.match(ler('components/admin/centro/estrategia-pagina.tsx'), /rota_provider/, 'cópia/T2T por rota têm de estar na página da estratégia')
console.log(`mtmcopy-so-leitura: ${DECIDEM.length} painéis que decidem só em leitura em /admin/mtmcopy; todos com destino no Centro`)
