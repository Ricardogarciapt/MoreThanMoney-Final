/**
 * GUARDAS DA TRANCA — cada assert aqui é um preço que não vai mexer um stop.
 * Correr: npx tsx lib/precos-entrada/sanidade.check.ts
 */
import assert from 'node:assert/strict'
import { LIMITES, avaliarTick, medio, type Referencia, type TickEntrada } from './sanidade'

const AGORA = 1_790_700_000_000
const t = (o: Partial<TickEntrada> = {}): TickEntrada => ({ s: 'XAUUSD', b: 4286.0, a: 4286.4, t: AGORA - 100, ...o })
const ref = (m: number, idadeMs = 200): Referencia => ({ medio: m, em: AGORA - idadeMs })

const razaoDe = (v: ReturnType<typeof avaliarTick>) => (v.ok ? '' : v.razao)

// ── O caminho normal passa ───────────────────────────────────────────────────
assert.equal(avaliarTick(t(), AGORA, null, null).ok, true, 'um tick normal do Mac tem de entrar')
assert.equal(medio(t({ b: 100, a: 102 })), 101)

// ── Forma ───────────────────────────────────────────────────────────────────
for (const mau of ['', ' ', 'X', 'XA', 'XAU USD', 'XAUUSD;DROP', '../../etc', 'XAUUSD.demasiadolongo']) {
  assert.equal(razaoDe(avaliarTick(t({ s: mau }), AGORA, null, null)), 'simbolo', `símbolo «${mau}»`)
}
// Os nomes reais das corretoras passam, com sufixo e tudo.
for (const bom of ['XAUUSD', 'XAUUSD.s', 'EURUSD.pro', 'US30-STD', 'BTCUSD', 'NAS100_x']) {
  assert.equal(avaliarTick(t({ s: bom }), AGORA, null, null).ok, true, `símbolo «${bom}»`)
}
for (const mau of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(razaoDe(avaliarTick(t({ b: mau }), AGORA, null, null)), 'preco', `bid=${mau}`)
  assert.equal(razaoDe(avaliarTick(t({ a: mau }), AGORA, null, null)), 'preco', `ask=${mau}`)
}
assert.equal(razaoDe(avaliarTick(t({ b: 4286.4, a: 4286.0 }), AGORA, null, null)), 'ask<bid')
// Um spread absurdo é a maneira barata de arrastar o médio sem que nenhum dos dois lados pareça mau.
assert.equal(razaoDe(avaliarTick(t({ b: 4000, a: 4600 }), AGORA, null, null)), 'spread')

// ── Hora ────────────────────────────────────────────────────────────────────
assert.equal(razaoDe(avaliarTick(t({ t: 0 }), AGORA, null, null)), 'hora')
assert.equal(razaoDe(avaliarTick(t({ t: AGORA + LIMITES.futuroMaxMs + 1 }), AGORA, null, null)), 'futuro')
assert.equal(razaoDe(avaliarTick(t({ t: AGORA - LIMITES.idadeMaxMs - 1 }), AGORA, null, null)), 'velho')
// Dentro da tolerância do relógio ainda entra: os relógios das corretoras não batem ao ms.
assert.equal(avaliarTick(t({ t: AGORA + 1_000 }), AGORA, null, null).ok, true)

/**
 * O REENVIO DE UM LOTE ANTIGO. Um preço que recua no tempo nunca entra, mesmo dentro de todos os
 * outros limites: era a forma mais barata de empurrar o preço para trás com material legítimo.
 */
assert.equal(
  razaoDe(avaliarTick(t({ t: AGORA - 5_000 }), AGORA, { medio: 4286.2, em: AGORA - 1_000 }, null)),
  'recuado',
)

// ── Salto possível ──────────────────────────────────────────────────────────
const anterior = { medio: 4286.2, em: AGORA - 500 }
assert.equal(avaliarTick(t({ b: 4290, a: 4290.4 }), AGORA, anterior, null).ok, true, 'mercado mexe')
assert.ok(!avaliarTick(t({ b: 5000, a: 5000.4 }), AGORA, anterior, null).ok, 'mercado não sobe 17% em 500 ms')
assert.match(razaoDe(avaliarTick(t({ b: 5000, a: 5000.4 }), AGORA, anterior, null)), /^salto /)
// Fora da janela (terminal fechado, fim de semana) o salto pode ser verdade — e recusá-lo era
// deixar a reserva inútil precisamente na segunda-feira de manhã.
const velho = { medio: 4286.2, em: AGORA - LIMITES.janelaSaltoMs - 5_000 }
assert.equal(avaliarTick(t({ b: 5000, a: 5000.4 }), AGORA, velho, null).ok, true)

// ── Referência: a defesa forte, enquanto o terminal do VPS estiver vivo ─────
assert.equal(avaliarTick(t(), AGORA, null, ref(4286.3)).ok, true, 'duas contas da mesma corretora concordam')
assert.match(razaoDe(avaliarTick(t({ b: 4500, a: 4500.4 }), AGORA, null, ref(4286.3))), /^divergencia /)
// Referência VELHA não é referência: é o caso do VPS em baixo, e aí a reserva TEM de passar.
assert.equal(
  avaliarTick(t({ b: 4500, a: 4500.4 }), AGORA, null, ref(4286.3, LIMITES.referenciaMaxMs + 1)).ok,
  true,
  'com o terminal do VPS parado, o Mac não pode ser recusado por divergir do preço de sexta',
)

console.log('sanidade: ok')
