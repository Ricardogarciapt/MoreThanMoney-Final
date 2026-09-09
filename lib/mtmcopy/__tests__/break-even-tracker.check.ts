/**
 * O PrimeVerse mandou 270 parciais em 14 dias e ZERO break-even.
 *
 * O cliente nunca soube em que momento o risco dele deixou de existir — e o nosso lado também
 * não: o stop da linha ficava no original, e qualquer recuo até lá era medido como perda
 * inteira. Foi assim que 155 sinais ficaram gravados a −11.102 pips quando tinham dado +6.016.
 *
 * Aqui testa-se a aritmética do que fica embolsado. As saídas são 50/25/25.
 */
import { stopFoiProtegido } from '../signal-lifecycle'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

// Réplica da regra do tracker, para trancar a aritmética.
const PESOS = [0.5, 0.25, 0.25]
function embolsado(entry: number, tps: number[], exits: number, pip: number, compra = true): number {
  let t = 0
  for (let i = 0; i < Math.min(exits, PESOS.length); i++) {
    const alvo = tps[i]
    if (alvo == null) continue
    const p = (compra ? alvo - entry : entry - alvo) / pip
    if (p > 0) t += p * PESOS[i]
  }
  return Math.round(t * 10) / 10
}

// Ouro: entrada 4400, alvos a +100/+200/+300 pips.
const tps = [4410, 4420, 4430]
eq('alvo 1 → metade do primeiro alvo', embolsado(4400, tps, 1, 0.1), 50)
eq('alvos 1+2 → 50% + 25%', embolsado(4400, tps, 2, 0.1), 100)
eq('alvos 1+2+3 → 100% do peso', embolsado(4400, tps, 3, 0.1), 175)
eq('sem alvos batidos não há nada embolsado', embolsado(4400, tps, 0, 0.1), 0)
eq('um 4.º alvo não acrescenta (a posição já saiu toda)', embolsado(4400, [...tps, 4440], 4, 0.1), 175)

// Venda: espelho exato.
eq('venda: alvo 1', embolsado(4400, [4390, 4380, 4370], 1, 0.1, false), 50)
eq('venda: alvos 1+2+3', embolsado(4400, [4390, 4380, 4370], 3, 0.1, false), 175)

// Nunca negativo: um "alvo" do lado errado não desconta do que foi ganho.
eq('alvo do lado errado é ignorado', embolsado(4400, [4390], 1, 0.1), 0)

// Índices contam em pontos, não em décimos — o erro que quase me fez corrigir 18 sinais certos.
eq('NAS100: 100 pontos, metade', embolsado(29500, [29600, 29700, 29800], 1, 1), 50)
// Cripto idem.
eq('BTC: 500 pontos, metade', embolsado(78530, [78030, 77530, 77030], 1, 1, false), 250)

// E o stop no break-even não é perda.
eq('stop na entrada = protegido',
  stopFoiProtegido({ direction: 'buy', entry: 4400, slOriginal: 4390, price: 4400 }), true)
eq('stop no original = perda',
  stopFoiProtegido({ direction: 'buy', entry: 4400, slOriginal: 4390, price: 4390 }), false)

console.log(`\n${ok} passaram, ${mau} falharam`)
if (mau) process.exit(1)
