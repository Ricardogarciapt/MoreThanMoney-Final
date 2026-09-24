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
  /**
   * Hora a que o MERCADO fez a perna (ms), quando a fonte a sabe dizer. Um cruzado não pode
   * provar-se mais fresco do que a perna que não se prova: basta uma NULA para o cruzado ficar
   * nulo também.
   */
  emMercado?: number | null
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

/**
 * OS CRUZADOS DE FOREX — os pares que a mestre negoceia e que a corretora não nos põe no ecrã.
 *
 * O terminal do conector só publica o que está no Market Watch, e lá dentro estão onze símbolos:
 * EURUSD, GBPUSD, USDCHF, USDJPY, USDCAD, AUDUSD, AUDNZD, AUDCAD, AUDCHF, AUDJPY e XAUUSD. Da
 * whitelist de execução isso cobre quatro — e os outros onze ficavam com o Yahoo de há uma semana,
 * que a execução (5 s) recusa. A estratégia aceitava o sinal e depois não abria nada.
 *
 * Estes onze pares fazem-se todos das onze pernas que já lá estão, pela mesma conta que a corretora
 * faz por dentro: EURCHF = EURUSD × USDCHF, EURGBP = EURUSD ÷ GBPUSD, CADJPY = USDJPY ÷ USDCAD.
 * Não é um preço inventado — são os DOIS preços da corretora onde a ordem vai entrar, com a hora de
 * mercado provada nas duas pernas e o spread somado (comprar uma e vender a outra custa os dois).
 *
 * Isto NÃO substitui ter o par no Market Watch: o preço directo da corretora tem o spread real do
 * par, não a soma de dois. É o que se tem enquanto o par não lá estiver — e é muito melhor do que o
 * nada que havia antes.
 *
 * NZDCHF fica de fora de propósito: precisava de TRÊS pernas (AUDUSD ÷ AUDNZD × USDCHF), e a regra
 * desta casa é que um cruzado nunca se faz de outro cruzado — herdava-lhe o erro e o spread. Esse
 * par só se resolve pondo-o no Market Watch.
 */
export const CRUZADOS_FOREX: readonly Cruzado[] = [
  // … contra o franco: par/USD × USD/CHF
  { symbol: 'EURCHF', a: 'EURUSD', b: 'USDCHF', operacao: 'multiplicar' },
  { symbol: 'GBPCHF', a: 'GBPUSD', b: 'USDCHF', operacao: 'multiplicar' },
  // CADCHF = USD/CHF ÷ USD/CAD (o dólar corta-se dos dois lados)
  { symbol: 'CADCHF', a: 'USDCHF', b: 'USDCAD', operacao: 'dividir' },
  // … contra o dólar canadiano: par/USD × USD/CAD
  { symbol: 'EURCAD', a: 'EURUSD', b: 'USDCAD', operacao: 'multiplicar' },
  { symbol: 'GBPCAD', a: 'GBPUSD', b: 'USDCAD', operacao: 'multiplicar' },
  // … contra o iene
  { symbol: 'GBPJPY', a: 'GBPUSD', b: 'USDJPY', operacao: 'multiplicar' },
  { symbol: 'CADJPY', a: 'USDJPY', b: 'USDCAD', operacao: 'dividir' },
  // … entre pares cotados em dólar: divide-se um pelo outro
  { symbol: 'EURGBP', a: 'EURUSD', b: 'GBPUSD', operacao: 'dividir' },
  { symbol: 'EURAUD', a: 'EURUSD', b: 'AUDUSD', operacao: 'dividir' },
  { symbol: 'NZDUSD', a: 'AUDUSD', b: 'AUDNZD', operacao: 'dividir' },
]

/** Uma perna com mais do que isto não serve para calcular nada. */
export const FRESCURA_MAX_MS = 30_000

/**
 * O MESMO, MAS PARA QUEM ABRE ORDENS: as pernas de um cruzado de forex têm de ter menos do que a
 * própria execução exige (5 s), senão o cruzado entrava com a idade verdadeira, empurrava para fora
 * um preço mais fresco de outra fonte e o símbolo acabava PIOR do que estava. Trinta segundos
 * servem para desenhar um gráfico de cripto; não servem para dimensionar uma trade.
 */
export const FRESCURA_FOREX_MS = 5_000

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
  // A hora de mercado segue a mesma regra do `em`: a da perna mais velha, e NULA se alguma das
  // duas não a souber provar. Meio cruzado sem hora de mercado não é um cruzado com hora.
  const emMercado = a.emMercado != null && b.emMercado != null ? Math.min(a.emMercado, b.emMercado) : null
  return { bid, ask, em: Math.min(a.em, b.em), emMercado }
}

/** Todos os cruzados que se conseguem calcular agora. Nunca lança. */
export function cruzadosCalculaveis(
  ler: (symbol: string) => PrecoPerna | null | undefined,
  agora: number,
  cruzados: readonly Cruzado[] = CRUZADOS_CRIPTO,
  frescuraMaxMs = FRESCURA_MAX_MS,
): Array<{ symbol: string; bid: number; ask: number; em: number; emMercado: number | null }> {
  const out: Array<{ symbol: string; bid: number; ask: number; em: number; emMercado: number | null }> = []
  for (const c of cruzados) {
    const p = precoCruzado(c, ler, agora, frescuraMaxMs)
    if (p) out.push({ symbol: c.symbol, bid: p.bid, ask: p.ask, em: p.em, emMercado: p.emMercado ?? null })
  }
  return out
}
