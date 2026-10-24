import assert from 'node:assert/strict'
import { DESTINO_PREMIUM, rotaParaRelay, validarRota } from './rotas'

const ok = validarRota({ nome: 'Sinais Ouro', fonte: '-1003671953091', destino: '-1004362819270', filtro: 'all' })
assert.ok(ok.ok)
assert.equal(ok.ok && ok.rota.nome, 'sinais-ouro')
assert.equal(validarRota({ nome: 'x', fonte: '-1001', destino: '-1002' }).ok, false)
assert.equal(validarRota({ nome: 'abc', fonte: '@canal_bom', destino: '-1004362819270' }).ok, true)
assert.equal(validarRota({ nome: 'abc', fonte: '-1003671953091', destino: DESTINO_PREMIUM, app_only: true }).ok, false)
assert.equal(validarRota({ nome: 'abc', fonte: '-1003671953091', destino: '-1003671953091' }).ok, false)
assert.equal(validarRota({ nome: 'abc', fonte: '-1003671953091', destino: '-1004362819270', filtro: 'nada' }).ok, false)

const r = rotaParaRelay({
  id: 'x', relay: 'gmi-relay', nome: 'signal-master-elite', fonte: '-1003671953091', destino: DESTINO_PREMIUM,
  filtro: 'gold', cabecalho: null, app_only: false, activa: true, so_novas: false, notas: null, actualizado_em: '',
})
assert.deepEqual(r, { name: 'signal-master-elite', source: -1003671953091, dest: DESTINO_PREMIUM, filter: 'gold', enabled: true, so_novas: false })
console.log('rotas: ok')
