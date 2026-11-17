/** Guarda das chamadas: `npx tsx lib/backoffice-chamada.check.ts`. */
import assert from 'node:assert/strict'
import { MAX_TRANSCRICAO, ehTipoChamada, encurtarTranscricao, interpretarResumo, notaDaChamada, sistemaDoResumo } from './backoffice-chamada'

assert.ok(ehTipoChamada('onboarding'))
assert.ok(!ehTipoChamada('toString'))
assert.ok(!ehTipoChamada('zoom'))

// Lixo nunca vira resumo.
assert.equal(interpretarResumo('olá'), null)
assert.equal(interpretarResumo('{"resumo":'), null)
assert.equal(interpretarResumo('{"resumo":""}'), null)

const r = interpretarResumo(
  'ok {"resumo":"Falámos do Premium.","objecoes":["preço",3],"proximos_passos":["enviar link"],"tarefas":[{"titulo":"Enviar link","prazo":"2026-11-18"},{"titulo":"x","prazo":"amanhã"},{"titulo":""},{"titulo":"Ligar","prazo":"2026-02-31"}]}',
)
assert.ok(r)
assert.deepEqual(r.objecoes, ['preço'])
assert.deepEqual(r.tarefas, [
  { titulo: 'Enviar link', prazo: '2026-11-18' },
  { titulo: 'x', prazo: null },
  { titulo: 'Ligar', prazo: null },
])

// Transcrição longa: guarda início e fim.
const longa = 'a'.repeat(MAX_TRANSCRICAO) + 'FIM'
const e = encurtarTranscricao(longa)
assert.ok(e.cortada && e.texto.endsWith('FIM') && e.texto.length < longa.length)
assert.equal(encurtarTranscricao(' curto ').texto, 'curto')

// Nota: nunca passa de 2000 e guarda a antiga por baixo.
const n = notaDaChamada('followup', '2026-11-17', r, 'nota velha')
assert.ok(n.startsWith('📞 Follow-up · 2026-11-17') && n.includes('— antes —\nnota velha'))
assert.ok(notaDaChamada('apoio', '2026-11-17', r, 'x'.repeat(5000)).length <= 2000)

assert.ok(sistemaDoResumo('onboarding', '2026-11-17').includes('Onboarding'))
console.log('backoffice-chamada: ok')
