import assert from 'node:assert/strict'
import { contaParaLimite, partirToken, validarPedido, validarResultado } from './grupos-novos'

assert.equal(validarPedido({ tipo: 'grupo', titulo: 'MTM Bootcamp', bot: '@MoreThanMoney_aibot' }).ok, true)
assert.equal(validarPedido({ tipo: 'sala', titulo: 'x' }).ok, false)
assert.equal(validarPedido({ tipo: 'canal', titulo: 'ab' }).ok, false)
assert.equal(validarPedido({ tipo: 'canal', titulo: 'Canal novo', bot: 'ricardo' }).ok, false)
const v = validarPedido({ tipo: 'canal', titulo: '  Canal novo ', bot: '' })
assert.ok(v.ok && v.pedido.bot === null && v.pedido.titulo === 'Canal novo')

const agora = Date.parse('2026-10-23T18:00:00Z')
assert.equal(contaParaLimite([
  { estado: 'criado', criado_em: '2026-10-23T10:00:00Z' },
  { estado: 'cancelado', criado_em: '2026-10-23T11:00:00Z' },
  { estado: 'rascunho', criado_em: '2026-10-23T12:00:00Z' },
  { estado: 'falhou', criado_em: '2026-10-22T19:00:00Z' },
  { estado: 'criado', criado_em: '2026-10-22T17:00:00Z' },
], agora), 2)

const id = '3f2b8c1e-1111-4222-8333-944455556666'
assert.deepEqual(validarResultado({ id, ok: true, chat_id: '-1001234', convite: 'https://t.me/+abc' }),
  { ok: true, id, estado: 'criado', chat_id: '-1001234', convite: 'https://t.me/+abc', erro: null })
assert.equal(validarResultado({ id, ok: true, chat_id: '-1001234', convite: 'https://mal.pt' }).ok, false)
const f = validarResultado({ id, ok: false, erro: 'FLOOD_WAIT' })
assert.ok(f.ok && f.estado === 'falhou')

assert.deepEqual(partirToken('123456789:AAHfakefakefakefakefakefakefakefake1'), { botId: 123456789 })
assert.equal(partirToken('não é token'), null)
console.log('grupos-novos: ok')
