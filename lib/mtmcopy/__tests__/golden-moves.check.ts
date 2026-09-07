/**
 * GOLDEN MOVES — as duas camadas, e o que separa "break-even" de "fechar a perder".
 *
 * O sinal de exemplo é o que o Ricardo mandou:
 *   I'm selling XAUUSD / 4411-4415 / TP1..TP4 / SL 4419
 *
 * Numa VENDA, o preço melhor é o mais ALTO: a limite vai a 4415 e a de mercado a 4411. Numa
 * COMPRA é ao contrário. Quem inverter isto transforma a ordem-limite numa ordem stop, que
 * entra a perder em vez de entrar melhor — é o erro que estes testes existem para apanhar.
 */
import { parseSignal } from '../signal-parser'
import {
  planoGoldenMoves,
  ehFecharPrimeirasEntradas,
  stopDeBreakEven,
  GOLDENMOVES_LOTE,
  GOLDENMOVES_SAIDAS,
} from '../golden-moves'
import { GOLDENMOVES_PROVIDER_ACCOUNT_ID, CONTAS_MOTOR_TEMPO_REAL } from '../provider-constants'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

const VENDA = `I'm selling  XAUUSD

4411-4415


TP1 4408
TP2 4406
TP3 4404
TP4 4400

SL 4419`

const s = parseSignal(VENDA)!
eq('lê a direção do gerúndio', s.direction, 'sell')
eq('símbolo', s.symbol, 'XAUUSD')

const p = planoGoldenMoves(s)!
eq('há plano', Boolean(p), true)
eq('camada 1 é a mercado', p.camadas[0].tipo, 'mercado')
eq('mercado no lado de baixo da zona (venda)', p.camadas[0].preco, 4411)
eq('camada 2 é a limite', p.camadas[1].tipo, 'limite')
eq('limite no preço MELHOR da venda (mais alto)', p.camadas[1].preco, 4415)
eq('stop', p.sl, 4419)
eq('alvos todos', p.tp.join(','), '4408,4406,4404,4400')
eq('lote por camada', p.camadas[0].lote, GOLDENMOVES_LOTE)

// COMPRA: o melhor preço é o mais baixo. A zona escrita ao contrário não pode inverter nada.
const compra = planoGoldenMoves({
  symbol: 'XAUUSD', direction: 'buy', entry: 4415, zone: [4411, 4415], zoneFirst: 4415,
  sl: 4405, tp: [4420],
})!
eq('compra: mercado no mais alto', compra.camadas[0].preco, 4415)
eq('compra: limite no mais baixo (melhor)', compra.camadas[1].preco, 4411)

// A mesma compra com a zona escrita pela ordem inversa dá o MESMO plano.
const compraInvertida = planoGoldenMoves({
  symbol: 'XAUUSD', direction: 'buy', entry: 4411, zone: [4411, 4415], zoneFirst: 4411,
  sl: 4405, tp: [4420],
})!
eq('a ordem em que vem escrito não manda', compraInvertida.camadas[1].preco, 4411)

// Geometrias impossíveis não abrem nada.
eq('venda com stop ABAIXO da entrada é recusada',
  planoGoldenMoves({ symbol: 'XAUUSD', direction: 'sell', entry: 4415, zone: [4411, 4415], zoneFirst: 4411, sl: 4400, tp: [] }),
  null)
eq('compra com stop ACIMA da entrada é recusada',
  planoGoldenMoves({ symbol: 'XAUUSD', direction: 'buy', entry: 4411, zone: [4411, 4415], zoneFirst: 4415, sl: 4420, tp: [] }),
  null)
eq('zona de um só preço não dá duas camadas',
  planoGoldenMoves({ symbol: 'XAUUSD', direction: 'sell', entry: 4411, zone: [4411, 4411], zoneFirst: 4411, sl: 4419, tp: [] }),
  null)
eq('sem zona não há layering',
  planoGoldenMoves({ symbol: 'XAUUSD', direction: 'sell', entry: null, zone: null, zoneFirst: null, sl: 4419, tp: [] }),
  null)

// O break-even é o preço da PRÓPRIA entrada de mercado — não o preço a que a limite encheu.
eq('BE da camada de mercado', stopDeBreakEven(p.camadas[0]), 4411)

// A mensagem de gestão.
eq('a frase do Ricardo é reconhecida',
  ehFecharPrimeirasEntradas('Close first entries now and keep highest entires risk free or secure profit'),
  true)
eq('variação com break even', ehFecharPrimeirasEntradas('close the first entries and move the rest to break even'), true)
eq('fechar tudo NÃO é isto', ehFecharPrimeirasEntradas('close all entries now'), false)
eq('só "risk free" não chega', ehFecharPrimeirasEntradas('keep it risk free'), false)
eq('texto vazio', ehFecharPrimeirasEntradas(''), false)

// Gestão: garantir o primeiro alvo, deixar correr o resto.
eq('metade sai no primeiro alvo', GOLDENMOVES_SAIDAS.tp1, 50)
eq('não fecha no segundo alvo (runner)', GOLDENMOVES_SAIDAS.tp2, 0)
eq('não fecha no terceiro alvo (runner)', GOLDENMOVES_SAIDAS.tp3, 0)
eq('a parcial é um lote válido no broker', Math.round(GOLDENMOVES_LOTE * (GOLDENMOVES_SAIDAS.tp1 / 100) * 100) / 100, 0.01)

// Sem motor não há layering: é ele que faz o BE e o trailing.
eq('a conta está no motor de tempo real', CONTAS_MOTOR_TEMPO_REAL.includes(GOLDENMOVES_PROVIDER_ACCOUNT_ID), true)

console.log(`\n${ok} passaram, ${mau} falharam`)
if (mau) process.exit(1)
