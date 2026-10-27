/** GUARDA: o bot do grupo MTM System só responde a perguntas, e só com números da casa. */
import assert from 'node:assert/strict'
import { deveResponder, pareceUmaPergunta, respostaAceitavel } from './telegram-leads-conversa'
import { postsPossiveis, postDoSlot } from './telegram-leads-posts'
import { peneira } from './marketing/regras'

const BOT = 'MoreThanMoney_aibot'
const msg = (text: string, extra: object = {}) => ({ message_id: 1, chat: { id: -1 }, text, from: { id: 42, first_name: 'Ana' }, ...extra })

// Quando responde
assert.equal(pareceUmaPergunta('Isto funciona com pouco dinheiro?'), true)
assert.equal(pareceUmaPergunta('como faço para entrar nos grupos'), true)
assert.equal(pareceUmaPergunta('bom dia a todos'), false)
assert.equal(pareceUmaPergunta('/start'), false)
assert.equal(deveResponder(msg('obrigado @MoreThanMoney_aibot'), BOT, null), true)
assert.equal(deveResponder(msg('ok', { reply_to_message: { from: { is_bot: true, username: BOT } } }), BOT, null), true)
assert.equal(deveResponder(msg('bom dia'), BOT, null), false)
assert.equal(deveResponder(msg('alguém sabe como validar?'), BOT, '42'), false) // o dono não leva resposta
assert.equal(deveResponder(msg('quanto custa?', { from: { id: 7, is_bot: true } }), BOT, null), false)

// O que pode sair
assert.equal(respostaAceitavel('Dá para começar com pouco, o depósito fica na tua conta.', null), true)
assert.equal(respostaAceitavel('Temos 78% de acerto!', null), false) // percentagem inventada
assert.equal(respostaAceitavel('Temos 78% de acerto!', 'dos últimos 30 dias: 400 trades · +900 pips · 78% de acerto'), true)
assert.equal(respostaAceitavel('Isto é lucro garantido', null), false)
assert.equal(respostaAceitavel('Você pode começar já', null), false)
assert.equal(respostaAceitavel('Como no Jifu, mas melhor', null), false)
assert.equal(respostaAceitavel('Um aluno fez 2.500€ num mês', null), false)

// Os posts: sem dados não há trade nem certificados; com dados, tudo com aviso e sem marcas
const vazio = { bot: BOT, ganhas: [], certificados: null, membros: null }
const tipos = postsPossiveis(vazio, 0).map((p) => p.tipo)
assert.ok(!tipos.includes('trade-ganha') && !tipos.includes('certificados'))
const cheio = {
  bot: BOT,
  ganhas: [{ positionId: 'x', symbol: 'XAUUSD', direcao: 'buy' as const, fonte: 'goldkiller', pips: 101.2, dinheiro: 0, saidas: 2, fechadaEm: '2026-10-27T13:01:14Z' }],
  certificados: { total: 68, ultimos30d: 3, ultimoTipo: 'desafio', ultimoEm: '2026-10-20T15:00:00Z' },
  membros: 312,
}
for (let d = 0; d < 6; d++) {
  for (const p of postsPossiveis(cheio, d)) {
    const problemas = peneira(p.texto.replace(/<[^>]+>/g, '')).filter((x) => !x.startsWith('tem uma percentagem'))
    assert.deepEqual(problemas, [], `${p.tipo}: ${problemas.join(', ')}`)
    assert.ok(!/%/.test(p.texto), `${p.tipo} não cita percentagens`)
  }
}
const t = postsPossiveis(cheio, 0).find((p) => p.tipo === 'trade-ganha')!
assert.match(t.texto, /GoldKiller · XAUUSD \(compra\)/)
assert.match(t.texto, /nem todas fecham assim/)
// Slots seguidos não repetem
assert.notEqual(postDoSlot(cheio, 10).tipo, postDoSlot(cheio, 11).tipo)
console.log('ok telegram-leads-conversa')
