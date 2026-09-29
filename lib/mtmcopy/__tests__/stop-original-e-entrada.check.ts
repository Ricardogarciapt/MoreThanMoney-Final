/**
 * OS DOIS DEFEITOS DO ACOMPANHAMENTO, trancados.
 *
 * (a) A guarda do «stop do lado errado» comparava o stop com o PRIMEIRO ALVO e mais nada. Um
 *     stop do lado errado da ENTRADA mas ainda aquém do alvo passava inteiro. Passaram dez
 *     linhas assim, e uma foi publicada no chat como «🛑 Stop loss · +50 pips» (premium XAUUSD
 *     compra, entrada 4353, SL 4358, 01/09) — um stop a dar lucro. É o defeito de 31/08 que o
 *     comentário do ficheiro dava por resolvido: tinha-se resolvido metade.
 *
 * (b) Ao atingir o primeiro alvo o tracker fazia `update sl = entry` e o stop PUBLICADO deixava
 *     de existir na tabela — 165 linhas, 163 delas já com parcial feita. Quem fosse à tabela
 *     perguntar o risco da trade recebia zero. E sem esse número o cartão perdia a única forma
 *     de distinguir um trailing fechado em lucro de um stop impossível, que é a razão por que a
 *     guarda do ponto (a) esteve inerte no cartão desde que foi escrita.
 *
 *   npx tsx lib/mtmcopy/__tests__/stop-original-e-entrada.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stopDoLadoErrado } from '../source-risk-rules'
import { lifecycleMessage } from '../signal-lifecycle'

let ok = 0
const caso = (nome: string, f: () => void) => { f(); ok++; console.log(`  ok  ${nome}`) }

// ── (a) A geometria, medida contra a ENTRADA ────────────────────────────────────────────────
caso('o caso real de 01/09: compra 4353, SL 4358, TP1 4364 — recusado', () => {
  // Contra o TP1 este stop parecia bem (4358 < 4364). Contra a entrada, está 5 pontos acima.
  assert.ok(stopDoLadoErrado({ direction: 'buy', entry: 4353, sl: 4358, tp1: 4364 }))
})

caso('o caso de 31/08 continua recusado (stop acima do alvo)', () => {
  assert.ok(stopDoLadoErrado({ direction: 'buy', entry: 4437, sl: 4532, tp1: 4447 }))
})

caso('venda espelhada: stop ABAIXO da entrada é recusado', () => {
  assert.ok(stopDoLadoErrado({ direction: 'sell', entry: 4499, sl: 4494, tp1: 4480 }))
})

caso('stop EM CIMA da entrada não é break-even à nascença — é trade sem risco definido', () => {
  assert.ok(stopDoLadoErrado({ direction: 'buy', entry: 4400, sl: 4400, tp1: 4420 }))
})

caso('alvo do lado errado da entrada também é recusado', () => {
  assert.ok(stopDoLadoErrado({ direction: 'buy', entry: 4400, sl: 4390, tp1: 4395 }))
})

caso('um sinal são passa — a guarda não pode comer os bons', () => {
  assert.equal(stopDoLadoErrado({ direction: 'buy', entry: 4400, sl: 4390, tp1: 4410 }), null)
  assert.equal(stopDoLadoErrado({ direction: 'sell', entry: 4400, sl: 4410, tp1: 4390 }), null)
})

caso('sinal a mercado (sem entrada) verifica-se só contra o alvo', () => {
  assert.equal(stopDoLadoErrado({ direction: 'buy', entry: null, sl: 4390, tp1: 4410 }), null)
  assert.ok(stopDoLadoErrado({ direction: 'buy', entry: null, sl: 4420, tp1: 4410 }))
})

caso('sem stop não há sinal', () => {
  assert.ok(stopDoLadoErrado({ direction: 'buy', entry: 4400, sl: null, tp1: 4410 }))
})

// ── (a-bis) E o cartão deixa de poder anunciar um stop a dar lucro ───────────────────────────
caso('o tracker PASSA o slOriginal ao cartão — sem isso a guarda do cartão é decorativa', () => {
  const src = readFileSync('lib/mtmcopy/signal-tracker.ts', 'utf8')
  assert.match(src, /slOriginal:\s*linha\.sl_original/)
})

caso('com slOriginal do lado errado, o cartão do stop sai SEM número', () => {
  const mau = lifecycleMessage('stop_loss', { symbol: 'XAUUSD', direction: 'buy', entry: 4353, price: 4358, slOriginal: 4358 })
  assert.ok(!/\+\d/.test(mau.title), `saiu com número: ${mau.title}`)
  assert.match(mau.title, /Stop loss/)
})

caso('um trailing fechado em lucro MANTÉM o ganho — a guarda não pode comer lucros reais', () => {
  const bom = lifecycleMessage('stop_loss', { symbol: 'XAUUSD', direction: 'buy', entry: 4437, price: 4439, slOriginal: 4427 })
  assert.match(bom.title, /\+/)
})

// ── (b) O stop publicado não volta a ser apagado ─────────────────────────────────────────────
caso('a admissão grava o stop publicado à parte', () => {
  const src = readFileSync('lib/mtmcopy/signal-tracker.ts', 'utf8')
  assert.match(src, /sl_original:\s*p\.sl/)
})

caso('o break-even mexe em `sl` e NUNCA em `sl_original`', () => {
  const src = readFileSync('lib/mtmcopy/signal-tracker.ts', 'utf8')
  // A única ESCRITA de sl_original é a da admissão. As outras ocorrências do nome no ficheiro
  // são o tipo da interface e a LEITURA que alimenta o cartão — nenhuma delas lhe atribui valor.
  const escritas = src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /sl_original\s*:/.test(l))
    // O tipo da interface e a destruturação que RETIRA o campo (retentativa sem a coluna)
    // não atribuem valor nenhum — o que se persegue aqui são escritas.
    .filter((l) => !/sl_original\??\s*:\s*number/.test(l) && !/sl_original:\s*_ignorado/.test(l))
  assert.deepEqual(
    escritas,
    ['sl_original: p.sl,'],
    'sl_original só pode ser escrito na admissão — o break-even não lhe toca',
  )
  assert.match(src, /\.\.\.\(moveuParaBE \? \{ sl: l\.entry \} : \{\}\)/)
})

caso('a admissão aguenta a coluna ainda não existir — a ordem de deploy não é uma armadilha', () => {
  const src = readFileSync('lib/mtmcopy/signal-tracker.ts', 'utf8')
  // Sem esta retentativa, um deploy antes da migração recusava o insert inteiro (PGRST204) e o
  // motor deixava de admitir sinais — perdia-se o histórico do dia, não só o stop original.
  assert.match(src, /if \(\/sl_original\/\.test\(error\.message\)\)/)
  assert.match(src, /sl_original: _ignorado/)
})

caso('a migração 148 existe e faz o backfill sem inventar o que se perdeu', () => {
  const sql = readFileSync('supabase/migrations/148_sl_original_e_desfecho_unico.sql', 'utf8')
  assert.match(sql, /add column if not exists sl_original/)
  // Só copia onde o original ainda lá está; as linhas já estragadas ficam NULL.
  assert.match(sql, /where sl_original is null/)
  assert.match(sql, /exits_done >= 1/)
})

console.log(`\n${ok} passaram`)
