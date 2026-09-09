/**
 * O LOTE DA GOLDEN ASTRO.
 *
 * A perna recebia `lot_value` do perfil da rota e passava-o como lote. Nas rotas MTM o
 * `lot_mode` é 'risk_percent' e o `lot_value` é 0,5 — meio por cento do saldo. Lido como
 * lote são MEIO LOTE de ouro: 5 USD por pip, 500 USD de risco no stop de 100 pips do
 * trader, e a mesma meia posição quer a conta tenha 500 USD quer tenha 50.000.
 *
 * Aqui tranca-se a aritmética que passou a valer: 0,5% de um saldo, dividido pela distância
 * ao stop. Nunca chegou a abrir uma ordem porque a conta está a zero — mas abria à primeira.
 */
import { computeLotSize } from '../lot-sizing'

let ok = 0, mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

// Setup real (id 260): venda a 4400,09 com stop 4405,09 → 5,00 de distância = 100 pips.
const sinal = {
  symbol: 'XAUUSD', direction: 'sell' as const, entry: 4400.09, sl: 4405.09,
  tp: [4392.59], orderType: 'market' as const, raw: '',
}
const risco = { lot_mode: 'risk_percent' as const, lot_value: 0.5 }

// 0,5% de 10.000 = 50 USD. Em ouro 0,01 lote vale 0,10 USD/pip → 100 pips = 10 USD/lote-cêntimo.
// 50 / (100 pips × 10 USD por lote inteiro) → 0,05 lotes.
const l10k = computeLotSize(risco as never, sinal as never, 10000)
eq('10.000 USD → não é meio lote', l10k === 0.5, false)
eq('10.000 USD → lote pequeno', l10k <= 0.1, true)
eq('10.000 USD → lote positivo', l10k > 0, true)

// Metade do saldo → metade do lote (é a propriedade que interessa).
const l5k = computeLotSize(risco as never, sinal as never, 5000)
eq('metade do saldo, metade do lote', Math.abs(l5k * 2 - l10k) < 0.02, true)

// Conta pequena continua a abrir, no mínimo do broker — nunca meio lote.
const l500 = computeLotSize(risco as never, sinal as never, 500)
eq('500 USD → nunca meio lote', l500 < 0.5, true)
eq('500 USD → pelo menos o mínimo', l500 >= 0.01, true)

// O valor cru NÃO é o lote: com 0,5 como percentagem, nenhum saldo realista dá 0,5 lotes.
eq('0,5 nunca sai como 0,5 lotes (10k)', l10k, l10k < 0.5 ? l10k : NaN)

console.log(mau === 0 ? `✓ ${ok} verificações passaram` : `${ok} ok, ${mau} FALHARAM`)
process.exit(mau === 0 ? 0 : 1)
