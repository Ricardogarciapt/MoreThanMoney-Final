/**
 * UM DESFECHO POR TRADE — a escada não deixa descer um degrau.
 *
 * Havia três escritores em `chat_messages.outcome` e nenhum sabia dos outros. O leitor de texto
 * corria num cron de 5 em 5 minutos e era quase sempre o último a falar, por isso escrevia por
 * cima do motor de preço. Medido a 2026-09-29: 289 sinais com dois números, 276 a discordar —
 * 100 anunciados como ganho (+95,4 pips de média) em linhas que o preço fechou no stop sem uma
 * única parcial, e 16 anunciados como ganho em ideias que nunca encheram a entrada.
 *
 * O que se tranca aqui é a REGRA, não a arrumação: mestre > tracker > texto, e o histórico sem
 * origem vale zero para se poder curar sozinho.
 *
 *   npx tsx lib/mtmcopy/__tests__/desfecho-unico.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { grauDoDesfecho, podeEscrever } from '../desfecho-unico'

let ok = 0
const caso = (nome: string, f: () => void) => { f(); ok++; console.log(`  ok  ${nome}`) }

// ── A escada ────────────────────────────────────────────────────────────────────────────────
caso('o texto NÃO escreve por cima do preço — é isto que gerava os dois números', () => {
  assert.equal(podeEscrever('texto', { label: 'Stop loss', origem: 'tracker' }), false)
})

caso('o texto NÃO escreve por cima da mestre', () => {
  assert.equal(podeEscrever('texto', { label: 'Alvo final', origem: 'mestre' }), false)
})

caso('o preço NÃO escreve por cima da mestre — o fecho real manda', () => {
  assert.equal(podeEscrever('tracker', { label: 'Alvo final', origem: 'mestre' }), false)
})

caso('o preço escreve por cima do texto', () => {
  assert.equal(podeEscrever('tracker', { label: '+95 pips', origem: 'texto' }), true)
})

caso('a mestre escreve por cima de qualquer um', () => {
  for (const origem of ['texto', 'tracker', 'mestre']) {
    assert.equal(podeEscrever('mestre', { origem }), true, `mestre vs ${origem}`)
  }
})

caso('cada motor pode corrigir-se a si próprio (parcial hoje, alvo final amanhã)', () => {
  assert.equal(podeEscrever('tracker', { origem: 'tracker' }), true)
  assert.equal(podeEscrever('texto', { origem: 'texto' }), true)
})

// ── O histórico ─────────────────────────────────────────────────────────────────────────────
caso('desfecho sem origem vale zero — o histórico antigo deixa-se corrigir', () => {
  assert.equal(grauDoDesfecho({ label: 'Stop loss', pips: 95 }), 0)
  assert.equal(grauDoDesfecho(null), 0)
  assert.equal(grauDoDesfecho(undefined), 0)
  assert.equal(podeEscrever('texto', { label: 'Stop loss', pips: 95 }), true)
})

caso('uma origem desconhecida não ganha degraus por ser desconhecida', () => {
  assert.equal(grauDoDesfecho({ origem: 'seja-o-que-for' }), 0)
  assert.equal(grauDoDesfecho({ origem: 42 }), 0)
})

// ── E o que impede o regresso dos dois números ───────────────────────────────────────────────
/**
 * A guarda estrutural: enquanto houver um motor a escrever direito ao campo, a escada não
 * serve de nada — foi assim que isto começou. Só `desfecho-unico.ts` pode tocar no `outcome`.
 */
caso('nenhum motor escreve `outcome` fora da escada', () => {
  const suspeitos = [
    'lib/mtmcopy/signal-tracker.ts',
    'lib/mtmcopy/signal-outcomes.ts',
    'lib/mestres/servidor/publicar.ts',
  ]
  for (const f of suspeitos) {
    const src = readFileSync(f, 'utf8')
    const direito = /\.update\(\s*\{\s*outcome\s*:/.test(src)
    assert.equal(direito, false, `${f} escreve outcome directo — tem de passar por gravarDesfechoUnico`)
    assert.match(src, /gravarDesfechoUnico/, `${f} devia gravar o desfecho pela escada`)
  }
})

console.log(`\n${ok} passaram`)
