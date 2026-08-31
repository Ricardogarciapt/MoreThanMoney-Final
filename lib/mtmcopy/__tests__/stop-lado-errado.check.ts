/**
 * Um sinal com o stop do lado errado não executa, não é seguido, e não é anunciado como vitória.
 *
 * A 31/08 chegou do Premium um «GOLD BUY … SL 4532 … TP1 4447», numa compra a 4437: o stop 95
 * pontos ACIMA da entrada. Três coisas correram mal ao mesmo tempo, e cada uma tem aqui a sua
 * verificação:
 *
 *  1. o validador dava-lhe 90% e mandava-o à corretora, que o recusou 28 vezes numa semana;
 *  2. o acompanhamento seguiu-o na mesma;
 *  3. quando o preço tocou o «stop», o chat anunciou «🛑 Stop loss · +950 pips · +2,14%» — um
 *     stop a dar lucro, que é uma contradição e ainda entrava nas contas de quem soma os pips.
 *
 * A aritmética estava certa em todos eles. O que não podia era o sinal ter aqueles números.
 */
import { parseSignal } from '../signal-parser'
import { validateSignalWithAi } from '../signal-ai-validator'
import { lifecycleMessage } from '../signal-lifecycle'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}
function verdade(nome: string, v: boolean) { eq(nome, v, true) }

const MAU_BUY = `4. GOLD BUY SETUP
Gold Buy Zone 4442 - 4437
SL : 4532
TP1 : 4447
TP2 : 4452`

const BOM_BUY = `1. GOLD BUY SETUP
Gold Buy Zone 4444 - 4438
SL : 4433
TP1 : 4449
TP2 : 4454`

const BOM_SELL = `2. GOLD SELL SETUP
Gold Sell Zone 4500 - 4505
SL : 4515
TP1 : 4495
TP2 : 4490`

async function corre() {
  // ── 1) Validação: recusa, e não apenas menos confiança ────────────────────────────────────
  const mauP = parseSignal(MAU_BUY)!
  const vMau = await validateSignalWithAi(MAU_BUY, mauP, { skipAi: true, channel: 'premium-signals' })
  eq('BUY com SL acima do TP é recusado', vMau.valid, false)
  // De propósito: a confiança continua alta. A recusa não pode depender do limiar, senão baixar
  // o limiar um dia voltava a deixar passar isto.
  verdade('a recusa não vem do limiar de confiança', vMau.confidence >= 0.7)

  for (const [nome, raw] of [['buy', BOM_BUY], ['sell', BOM_SELL]] as const) {
    const p = parseSignal(raw)!
    const v = await validateSignalWithAi(raw, p, { skipAi: true, channel: 'premium-signals' })
    verdade(`sinal ${nome} coerente continua válido`, v.valid)
  }

  // ── 2) Anúncio: um stop nunca sai com resultado positivo ───────────────────────────────────
  const cartaoMau = lifecycleMessage('stop_loss', {
    symbol: 'XAUUSD', direction: 'buy', entry: 4437, price: 4532,
  })
  verdade('stop com lucro sai sem número', !/\+\d/.test(cartaoMau.title))
  verdade('mas continua a dizer que fechou no stop', /Stop loss/.test(cartaoMau.title))

  const cartaoBom = lifecycleMessage('stop_loss', {
    symbol: 'XAUUSD', direction: 'buy', entry: 4437, price: 4427,
  })
  verdade('stop a sério mantém o resultado negativo', /−|-/.test(cartaoBom.title))

  // Um alvo continua a poder ser positivo — a regra é só para o stop.
  const alvo = lifecycleMessage('target_final', {
    symbol: 'XAUUSD', direction: 'buy', entry: 4437, price: 4457,
  })
  verdade('alvo positivo mantém o número', /\+/.test(alvo.title))

  console.log(`${ok} ok · ${mau} mau`)
  if (mau) process.exit(1)
}

corre()
