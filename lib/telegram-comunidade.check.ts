import assert from 'node:assert/strict'
import { acharGrupoPeloTitulo, lerConfig, podeSerConvidado, postDaComunidade, slotDaHora, TAG_CONVIDADO } from './telegram-comunidade'

assert.deepEqual(lerConfig(null), { chat_id: null, convite: null, posts: false, convites: false, conversa: false })
assert.equal(lerConfig({ chat_id: '-5335035628', convite: 'https://t.me/+abc', posts: true }).posts, true)
assert.equal(lerConfig({ convite: 'http://evil' }).convite, null)

assert.equal(acharGrupoPeloTitulo({ '-5335035628': { title: 'MTM Chat' }, '-1004352255256': { title: 'MTM System' } }), '-5335035628')
assert.equal(acharGrupoPeloTitulo({ '-5335035628': { title: 'MTM Chat' }, '-1009': { title: 'MTM Chat' } }), '-1009')
assert.equal(acharGrupoPeloTitulo({}), null)

const base = { chat_id: '123', source: 'telegram_dm', message_count: 3, stage: 'new', tags: [], first_name: 'Ana' }
assert.equal(podeSerConvidado(base, new Set()), true)
assert.equal(podeSerConvidado({ ...base, chat_id: '-100' }, new Set()), false, 'grupo não é DM')
assert.equal(podeSerConvidado({ ...base, source: 'grupo MTM System', message_count: 0 }, new Set()), false, 'nunca falou com o bot')
assert.equal(podeSerConvidado({ ...base, tags: [TAG_CONVIDADO] }, new Set()), false, 'já convidado')
assert.equal(podeSerConvidado(base, new Set(['123'])), false, 'já no grupo')
assert.equal(podeSerConvidado({ ...base, stage: 'opt_out' }, new Set()), false)

assert.equal(slotDaHora(9), 0)
assert.equal(slotDaHora(13), 1)
assert.equal(slotDaHora(19), 2)
assert.equal(postDaComunidade({ bot: 'b', prova: null }, 0, 0).tipo, 'pergunta-do-dia')
assert.match(postDaComunidade({ bot: 'b', prova: null }, 0, 1).tipo, /^produto-/)
assert.equal(postDaComunidade({ bot: 'b', prova: { tipo: 'trade-ganha', texto: 'x', botoes: [] } }, 0, 1).tipo, 'trade-ganha')
for (let d = 0; d < 8; d++) for (const s of [0, 1, 2] as const) {
  const t = postDaComunidade({ bot: 'b', prova: null }, d, s).texto
  assert.doesNotMatch(t, /\bvocê\b|lucro garantido|retorno garantido/i)
}
console.log('telegram-comunidade: ok')
