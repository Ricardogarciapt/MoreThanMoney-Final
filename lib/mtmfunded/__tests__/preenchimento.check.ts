/**
 * A regra do preço de preenchimento — construída sobre as 7 trades REAIS da conta mestre do
 * Sensei (9782326a…, login 77094082) entre 21 e 24 de Setembro de 2026.
 *
 * Os números de cada caso saem da base: `funded_positions.tick_entrada` (bid/ask/em do tick que
 * abriu) e `funded_sinal_posicoes.entrada` (o preço que o sinal declarou, que bate com a OANDA).
 * A coluna «vela M5» vem de OANDA:XAUUSD e serve para mostrar quais destas entradas foram feitas
 * a um preço que o mercado nunca ofereceu.
 *
 * Correr: npx tsx lib/mtmfunded/__tests__/preenchimento.check.ts
 */
import assert from 'node:assert/strict'
import {
  precoDePreenchimento, arredondarContra, IDADE_MAX_MS,
  type Direcao, type Preenchimento,
} from '../precos/preenchimento'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

const AGORA = 1_790_000_000_000

/** Uma das 7 trades: o que a base guardou e o que o mercado (OANDA M5) mostrava. */
interface TradeReal {
  nome: string
  direcao: Direcao
  bid: number
  ask: number
  /** idade declarada do tick no momento da abertura (ms) */
  idadeMs: number
  /** preço do sinal (= OANDA no instante da decisão) */
  sinal: number
  /** entrada que a conta levou (o que aconteceu de facto) */
  entradaAntiga: number
  /** preço de saída real (SL/trailing), para medir o lucro */
  fecho: number
  /** P&L que a conta registou, em USD, a 0,10 lote */
  pnlAntigo: number
  /** máximo e mínimo da vela M5 da OANDA que contém a abertura */
  velaM5: [number, number]
}

const TRADES: TradeReal[] = [
  { nome: '21/09 10:30', direcao: 'sell', bid: 4351.49, ask: 4351.81, idadeMs: 1080, sinal: 4350.82, entradaAntiga: 4351.49, fecho: 4345.76, pnlAntigo: 57.3, velaM5: [4349.76, 4351.735] },
  { nome: '21/09 13:30', direcao: 'buy', bid: 4359.98, ask: 4360.30, idadeMs: 1985, sinal: 4364.32, entradaAntiga: 4360.30, fecho: 4365.29, pnlAntigo: 49.9, velaM5: [4352.545, 4364.74] },
  { nome: '22/09 09:15', direcao: 'sell', bid: 4319.54, ask: 4319.86, idadeMs: 1249, sinal: 4318.45, entradaAntiga: 4319.54, fecho: 4315.89, pnlAntigo: 36.5, velaM5: [4317.2, 4323.99] },
  { nome: '22/09 14:30', direcao: 'sell', bid: 4330.67, ask: 4330.99, idadeMs: 494, sinal: 4327.81, entradaAntiga: 4330.67, fecho: 4325.33, pnlAntigo: 53.4, velaM5: [4324.415, 4329.74] },
  { nome: '23/09 13:15', direcao: 'sell', bid: 4304.50, ask: 4304.82, idadeMs: 1062, sinal: 4302.33, entradaAntiga: 4304.50, fecho: 4312.00, pnlAntigo: -75.0, velaM5: [4301.725, 4306.18] },
  { nome: '23/09 13:45', direcao: 'sell', bid: 4292.43, ask: 4292.75, idadeMs: 708, sinal: 4292.69, entradaAntiga: 4292.43, fecho: 4285.88, pnlAntigo: 65.5, velaM5: [4280.74, 4291.395] },
  { nome: '24/09 02:00', direcao: 'sell', bid: 4281.01, ask: 4281.33, idadeMs: 3952, sinal: 4279.04, entradaAntiga: 4281.01, fecho: 4277.55, pnlAntigo: 34.6, velaM5: [4274.2, 4279.64] },
]

const VOLUME = 0.1
const CONTRACT_SIZE = 100

const correr = (t: TradeReal): Preenchimento =>
  precoDePreenchimento({
    direcao: t.direcao,
    tick: { bid: t.bid, ask: t.ask, em: AGORA - t.idadeMs },
    referencia: { preco: t.sinal },
    digits: 2,
    agora: AGORA,
  })

const pnl = (t: TradeReal, entrada: number) =>
  Math.round((t.fecho - entrada) * CONTRACT_SIZE * VOLUME * (t.direcao === 'buy' ? 1 : -1) * 10) / 10

function main() {
  // ── o que se passou: a prova de que o problema é real ────────────────────
  caso('das 7 trades, 3 abriram FORA da vela M5 da OANDA — e sempre a favor da casa', () => {
    const fora = TRADES.filter((t) => t.entradaAntiga > t.velaM5[1] || t.entradaAntiga < t.velaM5[0])
    assert.deepEqual(fora.map((t) => t.nome), ['22/09 14:30', '23/09 13:45', '24/09 02:00'])
    for (const t of fora) {
      // Todas vendas, todas acima do máximo da vela: vender caro é o lado bom para quem vende.
      assert.equal(t.direcao, 'sell')
      assert.ok(t.entradaAntiga > t.velaM5[1], `${t.nome} devia estar acima do máximo`)
    }
  })

  caso('6 das 7 entradas antigas batiam a favor da conta contra o preço do sinal', () => {
    const aFavor = TRADES.filter((t) =>
      t.direcao === 'sell' ? t.entradaAntiga > t.sinal : t.entradaAntiga < t.sinal)
    assert.equal(aFavor.length, 6)
  })

  // ── a regra ─────────────────────────────────────────────────────────────
  caso('nenhuma entrada nova é melhor do que a antiga (a regra nunca oferece nada)', () => {
    for (const t of TRADES) {
      const r = correr(t)
      assert.ok(r.ok, `${t.nome}: ${r.ok ? '' : r.erro}`)
      if (!r.ok) return
      if (t.direcao === 'sell') assert.ok(r.preco <= t.entradaAntiga, `${t.nome} vendeu mais caro`)
      else assert.ok(r.preco >= t.entradaAntiga, `${t.nome} comprou mais barato`)
    }
  })

  caso('as 3 entradas impossíveis passam a caber dentro da vela — menos a 23/09 13:45', () => {
    const forasNovos: string[] = []
    for (const t of TRADES) {
      const r = correr(t)
      if (!r.ok) continue
      const dentro = t.direcao === 'sell' ? r.preco <= t.velaM5[1] : r.preco >= t.velaM5[0]
      if (!dentro) forasNovos.push(t.nome)
    }
    /**
     * O QUE A REGRA NÃO ALCANÇA, e é honesto dizê-lo: a 23/09 13:45 o tick (4292,43) JÁ era o
     * pior dos dois — o sinal dizia 4292,69. As duas fontes estavam do mesmo lado, ambas antes
     * da queda, porque entre o instante do sinal (13:45:00) e a abertura (13:45:21) o ouro caiu
     * 7 USD. Contra isso não há regra de preço que valha: só executar mais depressa, ou o motor
     * passar a trazer a hora a que o MERCADO fez o preço (o campo `emMercado`, ainda por ligar).
     */
    assert.deepEqual(forasNovos, ['23/09 13:45'])
  })

  caso('cada entrada nova, ao cêntimo', () => {
    const esperado: Record<string, number> = {
      '21/09 10:30': 4350.66, '21/09 13:30': 4364.48, '22/09 09:15': 4318.29,
      '22/09 14:30': 4327.65, '23/09 13:15': 4302.17, '23/09 13:45': 4292.43,
      '24/09 02:00': 4278.88,
    }
    for (const t of TRADES) {
      const r = correr(t)
      assert.ok(r.ok)
      if (r.ok) assert.equal(r.preco, esperado[t.nome], `${t.nome}`)
    }
  })

  caso('a única trade em que o tick já era o pior preço fica INTACTA (23/09 13:45)', () => {
    const t = TRADES.find((x) => x.nome === '23/09 13:45')!
    const r = correr(t)
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.preco, t.entradaAntiga)
    assert.equal(r.regra, 'tick')
    assert.equal(r.penalizacao, 0)
  })

  caso('o lucro das 7: +222,2 USD passa a +84,8 USD (desaparecem 137,4)', () => {
    let velho = 0
    let novo = 0
    for (const t of TRADES) {
      const r = correr(t)
      assert.ok(r.ok)
      if (!r.ok) return
      velho += t.pnlAntigo
      novo += pnl(t, r.preco)
    }
    assert.equal(Math.round(velho * 10) / 10, 222.2)
    assert.equal(Math.round(novo * 10) / 10, 84.8)
    assert.equal(Math.round((velho - novo) * 10) / 10, 137.4)
  })

  // ── as guardas ──────────────────────────────────────────────────────────
  caso('sem tick não se abre', () => {
    const r = precoDePreenchimento({ direcao: 'buy', tick: null, digits: 2, agora: AGORA })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.motivo, 'sem-preco')
  })

  caso('tick acima do limite de idade não abre — e diz porquê', () => {
    const r = precoDePreenchimento({
      direcao: 'sell', tick: { bid: 4300, ask: 4300.32, em: AGORA - IDADE_MAX_MS - 1 },
      referencia: { preco: 4300 }, digits: 2, agora: AGORA,
    })
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.equal(r.motivo, 'velho')
      assert.match(r.erro, /s —/)
    }
  })

  caso('fontes a discordar mais de 0,3 % não dão preço nenhum', () => {
    const r = precoDePreenchimento({
      direcao: 'buy', tick: { bid: 4300, ask: 4300.32, em: AGORA - 500 },
      referencia: { preco: 4320 }, digits: 2, agora: AGORA,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.motivo, 'divergencia')
  })

  caso('sem referência (ordem à mão no WebTrader) o tick manda, como sempre', () => {
    const r = precoDePreenchimento({
      direcao: 'buy', tick: { bid: 4300, ask: 4300.32, em: AGORA - 4000 }, digits: 2, agora: AGORA,
    })
    assert.ok(r.ok)
    if (r.ok) { assert.equal(r.preco, 4300.32); assert.equal(r.regra, 'tick') }
  })

  caso('frescura PROVADA pela fonte dispensa o passo pessimista', () => {
    const tick = { bid: 4300, ask: 4300.32, em: AGORA - 200, emMercado: AGORA - 200 }
    const r = precoDePreenchimento({ direcao: 'sell', tick, referencia: { preco: 4299 }, digits: 2, agora: AGORA })
    assert.ok(r.ok)
    if (r.ok) { assert.equal(r.preco, 4300); assert.equal(r.regra, 'tick') }
    // o mesmo tick com a hora do mercado já velha volta ao pior dos dois
    const r2 = precoDePreenchimento({
      direcao: 'sell', tick: { ...tick, emMercado: AGORA - 4000 }, referencia: { preco: 4299 }, digits: 2, agora: AGORA,
    })
    assert.ok(r2.ok)
    if (r2.ok) { assert.equal(r2.preco, 4298.84); assert.equal(r2.regra, 'pior-dos-dois') }
  })

  caso('o spread do tick mantém-se: a regra move o preço, não inventa custo', () => {
    const r = precoDePreenchimento({
      direcao: 'sell', tick: { bid: 4300, ask: 4300.32, em: AGORA - 3000 },
      referencia: { preco: 4290 }, digits: 2, agora: AGORA,
    })
    assert.ok(r.ok)
    if (r.ok) assert.equal(Math.round((r.ask - r.bid) * 100) / 100, 0.32)
  })

  caso('o arredondamento também nunca é prenda: compra sobe, venda desce', () => {
    assert.equal(arredondarContra(4300.001, 'buy', 2), 4300.01)
    assert.equal(arredondarContra(4300.009, 'sell', 2), 4300.0)
    // um valor já na grelha não se mexe
    assert.equal(arredondarContra(4300.01, 'buy', 2), 4300.01)
    assert.equal(arredondarContra(4300.01, 'sell', 2), 4300.01)
  })

  caso('simetria: a mesma discordância custa o mesmo a comprar e a vender', () => {
    const tick = { bid: 4300, ask: 4300.32, em: AGORA - 3000 }
    const compra = precoDePreenchimento({ direcao: 'buy', tick, referencia: { preco: 4302 }, digits: 2, agora: AGORA })
    const venda = precoDePreenchimento({ direcao: 'sell', tick, referencia: { preco: 4298.32 }, digits: 2, agora: AGORA })
    assert.ok(compra.ok && venda.ok)
    if (compra.ok && venda.ok) assert.equal(compra.penalizacao, venda.penalizacao)
  })

  console.log(`\npreenchimento: ${n} verificações certas`)
}

main()
