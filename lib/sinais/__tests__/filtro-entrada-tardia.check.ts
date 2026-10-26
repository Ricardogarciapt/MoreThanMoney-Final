import assert from 'node:assert/strict'
import { avaliarEntradaTardia } from '../filtro-entrada-tardia'

/** Filtro de entrada tardia (sombra, 26/10). Correr: npx tsx lib/sinais/__tests__/filtro-entrada-tardia.check.ts */
const t0 = 1_800_000_000
// 20 velas M15 a subir 1,00 cada (10 pips no ouro): em 4 h (16 velas) andou 160 pips
const velas = Array.from({ length: 20 }, (_, i) => ({ t: t0 + i * 900, c: 4000 + i }))
const emSeg = t0 + 20 * 900 // fecho da última vela
const compra = avaliarEntradaTardia(velas, 'buy', 'XAUUSD', emSeg)
assert.equal(compra?.andou_pips, 160)
assert.equal(compra?.teria_filtrado, true)
// a mesma subida numa venda é contra: não filtra
const venda = avaliarEntradaTardia(velas, 'SELL', 'XAUUSD', emSeg)
assert.equal(venda?.andou_pips, -160)
assert.equal(venda?.teria_filtrado, false)
// vela ainda aberta não conta: a meio da 20.ª vela só há 19 fechadas
assert.equal(avaliarEntradaTardia(velas, 'buy', 'XAUUSD', emSeg - 450)?.andou_pips, 160)
// velas a menos para a janela, direção inválida
assert.equal(avaliarEntradaTardia(velas.slice(-5), 'buy', 'XAUUSD', emSeg), null)
assert.equal(avaliarEntradaTardia(velas, 'close', 'XAUUSD', emSeg), null)
// abaixo do limite: 16 velas de 0,375 → 60 pips
const lentas = Array.from({ length: 20 }, (_, i) => ({ t: t0 + i * 900, c: 4000 + i * 0.375 }))
assert.equal(avaliarEntradaTardia(lentas, 'buy', 'XAUUSD', emSeg)?.teria_filtrado, false)
console.log('filtro-entrada-tardia: ok')
