import assert from 'node:assert/strict'
import { contarAtrasadas, entraNaFila, filaDePrioridade, pontuar, type NegocioParaPrioridade } from './prioridade'

const agora = new Date('2026-11-17T18:00:00Z')
const ha = (h: number) => new Date(agora.getTime() - h * 3_600_000).toISOString()
const n = (p: Partial<NegocioParaPrioridade> & { id: string }): NegocioParaPrioridade => ({
  nome: p.id, origem: 'base', estado: 'lead', criado_em: ha(48), atualizado_em: ha(48), telefone: '912', ...p,
})

// Fora da fila
assert.equal(entraNaFila({ estado: 'ganho', origem: 'telegram' }), false)
assert.equal(entraNaFila({ estado: 'perdido', origem: 'telegram' }), false)
assert.equal(entraNaFila({ estado: 'lead', origem: 'whatsapp_import' }), false)
assert.equal(entraNaFila({ estado: 'contactado', origem: 'whatsapp_import' }), true)

// Lead quente fresco bate um contactado parado 3 dias
const fresco = pontuar(n({ id: 'f', origem: 'telegram', criado_em: ha(0.5) }), 0, agora)!
assert.equal(fresco.pontos, 55)
assert.match(fresco.accao, /Responder já/)
const parado = pontuar(n({ id: 'p', estado: 'contactado', atualizado_em: ha(72) }), 0, agora)!
assert.equal(parado.pontos, 30)
assert.ok(fresco.pontos > parado.pontos)

// Marcado com tarefa atrasada é o topo
const marcado = pontuar(n({ id: 'm', estado: 'marcado' }), 2, agora)!
assert.equal(marcado.pontos, 65)
assert.ok(marcado.porque.includes('2 tarefas atrasadas'))

// Sem contacto desce
const semContacto = pontuar(n({ id: 's', estado: 'qualificado', telefone: null, atualizado_em: ha(1) }), 0, agora)!
assert.equal(semContacto.pontos, 25)

// Fila ordena e corta
const fila = filaDePrioridade(
  [n({ id: 'p', estado: 'contactado', atualizado_em: ha(72) }), n({ id: 'm', estado: 'marcado' }), n({ id: 'w', origem: 'whatsapp_import' }), n({ id: 'f', origem: 'telegram', criado_em: ha(0.5) })],
  new Map([['m', 2]]),
  agora,
  2,
)
assert.deepEqual(fila.map((i) => i.id), ['m', 'f'])

// Atrasadas: só antes de hoje e com negócio
const at = contarAtrasadas([
  { negocio_id: 'a', prazo: '2026-11-16' },
  { negocio_id: 'a', prazo: '2026-11-10' },
  { negocio_id: 'a', prazo: '2026-11-17' },
  { negocio_id: null, prazo: '2026-11-01' },
  { negocio_id: 'b', prazo: null },
], '2026-11-17')
assert.equal(at.get('a'), 2)
assert.equal(at.has('b'), false)

console.log('prioridade.check: ok')
