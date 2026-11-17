/** Guarda: `npx tsx lib/vendas/lead-instantaneo.check.ts`. */
import assert from 'node:assert/strict'
import { ligacaoDeResposta, mensagemDoAviso, sinaisDoLead, type LeadNovo } from './lead-instantaneo'

const base: LeadNovo = {
  id: '00000000-0000-0000-0000-000000000001',
  nome: 'Ana <b>',
  origem: 'telegram',
  interesse: null,
  broker_uid: null,
  telegram_username: null,
  instagram_handle: null,
  telefone: null,
  idioma: null,
  criado_em: '2026-11-17T18:00:00Z',
}
assert.deepEqual(sinaisDoLead(base), [])
assert.equal(sinaisDoLead({ ...base, broker_uid: 'x', interesse: 'copy' })[0], '🔥 já tem conta na corretora')
assert.equal(ligacaoDeResposta(base), null)
assert.equal(ligacaoDeResposta({ ...base, telegram_username: '@ana' }), 'https://t.me/ana')
assert.equal(ligacaoDeResposta({ ...base, telefone: '912 345 678' }), 'https://wa.me/351912345678')
const m = mensagemDoAviso(base, 'https://x.pt', new Date('2026-11-17T18:03:00Z'))
assert.ok(m.includes('há 3 min'))
assert.ok(m.includes('Ana &lt;b&gt;'), 'o nome é escapado')
assert.ok(!m.includes('Responder agora'))
console.log('lead-instantaneo: ok')
