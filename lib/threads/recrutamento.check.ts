import assert from 'node:assert/strict'
import { devePublicar, ehInteressado, postDaSemana, respostaAoInteressado, POSTS_RECRUTAMENTO } from './recrutamento'

assert.equal(devePublicar(null), true)
assert.equal(devePublicar(new Date().toISOString()), false)
assert.equal(devePublicar(new Date(Date.now() - 4 * 86_400_000).toISOString()), true)
assert.ok(POSTS_RECRUTAMENTO.includes(postDaSemana()))
assert.ok(POSTS_RECRUTAMENTO.every((p) => p.length <= 500))
assert.ok(POSTS_RECRUTAMENTO.every((p) => !/garant|lucro certo|rendimento garantido/i.test(p)))
assert.ok(respostaAoInteressado('ana').startsWith('@ana'))
assert.equal(ehInteressado('EU', 'ricardogarciapt', 'ricardogarciapt'), false)
assert.equal(ehInteressado('EU', 'ana', 'ricardogarciapt'), true)
assert.equal(ehInteressado('  ', 'ana', 'ricardogarciapt'), false)
console.log('threads/recrutamento ok')
