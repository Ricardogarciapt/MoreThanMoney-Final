/**
 * A ideia #18384 do Sensei (09/09) e a diferença entre perder e fechar protegido.
 *
 * Entrada 4413,34 · stop original 4405,77 (75,7 pips de risco) · alvo 1 batido a +148 pips ·
 * stop movido para a entrada · fechou a −0,8 pips. O chat anunciou «🛑 Stop loss · a trade
 * fechou no stop», e o cartão de entrada ficou «Descartado». Foi uma trade GANHA.
 */
import { stopFoiProtegido, lifecycleMessage, isTerminal } from '../signal-lifecycle'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

const E = 4413.34
const S0 = 4405.77 // 7,57 de risco = 75,7 pips no ouro

// ── O caso real ──────────────────────────────────────────────────────────────────────────
eq('#18384: fechar a −0,8 pips é stop PROTEGIDO',
  stopFoiProtegido({ direction: 'buy', entry: E, slOriginal: S0, price: 4413.26 }), true)

// ── Um stop a sério continua a ser um stop ───────────────────────────────────────────────
eq('fechar no stop original é perda',
  stopFoiProtegido({ direction: 'buy', entry: E, slOriginal: S0, price: S0 }), false)
eq('fechar a meio caminho do stop é perda',
  stopFoiProtegido({ direction: 'buy', entry: E, slOriginal: S0, price: 4409.5 }), false)

// ── Trailing em lucro ────────────────────────────────────────────────────────────────────
eq('fechar acima da entrada é protegido',
  stopFoiProtegido({ direction: 'buy', entry: E, slOriginal: S0, price: 4420 }), true)

// ── Venda: tudo espelhado ────────────────────────────────────────────────────────────────
eq('venda: fechar logo acima da entrada é protegido',
  stopFoiProtegido({ direction: 'sell', entry: 4413.34, slOriginal: 4421, price: 4413.8 }), true)
eq('venda: fechar no stop é perda',
  stopFoiProtegido({ direction: 'sell', entry: 4413.34, slOriginal: 4421, price: 4421 }), false)
eq('venda: fechar abaixo da entrada é protegido (lucro)',
  stopFoiProtegido({ direction: 'sell', entry: 4413.34, slOriginal: 4421, price: 4405 }), true)

// ── Sem dados não se inventa ─────────────────────────────────────────────────────────────
eq('sem stop original não decide', stopFoiProtegido({ direction: 'buy', entry: E, slOriginal: null, price: 4413 }), false)
eq('sem entrada não decide', stopFoiProtegido({ direction: 'buy', entry: null, slOriginal: S0, price: 4413 }), false)
eq('sem direção não decide', stopFoiProtegido({ direction: null, entry: E, slOriginal: S0, price: 4413 }), false)
eq('risco zero não decide', stopFoiProtegido({ direction: 'buy', entry: E, slOriginal: E, price: E }), false)

// ── A fronteira dos 15% ──────────────────────────────────────────────────────────────────
// 15% de 7,57 = 1,1355 no preço.
eq('dentro da tolerância', stopFoiProtegido({ direction: 'buy', entry: E, slOriginal: S0, price: E - 1.0 }), true)
eq('fora da tolerância', stopFoiProtegido({ direction: 'buy', entry: E, slOriginal: S0, price: E - 1.5 }), false)

// ── A mensagem que sai ───────────────────────────────────────────────────────────────────
const protegido = lifecycleMessage('stop_protegido', {
  symbol: 'XAUUSD', direction: 'buy', entry: E, price: 4413.26, slOriginal: S0,
})
eq('não diz "Stop loss"', protegido.text.includes('Stop loss'), false)
eq('diz "Stop protegido"', protegido.text.includes('Stop protegido'), true)
eq('não diz que fechou no stop', protegido.text.includes('fechou no stop'), false)
eq('explica o break-even', protegido.text.includes('break-even'), true)
eq('diz que não houve perda', protegido.text.includes('não houve perda'), true)

const lucro = lifecycleMessage('stop_protegido', {
  symbol: 'XAUUSD', direction: 'buy', entry: E, price: 4420, slOriginal: S0,
})
eq('em lucro fala de trailing', lucro.text.includes('trailing'), true)

// ── E fecha o sinal, como o stop loss ────────────────────────────────────────────────────
eq('o evento é terminal', isTerminal('stop_protegido'), true)

// ── O stop loss a sério não mudou ────────────────────────────────────────────────────────
const perda = lifecycleMessage('stop_loss', {
  symbol: 'XAUUSD', direction: 'buy', entry: E, price: S0, slOriginal: S0,
})
eq('continua a dizer Stop loss', perda.text.includes('Stop loss'), true)
eq('continua a dizer que fechou no stop', perda.text.includes('fechou no stop'), true)

console.log(`\n${ok} passaram, ${mau} falharam`)
if (mau) process.exit(1)
