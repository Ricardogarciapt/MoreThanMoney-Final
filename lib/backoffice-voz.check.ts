/** Guarda do comando por voz: `npx tsx lib/backoffice-voz.check.ts`. */
import assert from 'node:assert/strict'
import { MAX_NOTA, interpretarAccao, notaDaVoz, padraoDeProcura, sistemaDoComando } from './backoffice-voz'

// Lixo e JSON partido nunca viram acção.
assert.equal(interpretarAccao('olá', true).tipo, 'responder')
assert.equal(interpretarAccao('{"tipo":', true).tipo, 'responder')
assert.equal(interpretarAccao('{"tipo":"apagar_tudo"}', true).tipo, 'responder')

// JSON com texto à volta é aceite.
assert.deepEqual(interpretarAccao('Aqui vai: {"tipo":"minhas_tarefas"} ok', false), { tipo: 'minhas_tarefas' })
assert.deepEqual(interpretarAccao('{"tipo":"proxima_accao"}', false), { tipo: 'proxima_accao' })
assert.match(sistemaDoComando('2026-11-17', false), /proxima_accao/)

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

// Funil: só do catálogo; null tira.
assert.deepEqual(interpretarAccao('{"tipo":"mudar_funil","negocio":"Ana","funil":"corretora"}', false), { tipo: 'mudar_funil', negocio: 'Ana', funil: 'corretora' })
assert.deepEqual(interpretarAccao('{"tipo":"mudar_funil","negocio":"Ana","funil":null}', false), { tipo: 'mudar_funil', negocio: 'Ana', funil: null })
assert.equal(interpretarAccao('{"tipo":"mudar_funil","negocio":"Ana","funil":"prop"}', false).tipo, 'responder')
assert.ok(sistemaDoComando('2026-11-17', false).includes('mudar_funil'))

// Páginas: só as conhecidas.
assert.deepEqual(interpretarAccao('{"tipo":"abrir","pagina":"tarefas"}', true), { tipo: 'abrir', pagina: 'tarefas' })
assert.equal(interpretarAccao('{"tipo":"abrir","pagina":"../admin"}', true).tipo, 'responder')

// Procura sem curingas vindos da voz.
assert.equal(padraoDeProcura('João 100%_Silva'), '%João%100%Silva%')

console.log('backoffice-voz: ok')

// ── Fase 2: nota, tarefas, chamada, rascunho ──────────────────────────────────
assert.deepEqual(interpretarAccao('{"tipo":"nota_negocio","negocio":"Ana","texto":" quer começar em janeiro "}', true), {
  tipo: 'nota_negocio',
  negocio: 'Ana',
  texto: 'quer começar em janeiro',
})
assert.equal(interpretarAccao('{"tipo":"nota_negocio","negocio":"Ana","texto":""}', true).tipo, 'responder')
assert.deepEqual(interpretarAccao('{"tipo":"concluir_tarefa","tarefa":"ligar Pedro"}', true), { tipo: 'concluir_tarefa', tarefa: 'ligar Pedro' })
// Adiar sem data válida não chega à rota.
assert.equal(interpretarAccao('{"tipo":"adiar_tarefa","tarefa":"x","prazo":"sexta"}', true).tipo, 'responder')
assert.deepEqual(interpretarAccao('{"tipo":"adiar_tarefa","tarefa":"x","prazo":"2026-11-20"}', true), { tipo: 'adiar_tarefa', tarefa: 'x', prazo: '2026-11-20' })
// Tipo de chamada desconhecido cai para follow-up; negócio é opcional.
assert.deepEqual(interpretarAccao('{"tipo":"preparar_chamada","negocio":null,"tipo_chamada":"zoom"}', true), {
  tipo: 'preparar_chamada',
  negocio: null,
  tipo_chamada: 'followup',
})
// Rascunho: canal desconhecido cai para WhatsApp; nunca há acção de enviar.
assert.deepEqual(interpretarAccao('{"tipo":"rascunho_mensagem","negocio":"Rui","canal":"sms","objetivo":"marcar chamada"}', true), {
  tipo: 'rascunho_mensagem',
  negocio: 'Rui',
  canal: 'whatsapp',
  objetivo: 'marcar chamada',
})
assert.equal(interpretarAccao('{"tipo":"enviar_mensagem","negocio":"Rui"}', true).tipo, 'responder')
// Nota: o novo vai por cima, o antigo fica, nunca passa do tecto.
assert.equal(notaDaVoz('2026-11-17', 'ligou', null), '🎙 2026-11-17 · ligou')
assert.equal(notaDaVoz('2026-11-17', 'ligou', 'antiga'), '🎙 2026-11-17 · ligou\n\nantiga')
assert.equal(notaDaVoz('2026-11-17', 'x', 'a'.repeat(5000)).length, MAX_NOTA)
console.log('backoffice-voz (fase 2): ok')
