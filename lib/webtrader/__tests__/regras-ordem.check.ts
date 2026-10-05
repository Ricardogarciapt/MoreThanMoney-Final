/**
 * AS REGRAS DE UMA ORDEM, UMA VEZ — a guarda de lib/webtrader/regras-ordem.ts.
 *
 *  1. Volume: o CASO MAU é 0,015 com passo 0,01 — estrito (ticket real) recusa, não estrito
 *     (rascunho/motor) arredonda a 0,02; abaixo do mínimo e acima do máximo recusam; 0,3 em
 *     passos de 0,1 sai 0,3 (sem lixo de vírgula flutuante); passo 0,001 respeita 3 casas.
 *  2. Níveis: SL do lado errado dá a MESMA frase no cliente e no servidor.
 *  3. Pendente: uma buy limit acima do ask «já dispara» e recusa-se com a frase do servidor; sem
 *     preço vivo não se inventa veredicto.
 *  4. Num clique: um `executar` aninhado não confirma, não avisa, não conta; o de fora, com o
 *     interruptor desligado e `confirmar: true`, pede confirmação UMA vez.
 *  5. Pelo código: matematica.ts, ordens.ts, corretoras/tipos.ts, ticket.ts e rascunho-ordem.tsx
 *     chamam a regra partilhada; um-clique.tsx decide por `decidirUmClique` com a profundidade;
 *     grafico-leve.tsx não inicia acções com outra a correr.
 *
 *   npx tsx lib/webtrader/__tests__/regras-ordem.check.ts
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  casasDoPasso, decidirUmClique, erroDaPendente, erroDosNiveis, mensagemVolumeForaDosLimites, normalizarVolumeRegra,
  pendenteJaDispara, validarOrdem,
} from '../regras-ordem'
import { normalizarVolume, validarNiveis, pendenteDispara, type Simbolo } from '@/lib/mtmfunded/simulado/matematica'
import { validarPendente } from '@/lib/mtmfunded/simulado/ordens'
import { validarTicketReal } from '../ticket'
import { validarPedido } from '../corretoras/tipos'

let n = 0
const teste = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }
const raiz = path.resolve(__dirname, '..', '..', '..')
const ler = (p: string) => fs.readFileSync(path.join(raiz, p), 'utf8')

console.log('\nREGRAS DE ORDEM PARTILHADAS\n')

const R = { min: 0.01, max: 100, passo: 0.01 }

teste('volume: 0,015 — estrito recusa, não estrito arredonda a 0,02', () => {
  const e = normalizarVolumeRegra(0.015, R, { estrito: true })
  assert.equal(e.ok, false)
  assert.equal(!e.ok && e.motivo, 'fora_do_passo')
  const r = normalizarVolumeRegra(0.015, R)
  assert.deepEqual(r, { ok: true, volume: 0.02 })
  assert.equal(normalizarVolumeRegra(0.001, R).ok, false, 'abaixo do mínimo')
  assert.equal(normalizarVolumeRegra(100.01, R).ok, false, 'acima do máximo')
  assert.equal(normalizarVolumeRegra(0, R).ok, false)
  assert.equal(normalizarVolumeRegra(Number.NaN, R).ok, false)
  assert.deepEqual(normalizarVolumeRegra(0.3, { min: 0.1, max: 100, passo: 0.1 }), { ok: true, volume: 0.3 })
  assert.deepEqual(normalizarVolumeRegra(0.1234, { min: 0.001, max: 100, passo: 0.001 }), { ok: true, volume: 0.123 })
  assert.equal(casasDoPasso(0.01), 2); assert.equal(casasDoPasso(1), 0); assert.equal(casasDoPasso(0.001), 3)
  assert.equal(normalizarVolumeRegra(5, { min: 0.01, max: 0, passo: 0.01 }).ok, true, 'max 0 = sem tecto (ticket real)')
})

teste('níveis: a mesma frase no cliente e no servidor', () => {
  assert.equal(erroDosNiveis('buy', 2650, 2660, null), 'numa compra o stop fica abaixo do preço')
  assert.equal(erroDosNiveis('sell', 2650, 2640, null), 'numa venda o stop fica acima do preço')
  assert.equal(erroDosNiveis('buy', 2650, null, 2640), 'numa compra o alvo fica acima do preço')
  assert.equal(erroDosNiveis('sell', 2650, null, 2660), 'numa venda o alvo fica abaixo do preço')
  assert.equal(erroDosNiveis('buy', 2650, 2640, 2660), null)
  assert.equal(validarNiveis('buy', 2650, 2660, null), erroDosNiveis('buy', 2650, 2660, null), 'matematica delega')
  assert.throws(() => validarPedido({ symbol: 'XAUUSD', direcao: 'buy', volume: 0.1, tipo: 'limit', preco: 2400, sl: 2410 }), /stop fica abaixo/)
})

teste('pendente: já dispara → recusa com a frase do servidor; sem preço vivo não se decide', () => {
  const p = { bid: 2649.8, ask: 2650 }
  assert.equal(pendenteJaDispara('buy', 'limit', 2660, p), true)
  assert.equal(pendenteJaDispara('buy', 'limit', 2640, p), false)
  assert.equal(pendenteJaDispara('sell', 'stop', 2640, p), false, 'sell stop abaixo do bid espera')
  assert.equal(pendenteJaDispara('sell', 'stop', 2660, p), true, 'sell stop acima do bid já disparava')
  assert.equal(erroDaPendente('buy', 'limit', 2660, p), 'uma buy limit tem de ficar abaixo do preço atual')
  assert.equal(erroDaPendente('buy', 'stop', 2640, p), 'uma buy stop tem de ficar acima do preço atual')
  assert.equal(erroDaPendente('buy', 'limit', 2660, null), null)
  assert.equal(erroDaPendente('buy', 'limit', 0, p), 'preço da ordem inválido')
  assert.equal(pendenteDispara('buy', 'limit', 2660, { symbol: 'XAUUSD', ...p }), true, 'matematica delega')
  const s: Simbolo = { symbol: 'XAUUSD', classe: 'metal', digits: 2, contract_size: 100, pip_size: 0.1, spread_pontos: 0, comissao_lote: 0, volume_min: 0.01, volume_step: 0.01, volume_max: 100, alavancagem_max: 100 }
  const v = validarPendente(s, 'buy', 'limit', 0.1, 2660, null, null, { symbol: 'XAUUSD', ...p })
  assert.equal(!v.ok && v.erro, 'uma buy limit tem de ficar abaixo do preço atual')
  assert.equal(normalizarVolume(s, 0.015), 0.02)
  const t = validarPendente(s, 'buy', 'limit', 0.001, 2640, null, null, null)
  assert.equal(!t.ok && t.erro, mensagemVolumeForaDosLimites({ min: 0.01, max: 100, passo: 0.01 }))
})

teste('validarOrdem: a mesma função decide tudo o que não precisa da conta', () => {
  const base = { regraVolume: R, sl: null, tp: null, mercado: { bid: 2649.8, ask: 2650 } }
  assert.deepEqual(validarOrdem({ ...base, direcao: 'buy', tipo: 'mercado', volume: 0.1, preco: null, sl: 2640, tp: 2660 }), { ok: true, volume: 0.1, referencia: 2650 })
  const sl = validarOrdem({ ...base, direcao: 'buy', tipo: 'mercado', volume: 0.1, preco: null, sl: 2660 })
  assert.equal(!sl.ok && sl.campo, 'sl')
  const pend = validarOrdem({ ...base, direcao: 'buy', tipo: 'limit', volume: 0.1, preco: 2660 })
  assert.equal(!pend.ok && pend.campo, 'preco')
  const vol = validarOrdem({ ...base, direcao: 'buy', tipo: 'mercado', volume: 0.001, preco: null })
  assert.equal(!vol.ok && vol.erro, mensagemVolumeForaDosLimites(R))
  assert.deepEqual(validarOrdem({ ...base, mercado: null, direcao: 'sell', tipo: 'mercado', volume: 1, preco: null, sl: 1, tp: 2 }), { ok: true, volume: 1, referencia: null }, 'sem preço vivo a mercado não há referência: a corretora valida')
  assert.equal(validarTicketReal({ tipo: 'mercado', volume: '0,015', preco: '', sl: '', tp: '', volumeMin: 0.01, passo: 0.01 }).ok, false, 'ticket real estrito')
})

teste('num clique: aninhado não confirma nem avisa; de fora, desligado + confirmar = uma confirmação', () => {
  assert.deepEqual(decidirUmClique({ ligado: false, confirmar: true, aninhado: true }), { pedirConfirmacao: false, avisar: false, protegerRepeticao: false })
  assert.deepEqual(decidirUmClique({ ligado: false, confirmar: true, aninhado: false }), { pedirConfirmacao: true, avisar: true, protegerRepeticao: true })
  assert.deepEqual(decidirUmClique({ ligado: false, confirmar: false, aninhado: false }), { pedirConfirmacao: false, avisar: true, protegerRepeticao: true })
  assert.deepEqual(decidirUmClique({ ligado: true, confirmar: true, aninhado: false }), { pedirConfirmacao: false, avisar: true, protegerRepeticao: true })
})

teste('pelo código: todos chamam a regra partilhada', () => {
  assert.match(ler('lib/mtmfunded/simulado/matematica.ts'), /normalizarVolumeRegra\(volume/)
  assert.match(ler('lib/mtmfunded/simulado/ordens.ts'), /erroDaPendente\(direcao, tipo, nivel, preco\)/)
  assert.match(ler('lib/webtrader/corretoras/tipos.ts'), /erroDosNiveis\(p\.direcao, ref, sl, tp\)/)
  assert.match(ler('lib/webtrader/ticket.ts'), /normalizarVolumeRegra\(volume, \{ min: c\.volumeMin, max: 0, passo: c\.passo \}, \{ estrito: true \}\)/)
  const rascunho = ler('components/funded/rascunho-ordem.tsx')
  assert.match(rascunho, /erroDaPendente\(r\.lado, r\.tipo, r\.entrada/)
  assert.match(rascunho, /mensagemVolumeForaDosLimites\(/)
  assert.doesNotMatch(rascunho, /tem de ficar \$\{lado\} do preço atual/, 'a frase deixou de estar copiada no cliente')
  const umClique = ler('components/funded/um-clique.tsx')
  assert.match(umClique, /decidirUmClique\(\{ ligado, confirmar: opcoes\.confirmar, aninhado: profundidade\.current > 0 \}\)/)
  assert.match(umClique, /profundidade\.current\+\+/)
  assert.match(umClique, /profundidade\.current--/)
  assert.match(ler('components/funded/grafico-leve.tsx'), /umClique\.ocupado \? Promise\.reject\(new AccaoCancelada\(\)\)/)
  // O rascunho continua a dizer «já confirmado» — a confirmação da conta real fica no executar de fora.
  assert.match(rascunho, /\{ confirmar: false, digitos: s\.digits \}/)
})

console.log(`\n${n} testes ok\n`)
