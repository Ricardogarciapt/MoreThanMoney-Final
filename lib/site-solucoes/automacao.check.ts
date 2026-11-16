/**
 * Guarda do simulador do /solucoes. Correr: npx tsx lib/site-solucoes/automacao.check.ts
 */
import assert from 'node:assert/strict'
import { AREAS, SECTORES, TAREFAS, PRESSUPOSTOS, simular } from './automacao'

// Cada tarefa aponta para uma área que existe, com fracção entre 0 e 1.
for (const t of Object.values(TAREFAS)) {
  assert.ok(AREAS.some((a) => a.id === t.area), `área ${t.area}`)
  assert.ok(t.automatizavel > 0 && t.automatizavel <= 1, t.id)
}
// Cada sector só usa tarefas conhecidas e tem ecrã de exemplo.
for (const s of SECTORES) {
  for (const id of Object.keys(s.horas)) assert.ok(TAREFAS[id], `${s.id}:${id}`)
  assert.ok(s.ecra.pergunta && s.ecra.resposta, s.id)
}

// Contas: 10 h de mensagens (0,6) = 6 h/semana → 276 h/ano.
const r = simular({ mensagens: 10 }, 10)
assert.equal(r.recuperaveisSemana, 6)
assert.equal(r.recuperaveisAno, 6 * PRESSUPOSTOS.semanasPorAno)
assert.equal(r.eurosAno, r.recuperaveisAno * 10)
assert.equal(r.prioridades[0].area.id, 'atendimento')

// Lixo não rebenta as contas.
const z = simular({ mensagens: -3, inexistente: 5, marcacoes: NaN }, NaN)
assert.equal(z.recuperaveisAno, 0)
assert.equal(z.eurosAno, 0)

console.log('site-solucoes/automacao: ok')
