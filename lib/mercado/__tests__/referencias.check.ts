/**
 * Velas e preços SEM MetaApi (2026-09-21) — mapeamento de símbolos, agregação H4, reescala ancorada,
 * janelas do Yahoo e o recurso ao vivo do motor (o que entra e o que nunca entra).
 * Correr: npx tsx lib/mercado/__tests__/referencias.check.ts
 */
import assert from 'node:assert/strict'
import {
  agregarRef, cotacaoDoYahoo, fatorAncorado, fatorValido, janelaYahoo, referenciasPara, reescalar, soAberto,
  velasDaBinance, velasDoYahoo, type VelaRef,
} from '../referencias'
import { bidAsk, planoVivo } from '../../../services/funded-motor/fonte-yahoo'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }
const primeiro = (s: string, c?: string, m?: string) => referenciasPara(s, c, m)[0]
const v = (t: number, c: number, extra: Partial<VelaRef> = {}): VelaRef => ({ t, o: c, h: c, l: c, c, v: 1, ...extra })

console.log('— mapeamento de símbolos —')
caso('ouro: PAXG (Binance spot, filtra fim de semana) e depois GC=F; nenhum ao nosso nível', () => {
  const p = referenciasPara('XAUUSD', 'metal')
  assert.deepEqual(p.map((r) => [r.kind, r.symbol, r.sameLevel]), [['binance-spot', 'PAXGUSDT', false], ['yahoo', 'GC=F', false]])
  assert.equal(p[0].soHorasMercado, true)
  assert.ok(!p.some((r) => r.kind === 'binance-futures'), 'fapi dá 451 em iad1 — nunca no plano')
})
caso('prata/platina/paládio → futuros do Yahoo', () => {
  assert.equal(primeiro('XAGUSD', 'metal').symbol, 'SI=F')
  assert.equal(primeiro('XPTUSD', 'metal').symbol, 'PL=F')
  assert.equal(primeiro('XPDUSD', 'metal').symbol, 'PA=F')
})
caso('forex → XXXYYY=X ao mesmo nível (USDJPY=X, não JPY=X)', () => {
  assert.deepEqual(primeiro('EURUSD', 'forex'), { kind: 'yahoo', symbol: 'EURUSD=X', sameLevel: true })
  assert.equal(primeiro('GBPUSD', 'forex').symbol, 'GBPUSD=X')
  assert.equal(primeiro('USDJPY', 'forex').symbol, 'USDJPY=X')
  assert.equal(primeiro('EURUSD.s').symbol, 'EURUSD=X', 'sufixo .s da corretora sai; classe adivinha-se')
})
caso('índices → futuros primeiro (≈23 h), índice à vista de reserva; fora do nosso nível', () => {
  assert.deepEqual(referenciasPara('US30', 'indice').map((r) => r.symbol), ['YM=F', '^DJI'])
  assert.deepEqual(referenciasPara('NAS100', 'indice').map((r) => r.symbol), ['NQ=F', '^NDX'])
  assert.deepEqual(referenciasPara('US500', 'indice').map((r) => r.symbol), ['ES=F', '^GSPC'])
  assert.equal(primeiro('GER40', 'indice').symbol, '^GDAXI')
  assert.equal(primeiro('DJ30FT', 'indice').symbol, 'YM=F', 'variantes FT seguem o índice')
  assert.ok(referenciasPara('US30', 'indice').every((r) => !r.sameLevel))
})
caso('energia e agrícolas', () => {
  assert.equal(primeiro('USOIL', 'energia').symbol, 'CL=F')
  assert.equal(primeiro('UKOIL', 'energia').symbol, 'BZ=F')
  assert.equal(primeiro('COFFEE', 'commodity').symbol, 'KC=F')
})
caso('cripto → Binance spot, com os nomes curtos da corretora', () => {
  assert.deepEqual(primeiro('BTCUSD', 'cripto'), { kind: 'binance-spot', symbol: 'BTCUSDT', sameLevel: true })
  assert.equal(primeiro('DOGUSD', 'cripto').symbol, 'DOGEUSDT')
  assert.equal(primeiro('LNKUSD', 'cripto').symbol, 'LINKUSDT')
  assert.equal(primeiro('BTCEUR', 'cripto').symbol, 'BTCEUR')
  assert.deepEqual(referenciasPara('BTCXAU', 'cripto'), [], 'par sem mercado na Binance → sem reserva')
})
caso('acções/ETF: ticker; nomes da corretora; .24H e sufixo USD saem', () => {
  assert.equal(primeiro('AAPL', 'acao').symbol, 'AAPL')
  assert.equal(primeiro('AAPL.24H', 'acao').symbol, 'AAPL')
  assert.equal(primeiro('NVDAUSD', 'acao').symbol, 'NVDA')
  assert.equal(primeiro('NVIDIA', 'acao').symbol, 'NVDA')
  assert.equal(primeiro('AMAZON.24H', 'acao').symbol, 'AMZN')
  assert.equal(primeiro('BRKB', 'acao').symbol, 'BRK-B')
  assert.equal(primeiro('SPY', 'etf').symbol, 'SPY')
})
caso('acções europeias (lucro em EUR/GBX) ficam SEM reserva — o ticker colide com o dos EUA', () => {
  assert.deepEqual(referenciasPara('BMW', 'acao', 'EUR'), [])
  assert.deepEqual(referenciasPara('ADS', 'acao', 'EUR'), [])
  assert.deepEqual(referenciasPara('BARC', 'acao', 'GBX'), [])
  assert.equal(primeiro('MSFT', 'acao', 'USD').symbol, 'MSFT')
})
caso('sem mapeamento → vazio (nunca um instrumento inventado)', () => {
  assert.deepEqual(referenciasPara('EURIBOR3M', 'obrigacao'), [])
  assert.deepEqual(referenciasPara('XAUEUR', 'metal'), [])
})

console.log('— agregação H4 e parsing —')
const H = 3600
caso('H4 = quatro H1 alinhados à época UTC (00/04/08…)', () => {
  const base = 1_789_948_800 // 2026-09-21 00:00 UTC (múltiplo de 4 h)
  const horas = Array.from({ length: 8 }, (_, i) => ({ t: base + i * H, o: 10 + i, h: 20 + i, l: 5 - i, c: 11 + i, v: 1 }))
  const h4 = agregarRef(horas, 4 * H)
  assert.equal(h4.length, 2)
  assert.deepEqual(h4[0], { t: base, o: 10, h: 23, l: 2, c: 14, v: 4 })
  assert.deepEqual(h4[1], { t: base + 4 * H, o: 14, h: 27, l: -2, c: 18, v: 4 })
  assert.equal(h4[0].t % (4 * H), 0)
})
caso('H4 começado a meio do bloco não inventa vela: agrega o que há nesse bloco', () => {
  const base = 1_789_948_800 + 2 * H
  const h4 = agregarRef([v(base, 1), v(base + H, 2), v(base + 2 * H, 3)], 4 * H)
  assert.deepEqual(h4.map((x) => [x.t - 1_789_948_800, x.o, x.c]), [[0, 1, 2], [4 * H, 3, 3]])
})
caso('Yahoo 60m → H4 agregado; nulos saem; o ponto desalinhado do fim funde-se na vela dele', () => {
  const base = 1_789_948_800
  const ts = [base, base + H, base + 2 * H, base + 3 * H, base + 4 * H, base + 4 * H + 125]
  const json = { chart: { result: [{ timestamp: ts, meta: { gmtoffset: 3600 }, indicators: { quote: [{
    open: [1, 2, null, 4, 5, 6], high: [2, 3, null, 5, 6, 9], low: [0.5, 1, null, 3, 4, 5], close: [2, 3, null, 5, 6, 7], volume: [0, 0, 0, 0, 0, 0],
  }] } }] } }
  const h4 = velasDoYahoo(json, 'H4')
  assert.deepEqual(h4.map((x) => [x.t - base, x.o, x.h, x.l, x.c]), [[0, 1, 5, 0.5, 5], [4 * H, 5, 9, 4, 7]])
  const h1 = velasDoYahoo(json, 'H1')
  assert.equal(h1.length, 4, '4 horas válidas (a das 02:00 é nula; a das 04:02 funde-se nas 04:00)')
  assert.equal(h1[h1.length - 1].c, 7)
})
caso('Yahoo D1: o dia da bolsa (23:00 UTC de véspera em Londres) fica no seu dia de calendário', () => {
  const dia = 1_789_948_800 // 21/09 00:00 UTC
  const json = { chart: { result: [{ timestamp: [dia - 3600], meta: { gmtoffset: 3600 }, indicators: { quote: [{ open: [1], high: [2], low: [0.5], close: [1.5] }] } }] } }
  assert.equal(velasDoYahoo(json, 'D1')[0].t, dia)
})
caso('Binance klines → segundos, ordenadas', () => {
  const r = velasDaBinance([[2000_000, '2', '3', '1', '2.5', '10'], [1000_000, '1', '2', '0.5', '1.5', '5']])
  assert.deepEqual(r.map((x) => [x.t, x.c, x.v]), [[1000, 1.5, 5], [2000, 2.5, 10]])
})
caso('cotação: o fecho do último minuto (mais casas) em vez do regularMarketPrice arredondado', () => {
  const c = cotacaoDoYahoo({ chart: { result: [{ timestamp: [100, 160], meta: { regularMarketPrice: 1.1484, regularMarketTime: 170 }, indicators: { quote: [{ close: [1.14824, null] }] } }] } })
  assert.deepEqual(c, { preco: 1.14824, emSeg: 170 })
})
caso('janela Yahoo: 1m nunca passa 7 dias nem 30 para trás; acções pedem janela mais larga', () => {
  const agora = 1_790_000_000
  const m1 = janelaYahoo('M1', 5000, null, agora)
  assert.equal(m1.intervalo, '1m')
  assert.ok(m1.period2 - m1.period1 <= 7 * 86400)
  const velho = janelaYahoo('M1', 300, agora - 40 * 86400, agora)
  assert.ok(velho.period1 >= agora - 29 * 86400)
  const fx = janelaYahoo('M15', 300, null, agora)
  const acc = janelaYahoo('M15', 300, null, agora, true)
  assert.ok(acc.period2 - acc.period1 > fx.period2 - fx.period1)
  assert.equal(janelaYahoo('H4', 300, null, agora).intervalo, '60m')
})
caso('soAberto tira as velas com o nosso mercado fechado (PAXG ao sábado)', () => {
  const sab = Date.UTC(2026, 8, 19, 12) / 1000
  const seg = Date.UTC(2026, 8, 21, 9) / 1000
  const r = soAberto([v(sab, 1), v(seg, 2)], (t) => new Date(t * 1000).getUTCDay() !== 6)
  assert.deepEqual(r.map((x) => x.c), [2])
})

console.log('— reescala ancorada —')
const serie = [v(1000, 100), v(1900, 102), v(2800, 104), v(3700, 106)]
caso('fator = nosso preço ÷ fecho da referência NO instante da âncora (não o último)', () => {
  const f = fatorAncorado(serie, { preco: 101.98, emSeg: 2000 }, 900 * 3)
  assert.ok(Math.abs(f! - 101.98 / 102) < 1e-12)
})
caso('âncora antes das velas, ou depois delas mais do que a folga → null (pede-se à parte)', () => {
  assert.equal(fatorAncorado(serie, { preco: 100, emSeg: 500 }, 2700), null)
  assert.equal(fatorAncorado(serie, { preco: 100, emSeg: 3700 + 5000 }, 2700), null)
  assert.equal(fatorAncorado(serie, null, 2700), null)
  assert.ok(fatorAncorado(serie, { preco: 106, emSeg: 3700 + 600 }, 2700) != null, 'referência 10 min atrasada ainda serve')
})
caso('ouro: PAXG 4348 com o nosso 4354 → ×1,0014; GC=F 4390 → ×0,9918; outro instrumento ×2 → inválido', () => {
  assert.ok(fatorValido(4354 / 4348))
  assert.ok(fatorValido(4354 / 4390))
  assert.ok(!fatorValido(2))
  assert.ok(!fatorValido(null))
})
caso('reescalar multiplica OHLC, arredonda aos dígitos e mantém tempo e volume', () => {
  const r = reescalar([{ t: 5, o: 100, h: 110, l: 90, c: 105, v: 7 }], 1.0014, 2)
  assert.deepEqual(r, [{ t: 5, o: 100.14, h: 110.15, l: 90.13, c: 105.15, v: 7 }])
  assert.deepEqual(reescalar([{ t: 5, o: 1.148369312286377, h: 1.15, l: 1.14, c: 1.14824, v: 0 }], 1, 5)[0].o, 1.14837, 'f=1 só arredonda')
})

console.log('— recurso ao vivo do motor (fonte-yahoo) —')
const classes = new Set(['forex', 'metal'])
const fx = { classe: 'forex', digits: 5, spread_pontos: 12 }
caso('forex entra pelo =X; ouro/prata pela gold-api (spot); índices, futuros e cripto NÃO entram por defeito', () => {
  assert.deepEqual(planoVivo('EURUSD', fx, classes), { tipo: 'yahoo', ticker: 'EURUSD=X', sameLevel: true })
  assert.deepEqual(planoVivo('XAUUSD', { classe: 'metal', digits: 2, spread_pontos: 30 }, classes), { tipo: 'metal', metal: 'XAU' })
  assert.equal(planoVivo('US30', { classe: 'indice', digits: 1, spread_pontos: 20 }, classes), null)
  assert.equal(planoVivo('BTCUSD', { classe: 'cripto', digits: 2, spread_pontos: 1 }, new Set(['cripto'])), null, 'cripto é da fonte-binance')
  assert.equal(planoVivo('XAUEUR', { classe: 'metal', digits: 2, spread_pontos: 30 }, classes), null)
})
caso('com YAHOO_CLASSES=indice o índice entra mas marcado fora do nosso nível (só com fator)', () => {
  assert.deepEqual(planoVivo('US30', { classe: 'indice', digits: 1, spread_pontos: 20 }, new Set(['indice'])), { tipo: 'yahoo', ticker: 'YM=F', sameLevel: false })
})
caso('bid/ask: spread do último preço conhecido; senão o do catálogo; nunca ask <= bid', () => {
  assert.deepEqual(bidAsk(1.14824, 5, 0.00027, 12), { bid: 1.1481, ask: 1.14837 })
  assert.deepEqual(bidAsk(1.14824, 5, null, 12), { bid: 1.14818, ask: 1.1483 })
  const z = bidAsk(157.2, 3, 0, 0)
  assert.ok(z.ask > z.bid)
  assert.deepEqual(bidAsk(4354, 2, 5000, 39), { bid: 4353.81, ask: 4354.2 }, 'spread absurdo (> 1 %) ignora-se')
})

console.log(`\n${n} verificações certas`)
