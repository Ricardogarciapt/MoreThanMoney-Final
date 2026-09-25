/**
 * Cruzados de cripto (BTCJPY, BTCEUR, BTCETH…) calculados das pernas que temos ao vivo.
 * Correr: npx tsx lib/mtmfunded/__tests__/cruzados.check.ts
 */
import assert from 'node:assert/strict'
import {
  CRUZADOS_CRIPTO, CRUZADOS_FOREX, FRESCURA_FOREX_MS, FRESCURA_MAX_MS,
  cruzadosCalculaveis, precoCruzado, type Cruzado, type PrecoPerna,
} from '../precos/cruzados'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

const AGORA = 1_700_000_000_000
const mapa = (m: Record<string, PrecoPerna>) => (s: string) => m[s] ?? null

function main() {
  caso('BTCJPY = BTCUSD × USDJPY, bid com bid e ask com ask', () => {
    const p = precoCruzado(
      { symbol: 'BTCJPY', a: 'BTCUSD', b: 'USDJPY', operacao: 'multiplicar' },
      mapa({ BTCUSD: { bid: 100_000, ask: 100_010, em: AGORA }, USDJPY: { bid: 150, ask: 150.02, em: AGORA } }),
      AGORA,
    )
    assert.ok(p)
    assert.equal(p.bid, 100_000 * 150)
    assert.equal(p.ask, 100_010 * 150.02)
    assert.ok(p.ask > p.bid, 'o spread do cruzado é a soma dos dois')
  })

  caso('BTCEUR = BTCUSD ÷ EURUSD (o bid divide-se pelo ask da perna)', () => {
    const p = precoCruzado(
      { symbol: 'BTCEUR', a: 'BTCUSD', b: 'EURUSD', operacao: 'dividir' },
      mapa({ BTCUSD: { bid: 100_000, ask: 100_010, em: AGORA }, EURUSD: { bid: 1.1, ask: 1.1002, em: AGORA } }),
      AGORA,
    )
    assert.ok(p)
    assert.equal(p.bid, 100_000 / 1.1002)
    assert.equal(p.ask, 100_010 / 1.1)
    assert.ok(p.ask > p.bid)
  })

  caso('a hora do cruzado é a da perna MAIS VELHA', () => {
    const p = precoCruzado(
      { symbol: 'BTCETH', a: 'BTCUSD', b: 'ETHUSD', operacao: 'dividir' },
      mapa({ BTCUSD: { bid: 100_000, ask: 100_010, em: AGORA }, ETHUSD: { bid: 3_000, ask: 3_001, em: AGORA - 8_000 } }),
      AGORA,
    )
    assert.equal(p?.em, AGORA - 8_000)
  })

  caso('a hora do MERCADO do cruzado é a da perna mais velha — e nula se uma não a provar', () => {
    const c = { symbol: 'BTCETH', a: 'BTCUSD', b: 'ETHUSD', operacao: 'dividir' } as const
    const ambas = precoCruzado(c, mapa({
      BTCUSD: { bid: 100_000, ask: 100_010, em: AGORA, emMercado: AGORA - 300 },
      ETHUSD: { bid: 3_000, ask: 3_001, em: AGORA, emMercado: AGORA - 900 },
    }), AGORA)
    assert.equal(ambas?.emMercado, AGORA - 900)

    // A Binance não declara hora no bookTicker: meio cruzado sem hora de mercado não é um
    // cruzado com hora — senão o preenchimento acreditava numa frescura que ninguém provou.
    const meia = precoCruzado(c, mapa({
      BTCUSD: { bid: 100_000, ask: 100_010, em: AGORA, emMercado: AGORA - 300 },
      ETHUSD: { bid: 3_000, ask: 3_001, em: AGORA },
    }), AGORA)
    assert.equal(meia?.emMercado, null)
  })

  caso('perna velha = sem cruzado (não se arrasta meio preço)', () => {
    const ler = mapa({ BTCUSD: { bid: 100_000, ask: 100_010, em: AGORA }, USDJPY: { bid: 150, ask: 150.02, em: AGORA - 60_000 } })
    assert.equal(precoCruzado({ symbol: 'BTCJPY', a: 'BTCUSD', b: 'USDJPY', operacao: 'multiplicar' }, ler, AGORA), null)
  })

  caso('perna em falta, a zero ou negativa = sem cruzado', () => {
    const c = { symbol: 'BTCJPY', a: 'BTCUSD', b: 'USDJPY', operacao: 'multiplicar' } as const
    assert.equal(precoCruzado(c, mapa({ BTCUSD: { bid: 1, ask: 2, em: AGORA } }), AGORA), null)
    assert.equal(precoCruzado(c, mapa({ BTCUSD: { bid: 0, ask: 2, em: AGORA }, USDJPY: { bid: 150, ask: 150, em: AGORA } }), AGORA), null)
    assert.equal(precoCruzado(c, mapa({ BTCUSD: { bid: -1, ask: 2, em: AGORA }, USDJPY: { bid: 150, ask: 150, em: AGORA } }), AGORA), null)
  })

  caso('só saem os cruzados que dá mesmo para calcular', () => {
    const r = cruzadosCalculaveis(
      mapa({
        BTCUSD: { bid: 100_000, ask: 100_010, em: AGORA },
        ETHUSD: { bid: 3_000, ask: 3_001, em: AGORA },
        USDJPY: { bid: 150, ask: 150.02, em: AGORA },
      }),
      AGORA,
    )
    const nomes = r.map((x) => x.symbol).sort()
    assert.deepEqual(nomes, ['BTCETH', 'BTCJPY', 'ETHJPY', 'USDTJPY'])
    assert.ok(!nomes.includes('BTCEUR'), 'sem EURUSD não há BTCEUR')
    assert.ok(!nomes.includes('BTCXAU'), 'sem XAUUSD não há BTCXAU')
  })

  caso('a tabela não tem cruzados repetidos nem pernas vazias', () => {
    const vistos = new Set<string>()
    for (const c of CRUZADOS_CRIPTO) {
      assert.ok(!vistos.has(c.symbol), `cruzado repetido: ${c.symbol}`)
      vistos.add(c.symbol)
      assert.ok(c.a && c.b, `${c.symbol} sem pernas`)
      assert.notEqual(c.symbol, c.a, `${c.symbol} não se calcula a si próprio`)
    }
    assert.equal(CRUZADOS_CRIPTO.length, 18)
  })

  caso('nenhum cruzado depende de outro cruzado (senão herdava o erro dele)', () => {
    const cruzadosNomes = new Set(CRUZADOS_CRIPTO.map((c) => c.symbol))
    for (const c of CRUZADOS_CRIPTO) {
      if (c.symbol === 'USDTJPY') continue // o USDT é o dólar: a perna é o próprio USDJPY
      assert.ok(!cruzadosNomes.has(c.a), `${c.symbol} depende do cruzado ${c.a}`)
      assert.ok(!cruzadosNomes.has(c.b), `${c.symbol} depende do cruzado ${c.b}`)
    }
  })


  // ── cruzados de FOREX ────────────────────────────────────────────────────────────────────────
  //
  // A fotografia abaixo é REAL: são os onze símbolos que o terminal do conector publicou às
  // 15:08:24 UTC de 2026-09-24 (TheTradingMaster, conta 19040). Serve de prova de que a conta que
  // fazemos é a mesma que a corretora faz por dentro — e de quanto é que ela se afasta.
  const CONECTOR: Record<string, [number, number]> = {
    EURUSD: [1.13688, 1.13689], GBPUSD: [1.32133, 1.32134], USDCHF: [0.82932, 0.82933],
    USDJPY: [158.948, 158.949], USDCAD: [1.41438, 1.41439], AUDUSD: [0.70136, 0.70137],
    AUDNZD: [1.24053, 1.24060], AUDCAD: [0.99183, 0.99187], AUDCHF: [0.58165, 0.58167],
    AUDJPY: [111.482, 111.485],
  }
  const pernasConector = mapa(Object.fromEntries(
    Object.entries(CONECTOR).map(([s, [bid, ask]]) => [s, { bid, ask, em: AGORA, emMercado: AGORA }]),
  ))

  caso('a tabela de forex é sã: sem repetidos, sem pernas vazias, sem se calcular a si própria', () => {
    const vistos = new Set<string>()
    for (const c of CRUZADOS_FOREX) {
      assert.ok(!vistos.has(c.symbol), `cruzado repetido: ${c.symbol}`)
      vistos.add(c.symbol)
      assert.ok(c.a && c.b, `${c.symbol} sem pernas`)
      assert.notEqual(c.symbol, c.a, `${c.symbol} não se calcula a si próprio`)
      assert.notEqual(c.symbol, c.b, `${c.symbol} não se calcula a si próprio`)
    }
    assert.equal(CRUZADOS_FOREX.length, 10)
  })

  caso('nenhum cruzado de forex depende de outro cruzado (NZDCHF fica de fora por isso)', () => {
    const nomes = new Set(CRUZADOS_FOREX.map((c) => c.symbol))
    for (const c of CRUZADOS_FOREX) {
      assert.ok(!nomes.has(c.a), `${c.symbol} depende do cruzado ${c.a}`)
      assert.ok(!nomes.has(c.b), `${c.symbol} depende do cruzado ${c.b}`)
    }
    assert.ok(!nomes.has('NZDCHF'), 'NZDCHF precisava de três pernas — resolve-se no Market Watch')
  })

  caso('as pernas de todos eles existem no Market Watch do conector', () => {
    for (const c of CRUZADOS_FOREX) {
      assert.ok(CONECTOR[c.a], `${c.symbol}: a perna ${c.a} não vem do conector`)
      assert.ok(CONECTOR[c.b], `${c.symbol}: a perna ${c.b} não vem do conector`)
    }
  })

  caso('forex e cripto não disputam o mesmo símbolo', () => {
    const cripto = new Set(CRUZADOS_CRIPTO.map((c) => c.symbol))
    for (const c of CRUZADOS_FOREX) assert.ok(!cripto.has(c.symbol), `${c.symbol} em duas tabelas`)
  })

  /**
   * A PROVA: três pares que a corretora cota DIRECTAMENTE e que também se derivam das outras
   * pernas. Se a nossa conta estivesse errada, aqui via-se. Medido nesta fotografia: AUDCHF bate
   * certo ao ponto (0,00 pips), AUDJPY 0,26 pips, AUDCAD 1,50 pips — o desvio é o das pernas terem
   * chegado em instantes diferentes (30 ms) e do livro do próprio par andar por sua conta, não da
   * fórmula. É esta a margem com que um cruzado se usa: perto, não igual.
   */
  caso('derivar um par que a corretora cota dá o preço dela a menos de 2 pips', () => {
    const controlo: Array<[string, Cruzado, number]> = [
      ['AUDCHF', { symbol: 'AUDCHF/derivado', a: 'AUDUSD', b: 'USDCHF', operacao: 'multiplicar' }, 0.0001],
      ['AUDCAD', { symbol: 'AUDCAD/derivado', a: 'AUDUSD', b: 'USDCAD', operacao: 'multiplicar' }, 0.0001],
      ['AUDJPY', { symbol: 'AUDJPY/derivado', a: 'AUDUSD', b: 'USDJPY', operacao: 'multiplicar' }, 0.01],
    ]
    for (const [sym, c, pip] of controlo) {
      const d = precoCruzado(c, pernasConector, AGORA)
      assert.ok(d, `${sym} não se derivou`)
      const meioDirecto = (CONECTOR[sym][0] + CONECTOR[sym][1]) / 2
      const meioDerivado = (d.bid + d.ask) / 2
      const pips = Math.abs(meioDirecto - meioDerivado) / pip
      assert.ok(pips < 2, `${sym}: derivado afasta-se ${pips.toFixed(2)} pips do preço da corretora`)
    }
  })

  caso('com o Market Watch de hoje saem os dez, todos com hora de mercado provada', () => {
    const r = cruzadosCalculaveis(pernasConector, AGORA, CRUZADOS_FOREX, FRESCURA_FOREX_MS)
    assert.deepEqual(
      r.map((x) => x.symbol).sort(),
      ['CADCHF', 'CADJPY', 'EURAUD', 'EURCAD', 'EURCHF', 'EURGBP', 'GBPCAD', 'GBPCHF', 'GBPJPY', 'NZDUSD'],
    )
    for (const x of r) {
      assert.ok(x.ask > x.bid, `${x.symbol}: ask tem de estar acima do bid`)
      assert.equal(x.emMercado, AGORA, `${x.symbol}: perdeu a hora de mercado`)
    }
  })

  caso('o limite do forex é o da execução (5 s), não os 30 s da cripto', () => {
    const velhas = mapa({
      EURUSD: { bid: 1.13688, ask: 1.13689, em: AGORA - 8_000, emMercado: AGORA - 8_000 },
      USDCHF: { bid: 0.82932, ask: 0.82933, em: AGORA, emMercado: AGORA },
    })
    const so = [CRUZADOS_FOREX.find((c) => c.symbol === 'EURCHF')!]
    assert.equal(cruzadosCalculaveis(velhas, AGORA, so, FRESCURA_FOREX_MS).length, 0,
      'uma perna de 8 s não pode fazer um cruzado que a execução vai aceitar')
    assert.equal(cruzadosCalculaveis(velhas, AGORA, so, FRESCURA_MAX_MS).length, 1,
      'com o limite da cripto passaria — é por isso que o forex tem o seu')
  })

  caso('uma perna sem hora de mercado tira a hora ao cruzado (nunca se finge o que não se prova)', () => {
    const semHora = mapa({
      EURUSD: { bid: 1.13688, ask: 1.13689, em: AGORA, emMercado: AGORA },
      USDCHF: { bid: 0.82932, ask: 0.82933, em: AGORA, emMercado: null },
    })
    const so = [CRUZADOS_FOREX.find((c) => c.symbol === 'EURCHF')!]
    const r = cruzadosCalculaveis(semHora, AGORA, so, FRESCURA_FOREX_MS)
    assert.equal(r.length, 1)
    assert.equal(r[0].emMercado, null)
  })

  console.log(`\ncruzados: ${n} verificações certas`)
}

main()
