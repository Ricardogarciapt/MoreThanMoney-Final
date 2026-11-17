// Testes da validação dos pedidos ao motor de ativos. Corre: npx tsx --test lib/estudio/geracao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motorOnline, nomeDoAtivo, saidaDe, validarPedido } from './geracao'

const ID = '11111111-2222-3333-4444-555555555555'
const ok = (b: Record<string, unknown>) => {
  const r = validarPedido(b)
  if ('erro' in r) throw new Error(r.erro)
  return r.pedido
}
const erro = (b: Record<string, unknown>) => {
  const r = validarPedido(b)
  assert.ok('erro' in r, `esperava erro para ${JSON.stringify(b)}`)
  return (r as { erro: string }).erro
}

test('tipo inválido ou sem imagem é recusado', () => {
  erro({ tipo: 'xpto' })
  assert.match(erro({ tipo: 'mover' }), /imagem/)
  assert.match(erro({ tipo: 'cena', ativo_id: ID }), /cenário/)
  assert.match(erro({ tipo: 'voz' }), /texto/)
  assert.match(erro({ tipo: 'falar', ativo_id: ID }), /texto/)
  erro({ tipo: 'mover', imagem_url: 'http://inseguro.pt/a.png' })
})

test('pedido dos reels diários fica com os valores certos', () => {
  const p = ok({ tipo: 'mover', imagem_url: 'https://x.pt/a.png', prompt: 'o Ricardo sorri', duracao_s: 4, movimento: 'dolly-in', origem: 'reels-diarios' })
  assert.equal(p.params.aspecto, '9:16')
  assert.equal(p.params.duracao_s, 4)
  assert.equal(p.params.movimento, 'dolly-in')
  assert.equal(p.origem, 'reels-diarios')
  assert.equal(p.ensaio, false)
  assert.ok(Number.isInteger(p.params.seed))
})

test('limites e omissões', () => {
  assert.equal(ok({ tipo: 'mover', ativo_id: ID, duracao_s: 60 }).params.duracao_s, 8)
  assert.equal(ok({ tipo: 'falar', ativo_id: ID, texto: 'olá', duracao_s: 60 }).params.duracao_s, 15)
  assert.equal(ok({ tipo: 'mover', ativo_id: ID, movimento: 'voar' }).params.movimento, 'dolly-in')
  assert.equal(ok({ tipo: 'falar', ativo_id: ID, texto: 'olá' }).params.movimento, 'static')
  const a = ok({ tipo: 'angulo', ativo_id: ID }).params
  assert.deepEqual([a.azimute, a.elevacao, a.distancia], ['front-right', 'eye', 'medium'])
  assert.equal(ok({ tipo: 'voz', texto: 'olá', seed: 7 }).params.seed, 7)
  assert.equal(ok({ tipo: 'voz', texto: 'olá', ensaio: true }).ensaio, true)
})

test('saídas, nomes e pulso do motor', () => {
  assert.equal(saidaDe('cena').ext, 'png')
  assert.equal(saidaDe('voz').tipoAtivo, 'audio')
  assert.equal(saidaDe('falar').mime, 'video/mp4')
  assert.match(nomeDoAtivo('cena', { aspecto: '9:16', prompt: 'estúdio de podcast' }), /^IA · cena · estúdio de podcast/)
  const agora = Date.now()
  assert.equal(motorOnline(new Date(agora - 60_000).toISOString(), agora), true)
  assert.equal(motorOnline(new Date(agora - 10 * 60_000).toISOString(), agora), false)
  assert.equal(motorOnline(null), false)
})
