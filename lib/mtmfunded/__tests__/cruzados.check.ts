/**
 * Cruzados de cripto (BTCJPY, BTCEUR, BTCETH…) calculados das pernas que temos ao vivo.
 * Correr: npx tsx lib/mtmfunded/__tests__/cruzados.check.ts
 */
import assert from 'node:assert/strict'
import { CRUZADOS_CRIPTO, cruzadosCalculaveis, precoCruzado, type PrecoPerna } from '../precos/cruzados'

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

  console.log(`\ncruzados: ${n} verificações certas`)
}

main()
