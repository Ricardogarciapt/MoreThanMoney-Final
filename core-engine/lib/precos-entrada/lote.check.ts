/**
 * GUARDAS DO QUE VIAJA. Correr: npx tsx lib/precos-entrada/lote.check.ts
 */
import assert from 'node:assert/strict'
import { OPCOES_LOTE, lerTicksBrutos, montarLote } from './lote'
import type { TickEntrada } from './sanidade'

const AGORA = 1_790_700_000_000

// ── Ler o ficheiro do EA sem lhe mexer nos nomes ────────────────────────────
const ficheiro = `{"em":${AGORA},"p":[{"s":"XAUUSD.s","b":4286.0,"a":4286.4,"t":${AGORA - 30}},{"s":"EURUSD","b":1.0851,"a":1.0852,"t":${AGORA - 90}}]}`
const foto = lerTicksBrutos(ficheiro)
assert.equal(foto.length, 2)
assert.equal(foto[0].s, 'XAUUSD.s'.toUpperCase(), 'o sufixo da corretora VIAJA: quem canoniza é o motor')
// Lixo não rebenta: um ficheiro a meio de uma escrita é um ficheiro sem ticks, não uma excepção.
assert.deepEqual(lerTicksBrutos('{"em":1,"p":[{"s":"XAU"'), [])
assert.deepEqual(lerTicksBrutos(''), [])
assert.deepEqual(lerTicksBrutos('{"p":[{"s":"XAU","b":0,"a":1,"t":2},{"s":"","b":1,"a":1,"t":2},{"s":"OK","b":1,"a":1,"t":"x"}]}'), [])

// ── Só o que mudou ──────────────────────────────────────────────────────────
const enviados = new Map<string, number>(foto.map((t) => [t.s, t.t]))
assert.equal(montarLote(foto, enviados, AGORA, AGORA), null, 'nada mudou → nem um pedido se faz')

const mexeu: TickEntrada[] = [{ ...foto[0], b: 4286.2, t: AGORA - 10 }, foto[1]]
const envio = montarLote(mexeu, enviados, AGORA, AGORA)
assert.ok(envio)
assert.equal(envio.ticks.length, 1, 'só o símbolo que teve tick novo')
assert.equal(envio.ticks[0].s, 'XAUUSD.S')
assert.equal(envio.cheio, false)

// ── A fotografia completa, de vez em quando ─────────────────────────────────
// Sem ela, um receptor reiniciado ficava para sempre sem os símbolos quietos.
const cheio = montarLote(foto, enviados, AGORA, AGORA - OPCOES_LOTE.reenvioMs)
assert.ok(cheio)
assert.equal(cheio.cheio, true)
assert.equal(cheio.ticks.length, 2, 'o cheio leva tudo, mexido ou não')

// Um lote truncado pelo tecto NÃO se declara completo: o receptor apagaria do retrato o que ficou
// de fora, e símbolos vivos desapareciam.
const muitos: TickEntrada[] = Array.from({ length: 5 }, (_, i) => ({ s: `SYM${i}`, b: 1, a: 1.1, t: AGORA - i }))
const truncado = montarLote(muitos, new Map(), AGORA, 0, { reenvioMs: 1, maxTicks: 3 })
assert.ok(truncado)
assert.equal(truncado.ticks.length, 3)
assert.equal(truncado.cheio, false, 'truncado nunca é «cheio»')

console.log('lote: ok')
