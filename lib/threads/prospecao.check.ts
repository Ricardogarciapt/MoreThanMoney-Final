import assert from 'node:assert/strict'
import { contarFeita, limparResposta, palavrasDoCiclo, postValido, quotaRestante, TECTO_DIA, PALAVRAS } from './prospecao'

const agora = new Date('2026-11-23T13:00:00Z')
const ps = palavrasDoCiclo(agora)
assert.equal(ps.length, 2)
assert.ok(ps.every((p) => PALAVRAS.includes(p)))

const est = {}
assert.equal(quotaRestante(est, agora), TECTO_DIA)
contarFeita(est, agora)
assert.equal(quotaRestante(est, agora), TECTO_DIA - 1)
assert.equal(quotaRestante(est, new Date('2026-11-24T10:00:00Z')), TECTO_DIA)

const vistos = new Set<string>(['x1'])
const base = { id: 'a1', username: 'ana', text: 'Estou farta do meu trabalho, quero aprender trading a sério', timestamp: agora.toISOString() }
assert.equal(postValido(base, 'ricardogarciapt', vistos, agora), true)
assert.equal(postValido({ ...base, id: 'x1' }, 'ricardogarciapt', vistos, agora), false)
assert.equal(postValido({ ...base, username: 'ricardogarciapt' }, 'ricardogarciapt', vistos, agora), false)
assert.equal(postValido({ ...base, text: 'giveaway airdrop link na bio agora mesmo' }, 'r', vistos, agora), false)
assert.equal(postValido({ ...base, text: 'I want to learn trading this year please' }, 'r', vistos, agora), false)
assert.equal(postValido({ ...base, timestamp: '2026-11-18T10:00:00Z' }, 'r', vistos, agora), false)

assert.equal(limparResposta('Lucro garantido todos os meses!'), null)
assert.equal(limparResposta('Como IA, posso ajudar'), null)
assert.equal(limparResposta('«Faz sentido. Já tentaste com conta demo?» #trading'), 'Faz sentido. Já tentaste com conta demo?')
assert.ok((limparResposta('a'.repeat(600)) ?? '').length <= 480)
console.log('threads/prospecao ok')
assert.ok(limparResposta('Bom dia! Começa pela demo, é o melhor passo.'))
