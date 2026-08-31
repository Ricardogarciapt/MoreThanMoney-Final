/**
 * A perna Gold Did: 0,02 lotes que saem em duas metades de 0,01.
 *
 * O número não é arbitrário. O lote mínimo do broker é 0,01, por isso uma posição de 0,01 não
 * tem parcial possível — metade seria 0,005, que a corretora recusa, e a trade ia inteira até ao
 * fim. Com 0,02 há exatamente duas saídas de 0,01: uma no primeiro alvo, outra no segundo.
 *
 * Se alguém mexer no lote ou nas percentagens sem pensar nisto, é aqui que rebenta.
 */
import { GOLDDID_LOTE, GOLDDID_SAIDAS, CANONICAL_GOLDDID_ACCOUNT_ID, CONTAS_MOTOR_TEMPO_REAL } from '../provider-constants'
import { buildPremiumSingleOrder } from '../premium-single'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

const LOTE_MINIMO = 0.01
const arred = (n: number) => Math.round(n * 100) / 100

eq('lote da perna', GOLDDID_LOTE, 0.02)
eq('as saídas somam 100', GOLDDID_SAIDAS.tp1 + GOLDDID_SAIDAS.tp2 + GOLDDID_SAIDAS.tp3, 100)

// O que interessa mesmo: cada saída dá um lote que o broker aceita.
const saida1 = arred(GOLDDID_LOTE * (GOLDDID_SAIDAS.tp1 / 100))
const saida2 = arred(GOLDDID_LOTE * (GOLDDID_SAIDAS.tp2 / 100))
eq('Exit 1 fecha 0,01', saida1, LOTE_MINIMO)
eq('Exit 2 fecha 0,01', saida2, LOTE_MINIMO)
eq('as duas saídas fecham a posição toda', arred(saida1 + saida2), GOLDDID_LOTE)

// A conta tem de ser visitada pelo motor, senão não há parciais, BE nem trailing.
eq('a conta está no motor de preço', CONTAS_MOTOR_TEMPO_REAL.includes(CANONICAL_GOLDDID_ACCOUNT_ID), true)
// A conta antiga foi apagada na MetaApi (404) — apontar para lá mandava ordens para o vazio.
eq('não é a conta apagada', CANONICAL_GOLDDID_ACCOUNT_ID === '4dacaf5a-2ea0-4236-b630-9acd2da446d1', false)

// A ordem que se constrói de facto.
const plano = buildPremiumSingleOrder(
  { symbol: 'XAUUSD', direction: 'buy', entry: 4400, sl: 4390, tp: [4410, 4420, 4430], orderType: 'market', raw: '' },
  GOLDDID_LOTE, GOLDDID_SAIDAS, null, { strategyTag: 'Gold Did' },
)
eq('a ordem sai com 0,02', plano?.lot, 0.02)
eq('reparte 50/50', `${plano?.exitPcts.tp1}/${plano?.exitPcts.tp2}`, '50/50')
// O TP da ordem é rede de segurança no ÚLTIMO alvo — não fecha cedo por cima das parciais.
eq('TP de segurança no último alvo', plano?.takeProfit, 4430)
eq('o comentário identifica a estratégia', /gold did/i.test(plano?.comment ?? ''), true)

console.log(`${ok} ok · ${mau} mau`)
if (mau) process.exit(1)
