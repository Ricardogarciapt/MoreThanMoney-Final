/** Guarda do comando por voz: `npx tsx lib/backoffice-voz.check.ts`. */
import assert from 'node:assert/strict'
import { interpretarAccao, padraoDeProcura, sistemaDoComando } from './backoffice-voz'

// Lixo e JSON partido nunca viram acção.
assert.equal(interpretarAccao('olá', true).tipo, 'responder')
assert.equal(interpretarAccao('{"tipo":', true).tipo, 'responder')
assert.equal(interpretarAccao('{"tipo":"apagar_tudo"}', true).tipo, 'responder')

// JSON com texto à volta é aceite.
assert.deepEqual(interpretarAccao('Aqui vai: {"tipo":"minhas_tarefas"} ok', false), { tipo: 'minhas_tarefas' })

// Mover: estado tem de existir; motivo só em perdido.
assert.equal(interpretarAccao('{"tipo":"mover_negocio","negocio":"João","estado":"fechado"}', true).tipo, 'responder')
assert.deepEqual(interpretarAccao('{"tipo":"mover_negocio","negocio":" João  Silva ","estado":"qualificado","motivo_perda":"x"}', true), {
  tipo: 'mover_negocio',
  negocio: 'João Silva',
  estado: 'qualificado',
})
assert.deepEqual(interpretarAccao('{"tipo":"mover_negocio","negocio":"Ana","estado":"perdido","motivo_perda":"sem capital"}', true), {
  tipo: 'mover_negocio',
  negocio: 'Ana',
  estado: 'perdido',
  motivo_perda: 'sem capital',
})

// Tarefa: data inválida cai para null, nunca chega à rota.
assert.deepEqual(interpretarAccao('{"tipo":"criar_tarefa","titulo":"Ligar ao Pedro","prazo":"amanhã","negocio":null}', true), {
  tipo: 'criar_tarefa',
  titulo: 'Ligar ao Pedro',
  prazo: null,
  negocio: null,
})
assert.equal((interpretarAccao('{"tipo":"criar_tarefa","titulo":"x","prazo":"2026-11-18"}', true) as { prazo: string }).prazo, '2026-11-18')
assert.equal(interpretarAccao('{"tipo":"criar_tarefa","titulo":"x","prazo":"2026-02-31"}', true).tipo, 'criar_tarefa')

// Gestão: sem capacidade, o resumo do pipeline inteiro é recusado e nem aparece no prompt.
assert.equal(interpretarAccao('{"tipo":"resumo_pipeline","dias":7}', false).tipo, 'responder')
assert.deepEqual(interpretarAccao('{"tipo":"resumo_pipeline","dias":9999}', true), { tipo: 'resumo_pipeline', dias: 180 })
assert.ok(!sistemaDoComando('2026-11-17', false).includes('resumo_pipeline'))
assert.ok(sistemaDoComando('2026-11-17', true).includes('resumo_pipeline'))

// Páginas: só as conhecidas.
assert.deepEqual(interpretarAccao('{"tipo":"abrir","pagina":"tarefas"}', true), { tipo: 'abrir', pagina: 'tarefas' })
assert.equal(interpretarAccao('{"tipo":"abrir","pagina":"../admin"}', true).tipo, 'responder')

// Procura sem curingas vindos da voz.
assert.equal(padraoDeProcura('João 100%_Silva'), '%João%100%Silva%')

console.log('backoffice-voz: ok')
