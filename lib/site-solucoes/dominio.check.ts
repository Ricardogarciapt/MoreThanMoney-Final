/**
 * Guarda do domínio do site de apresentação. Correr: npx tsx lib/site-solucoes/dominio.check.ts
 */
import assert from 'node:assert/strict'
import { decidirSolucoes, ehAnfitriaoSolucoes, anfitrioesSolucoes } from './dominio'

const lista = anfitrioesSolucoes(' Exemplo.pt , www.exemplo.pt ,')
assert.deepEqual(lista, ['exemplo.pt', 'www.exemplo.pt'])

assert.equal(ehAnfitriaoSolucoes('WWW.Exemplo.pt:443', lista), true)
assert.equal(ehAnfitriaoSolucoes('www.morethanmoney.pt', lista), false)
assert.equal(ehAnfitriaoSolucoes(null, lista), false)

// No site principal nunca mexe.
assert.deepEqual(decidirSolucoes('www.morethanmoney.pt', '/', lista), { tipo: 'nada' })
assert.deepEqual(decidirSolucoes('www.morethanmoney.pt', '/solucoes', lista), { tipo: 'nada' })

// No domínio próprio: raiz reescreve, partilhados passam, o resto volta ao www.
assert.deepEqual(decidirSolucoes('exemplo.pt', '/', lista), { tipo: 'reescrever', para: '/solucoes' })
assert.deepEqual(decidirSolucoes('exemplo.pt', '/solucoes', lista), { tipo: 'nada' })
assert.deepEqual(decidirSolucoes('exemplo.pt', '/api/apoio', lista), { tipo: 'nada' })
assert.deepEqual(decidirSolucoes('exemplo.pt', '/images/apresentacao/app-chat.jpg', lista), { tipo: 'nada' })
assert.deepEqual(decidirSolucoes('exemplo.pt', '/agendar', lista), { tipo: 'nada' })
assert.deepEqual(decidirSolucoes('exemplo.pt', '/admin', lista), { tipo: 'site-principal' })
assert.deepEqual(decidirSolucoes('exemplo.pt', '/login', lista), { tipo: 'site-principal' })

console.log('site-solucoes/dominio: ok')
