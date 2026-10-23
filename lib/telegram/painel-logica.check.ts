import assert from 'node:assert/strict'
import { agregarRotas, estadoDoPulso } from './painel-logica'

const agora = Date.parse('2026-10-23T16:00:00Z')
assert.equal(estadoDoPulso(null, agora), 'sem-pulso')
assert.equal(estadoDoPulso('2026-10-23T15:55:00Z', agora), 'vivo')
assert.equal(estadoDoPulso('2026-10-23T15:40:00Z', agora), 'atrasado')

const rotas = agregarRotas(
  [
    { source_chat_id: 'a', target_chat_id: 'p', status: 'sent', created_at: '2026-10-23T13:00:00Z', error: null },
    { source_chat_id: 'a', target_chat_id: 'p', status: 'sent', created_at: '2026-10-20T13:00:00Z', error: null },
    { source_chat_id: 'a', target_chat_id: 'p', status: 'error', created_at: '2026-10-22T13:00:00Z', error: 'Bad Request' },
    { source_chat_id: 'b', target_chat_id: 'p', status: 'sent', created_at: '2026-10-01T13:00:00Z', error: null },
  ],
  new Map([['p', 'Premium']]),
  agora,
)
assert.equal(rotas.length, 2)
assert.deepEqual(
  { f: rotas[0].fonte, d24: rotas[0].publicadas24h, d7: rotas[0].publicadas7d, falhas: rotas[0].falhas7d, erro: rotas[0].ultimoErro, nome: rotas[0].destinoNome, dias: rotas[0].diasParada },
  { f: 'a', d24: 1, d7: 2, falhas: 1, erro: 'Bad Request', nome: 'Premium', dias: 0 },
)
assert.equal(rotas[1].diasParada, 22)
console.log('painel-logica: ok')
