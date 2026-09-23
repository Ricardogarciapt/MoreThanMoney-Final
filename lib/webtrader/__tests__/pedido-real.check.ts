import assert from 'node:assert/strict'
import { descricaoDaOrdemReal, ordemParaCorretora, type PedidoRascunho } from '../pedido-real'
import { CAPACIDADES } from '../corretoras/tipos'

/**
 * A tradução do rascunho para uma ordem REAL. O que interessa provar é o que NÃO passa: numa conta
 * da corretora, uma OCO ou um trailing têm de parar aqui com uma mensagem — nunca sair em silêncio
 * como uma ordem simples com dinheiro a sério.
 * Correr: npx tsx lib/webtrader/__tests__/pedido-real.check.ts
 */
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

const REAL = CAPACIDADES.tradelocker
const SIM = CAPACIDADES.mtmfunded
const base: PedidoRascunho = { accao: 'abrir', direcao: 'buy', volume: 0.1, sl: null, tp: null }
const ok = (r: ReturnType<typeof ordemParaCorretora>) => { assert.equal(r.ok, true, r.ok ? '' : r.erro); return r as Extract<typeof r, { ok: true }> }
const falha = (r: ReturnType<typeof ordemParaCorretora>) => { assert.equal(r.ok, false); return (r as Extract<typeof r, { ok: false }>).erro }

caso('mercado: «abrir» vira tipo mercado, sem preço', () => {
  const r = ok(ordemParaCorretora({ ...base, sl: 1900, tp: 2000 }, 'XAUUSD', REAL))
  assert.deepEqual(r.corpo, { symbol: 'XAUUSD', direcao: 'buy', tipo: 'mercado', volume: 0.1, preco: null, sl: 1900, tp: 2000 })
  assert.equal(r.descricao, 'Comprar 0.1 XAUUSD a mercado')
})

caso('pendente: limit e stop levam o preço', () => {
  const r = ok(ordemParaCorretora({ ...base, accao: 'pendente', tipo: 'limit', preco: 1950, direcao: 'sell' }, 'XAUUSD', REAL))
  assert.equal(r.corpo.tipo, 'limit')
  assert.equal(r.corpo.preco, 1950)
  assert.equal(r.descricao, 'Vender 0.1 XAUUSD limit @ 1950')
  assert.equal(ok(ordemParaCorretora({ ...base, accao: 'pendente', tipo: 'stop', preco: 2010 }, 'XAUUSD', REAL)).corpo.tipo, 'stop')
})

caso('pendente sem preço não sai (sairia a mercado, que é outra ordem)', () => {
  assert.match(falha(ordemParaCorretora({ ...base, accao: 'pendente', tipo: 'limit' }, 'XAUUSD', REAL)), /Preço/)
})

caso('OCO numa conta real é recusada, não reduzida a uma perna', () => {
  const p: PedidoRascunho = { ...base, accao: 'pendente', tipo: 'limit', preco: 1950, oco: { direcao: 'sell', tipo: 'stop', preco: 1900 } }
  assert.match(falha(ordemParaCorretora(p, 'XAUUSD', REAL)), /OCO/)
  // Na conta MTM Funded a mesma ordem passa (o motor simulado sabe fazer OCO).
  assert.equal(ordemParaCorretora(p, 'XAUUSD', SIM).ok, true)
})

caso('gestão automática pedida é recusada numa conta real; um objecto vazio não é pedido nenhum', () => {
  assert.match(falha(ordemParaCorretora({ ...base, gestao: { trailing_pips: 30 } }, 'XAUUSD', REAL)), /gestão automática/i)
  assert.equal(ordemParaCorretora({ ...base, gestao: {} }, 'XAUUSD', REAL).ok, true)
  assert.equal(ordemParaCorretora({ ...base, gestao: null }, 'XAUUSD', REAL).ok, true)
  assert.equal(ordemParaCorretora({ ...base, gestao: { trailing_pips: null, be_pips: false } }, 'XAUUSD', REAL).ok, true)
  assert.equal(ordemParaCorretora({ ...base, gestao: { trailing_pips: 30 } }, 'XAUUSD', SIM).ok, true)
})

caso('números impossíveis param aqui', () => {
  assert.match(falha(ordemParaCorretora({ ...base, volume: 0 }, 'XAUUSD', REAL)), /Volume/)
  assert.match(falha(ordemParaCorretora({ ...base, volume: Number.NaN }, 'XAUUSD', REAL)), /Volume/)
  assert.match(falha(ordemParaCorretora({ ...base, sl: Number.NaN }, 'XAUUSD', REAL)), /SL/)
  assert.match(falha(ordemParaCorretora({ ...base, tp: Number.POSITIVE_INFINITY }, 'XAUUSD', REAL)), /TP/)
  assert.match(falha(ordemParaCorretora(base, '', REAL)), /símbolo/i)
})

caso('uma plataforma sem limit recusa a pendente em vez de a enviar a mercado', () => {
  const semLimit = { ...REAL, limit: false }
  assert.match(falha(ordemParaCorretora({ ...base, accao: 'pendente', tipo: 'limit', preco: 1950 }, 'XAUUSD', semLimit)), /não aceita ordens limit/)
})

caso('descrição: é o texto que a confirmação mostra antes de mexer em dinheiro real', () => {
  assert.equal(descricaoDaOrdemReal({ symbol: 'EURUSD', direcao: 'sell', tipo: 'mercado', volume: 1, preco: null, sl: null, tp: null }), 'Vender 1 EURUSD a mercado')
})

console.log(`\n${n} casos ok — tradução do rascunho para ordem real`)
