/**
 * GUARDA da porta dos grupos de sinais (pedido do dono, 27/10/2026): só entra quem tem a corretora
 * validada ou é membro MTM. Prende a regra e os comandos que a pessoa escreve ao bot.
 */
import assert from 'node:assert/strict'
import {
  decidirEntrada,
  lerComandoCodigo,
  lerComandoMembro,
  lerModoPorta,
  mascararEmail,
} from './telegram-porta-sinais-regra'

// ── A regra ─────────────────────────────────────────────────────────────────
assert.deepEqual(decidirEntrada({ stageLead: 'granted' }), { pode: true, via: 'corretora' })
assert.deepEqual(decidirEntrada({ perfil: { is_active: true } }), { pode: true, via: 'membro' })
assert.deepEqual(decidirEntrada({ direitoMtmAuto: true }), { pode: true, via: 'mtmauto' })
assert.deepEqual(decidirEntrada({ ehAdmin: true }), { pode: true, via: 'admin' })
// A meio do funil não entra: UID enviado, à espera do print, lead de grupo, conta inativa.
for (const stage of ['awaiting_proof', 'pending_review', 'rejected', 'no_grupo', 'new', null]) {
  assert.equal(decidirEntrada({ stageLead: stage }).pode, false, `stage ${stage}`)
}
assert.equal(decidirEntrada({ perfil: { is_active: false, user_type: 'member' } }).pode, false)
assert.equal(decidirEntrada({}).pode, false)

// ── O modo: por omissão NÃO se tira ninguém ─────────────────────────────────
assert.equal(lerModoPorta(null), 'aviso')
assert.equal(lerModoPorta({ modo: 'qualquer' }), 'aviso')
assert.equal(lerModoPorta({ modo: 'expulsar' }), 'expulsar')

// ── Os comandos ─────────────────────────────────────────────────────────────
assert.deepEqual(lerComandoMembro('/membro Ana@Gmail.com'), { email: 'ana@gmail.com' })
assert.deepEqual(lerComandoMembro('/membro'), { email: null })
assert.deepEqual(lerComandoMembro('/membro nao-e-email'), { email: null })
assert.equal(lerComandoMembro('/membros'), null)
assert.deepEqual(lerComandoCodigo('/codigo 012345'), { codigo: '012345' })
assert.deepEqual(lerComandoCodigo('/código 012345'), { codigo: '012345' })
assert.deepEqual(lerComandoCodigo('/codigo 12'), null)
assert.equal(lerComandoCodigo('012345'), null) // 6 dígitos soltos são um UID da corretora, não um código
assert.equal(mascararEmail('ricardo@gmail.com'), 'ri***@gmail.com')

console.log('telegram-porta-sinais: ok')
