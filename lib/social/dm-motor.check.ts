/** Guarda do leitor de webhooks do motor de DMs: Instagram e Messenger entram, ecos e lixo não. */
import assert from 'node:assert/strict'
import { mensagensDoWebhook } from './dm-motor'

const ig = mensagensDoWebhook({ object: 'instagram', entry: [{ id: '17841474872672009', messaging: [
  { sender: { id: 'u1' }, message: { mid: 'm1', text: 'sério' } },
  { sender: { id: '17841474872672009' }, message: { mid: 'm2', text: 'eco', is_echo: true } },
  { sender: { id: 'u2' }, message: { mid: 'm3' } },
] }] })
assert.equal(ig.length, 1)
assert.equal(ig[0].canal, 'instagram')
assert.equal(ig[0].contaId, '17841474872672009')

const fb = mensagensDoWebhook({ object: 'page', entry: [{ id: '1194330033767059', messaging: [{ sender: { id: 'p1' }, message: { mid: 'x', text: 'olá' } }] }] })
assert.equal(fb[0].canal, 'messenger')
assert.equal(fb[0].contaId, '1194330033767059')

assert.equal(mensagensDoWebhook({ object: 'page', entry: [{ id: '1', changes: [{ field: 'leadgen' }] }] }).length, 0)
assert.equal(mensagensDoWebhook(null).length, 0)
console.log('dm-motor: ok — Instagram e Messenger entram, ecos e leadgen ficam de fora')
