import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const page = readFileSync(new URL('../../app/backoffice/crm/page.tsx',import.meta.url),'utf8')
const layout = readFileSync(new URL('../../app/backoffice/layout.tsx',import.meta.url),'utf8')
assert.ok(page.includes("abrirPagina('bo.pipeline_proprio')"))
assert.ok(page.includes("ambitoDaPagina(ctx, 'pipeline')"))
assert.ok(page.includes('negociosDoAmbito(getSupabaseAdmin(), ambito,'))
assert.ok(!page.includes(".from('vendas_negocios')"))
assert.ok(!page.includes(".from('crm_bots_fila')"))
assert.ok(layout.includes("href: '/backoffice/crm', label: 'CRM da equipa', exige: 'bo.pipeline_proprio'"))
assert.ok(page.includes('<Trabalhar '));assert.ok(page.includes('<TarefaNova negocioId={n.id}'))
assert.ok(page.includes('<Historico '));assert.ok(page.includes('<Paginacao '))
console.log('CRM UI: capacidade, âmbito e reutilização dos componentes verificados')
