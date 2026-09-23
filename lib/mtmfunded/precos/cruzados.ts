/**
 * OS CRUZADOS DE CRIPTO — os que nenhuma fonte cota, e que se calculam dos que ela cota.
 *
 * O catálogo tem 59 símbolos de cripto, mas a Binance só dá os que existem como par dela: os 36 em
 * dólar (BTCUSD, SOLUSD, XRPUSD…). Os outros 23 são CRUZADOS — BTCJPY, ETHEUR, BTCXAU, BTCETH — e
 * ficavam eternamente com o preço do dia em que alguém os viu pela última vez. Um preço velho é
 * pior do que nenhum: o ticket dimensiona a trade com ele e o gráfico desenha uma linha reta.
 *
 * Aqui não se inventa nada: cada cruzado sai de dois preços que JÁ temos ao vivo, pela mesma conta
 * que uma corretora faria. BTCJPY = BTCUSD × USDJPY. BTCEUR = BTCUSD ÷ EURUSD. BTCETH = BTCUSD ÷
 * ETHUSD. O spread do cruzado é o dos dois somado (comprar um e vender o outro custa os dois
 * spreads) — por isso o bid sai do bid×bid e o ask do ask×ask, nunca de um preço médio.
 *
 * Um cruzado só existe enquanto as DUAS pernas estiverem frescas. Se uma envelhecer, ele desaparece
 * — em vez de ficar a arrastar metade de um preço real. Puro: testado em __tests__/cruzados.check.ts.
 */

export interface PrecoPerna {
  bid: number
  ask: number
  /** ms desde a época — a hora do tick, não a da leitura. */
  em: number
}

export type Operacao = 'multiplicar' | 'dividir'

export interface Cruzado {
  symbol: string
  /** perna da esquerda (a que dá a moeda base) */
  a: string
  /** perna da direita */
  b: string
  operacao: Operacao
}

/**
 * Os cruzados do nosso catálogo e como se fazem.
 *
 * `multiplicar` quando a segunda perna converte a moeda da primeira (BTCUSD × USDJPY → BTCJPY);
 * `dividir` quando a segunda perna é o que se quer no denominador (BTCUSD ÷ EURUSD → BTCEUR, porque
 * EURUSD diz quantos dólares vale um euro).
 */
export const CRUZADOS_CRIPTO: readonly Cruzado[] = [
  // … em ienes: cripto/USD × USD/JPY
  { symbol: 'BTCJPY', a: 'BTCUSD', b: 'USDJPY', operacao: 'multiplicar' },
  { symbol: 'ETHJPY', a: 'ETHUSD', b: 'USDJPY', operacao: 'multiplicar' },
  { symbol: 'ADAJPY', a: 'ADAUSD', b: 'USDJPY', operacao: 'multiplicar' },
  { symbol: 'BCHJPY', a: 'BCHUSD', b: 'USDJPY', operacao: 'multiplicar' },
  { symbol: 'LTCJPY', a: 'LTCUSD', b: 'USDJPY', operacao: 'multiplicar' },
  { symbol: 'SOLJPY', a: 'SOLUSD', b: 'USDJPY', operacao: 'multiplicar' },
  { symbol: 'XLMJPY', a: 'XLMUSD', b: 'USDJPY', operacao: 'multiplicar' },
  { symbol: 'XRPJPY', a: 'XRPUSD', b: 'USDJPY', operacao: 'multiplicar' },
  // USDT vale ~1 USD: o par em ienes é, na prática, o USDJPY.
  { symbol: 'USDTJPY', a: 'USDJPY', b: 'USDJPY', operacao: 'dividir' },
  // … em euros: cripto/USD ÷ EUR/USD
  { symbol: 'BTCEUR', a: 'BTCUSD', b: 'EURUSD', operacao: 'dividir' },
  { symbol: 'ETHEUR', a: 'ETHUSD', b: 'EURUSD', operacao: 'dividir' },
  // … em ouro: quantas onças vale uma moeda
  { symbol: 'BTCXAU', a: 'BTCUSD', b: 'XAUUSD', operacao: 'dividir' },
  { symbol: 'ETHXAU', a: 'ETHUSD', b: 'XAUUSD', operacao: 'dividir' },
  // … cripto contra cripto
  { symbol: 'BTCETH', a: 'BTCUSD', b: 'ETHUSD', operacao: 'dividir' },
  { symbol: 'BTCBCH', a: 'BTCUSD', b: 'BCHUSD', operacao: 'dividir' },
  { symbol: 'BTCLTC', a: 'BTCUSD', b: 'LTCUSD', operacao: 'dividir' },
  { symbol: 'ETHBCH', a: 'ETHUSD', b: 'BCHUSD', operacao: 'dividir' },
  { symbol: 'ETHLTC', a: 'ETHUSD', b: 'LTCUSD', operacao: 'dividir' },
]

/** Uma perna com mais do que isto não serve para calcular nada. */
export const FRESCURA_MAX_MS = 30_000

/**
 * O preço de um cruzado, ou `null` se alguma perna faltar, estiver velha ou for absurda.
 *
 * A hora do cruzado é a da perna MAIS VELHA: dizer que é «de agora» quando metade dele tem 20
 * segundos seria mentir ao motor, que decide entradas e stops pela frescura do preço.
 */
export function precoCruzado(
  c: Cruzado,
  ler: (symbol: string) => PrecoPerna | null | undefined,
  agora: number,
  frescuraMaxMs = FRESCURA_MAX_MS,
): PrecoPerna | null {
  const a = ler(c.a)
  const b = ler(c.b)
  if (!a || !b) return null
  if (!(a.bid > 0 && a.ask > 0 && b.bid > 0 && b.ask > 0)) return null
  if (agora - a.em > frescuraMaxMs || agora - b.em > frescuraMaxMs) return null

  const bid = c.operacao === 'multiplicar' ? a.bid * b.bid : a.bid / b.ask
  const ask = c.operacao === 'multiplicar' ? a.ask * b.ask : a.ask / b.bid
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return null
  // Um cruzado com o ask abaixo do bid é conta mal feita — não sai daqui.
  if (ask < bid) return null
  return { bid, ask, em: Math.min(a.em, b.em) }
}

/** Todos os cruzados que se conseguem calcular agora. Nunca lança. */
export function cruzadosCalculaveis(
  ler: (symbol: string) => PrecoPerna | null | undefined,
  agora: number,
  cruzados: readonly Cruzado[] = CRUZADOS_CRIPTO,
  frescuraMaxMs = FRESCURA_MAX_MS,
): Array<{ symbol: string; bid: number; ask: number; em: number }> {
  const out: Array<{ symbol: string; bid: number; ask: number; em: number }> = []
  for (const c of cruzados) {
    const p = precoCruzado(c, ler, agora, frescuraMaxMs)
    if (p) out.push({ symbol: c.symbol, bid: p.bid, ask: p.ask, em: p.em })
  }
  return out
}
