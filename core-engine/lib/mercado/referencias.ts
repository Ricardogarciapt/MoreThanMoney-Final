/**
 * REFERÊNCIAS DE MERCADO SEM METAAPI — funções PURAS (sem fetch, sem Next, sem Supabase).
 *
 * Partilhadas pelo servidor (velas de reserva do WebTrader, Terminal MTM) e pelo motor da VPS
 * (services/funded-motor/fonte-yahoo.ts, empacotado por esbuild — por isso nada de `@/`).
 *
 * Doutrina de 2026-09-21: o sistema interno NUNCA depende da MetaApi. Quando ela não dá velas,
 * cada símbolo do catálogo tem um plano de referências públicas e grátis:
 *   · cripto → Binance spot (api.binance.com / data-api.binance.vision — não bloqueiam os EUA);
 *   · ouro → PAXG na Binance (espelho spot, tempo real) e GC=F no Yahoo;
 *   · prata/platina/paládio, energia, agrícolas, índices → futuros/índices do Yahoo;
 *   · forex → par `XXXYYY=X` do Yahoo (tempo real, ao nível do spot);
 *   · acções/ETF → ticker do Yahoo.
 * `sameLevel` diz se a referência está ao nível do NOSSO preço. Quando não está (futuros contra
 * CFD/spot), as velas reescalam-se por um fator ANCORADO no tempo: o nosso último preço conhecido
 * (funded_precos) dividido pelo fecho da referência NESSE instante. Ancorar no tempo — e não no
 * último fecho — é o que deixa usar um preço de sexta-feira sem deslocar o gráfico de segunda.
 *
 * Atrasos medidos a 21/09: futuros CME/COMEX no Yahoo ~10 min, ^GDAXI/^FTSE ~15 min, forex =X
 * ~3 s. Para VELAS (histórico) o atraso não pesa — a vela viva vem dos preços ao vivo. Para
 * PREÇOS negociáveis pesa: o motor só injeta o que chega fresco (ver fonte-yahoo.ts).
 */

export interface VelaRef { t: number; o: number; h: number; l: number; c: number; v: number }

export type KindRef = 'binance-spot' | 'binance-futures' | 'yahoo'

export interface RefMercado {
  kind: KindRef
  symbol: string
  /** o preço da referência está ao nível do nosso (spot = spot)? Se não, reescala-se. */
  sameLevel: boolean
  /**
   * A referência negoceia 24/7 mas o nosso símbolo não (PAXG contra o ouro): as velas fora do
   * horário do nosso mercado (fim de semana) saem.
   */
  soHorasMercado?: boolean
  /** Sessão curta (acções, índices à vista): a janela a pedir em tempo tem de ser mais larga. */
  sessaoCurta?: boolean
}

export const TFS = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1'] as const
export const TF_SEG: Record<string, number> = { M1: 60, M5: 300, M15: 900, H1: 3600, H4: 14400, D1: 86400 }
export const TF_BINANCE: Record<string, string> = { M1: '1m', M5: '5m', M15: '15m', H1: '1h', H4: '4h', D1: '1d' }
/** H4 não existe no Yahoo: pede-se 1h e agrega-se (alinhado à época UTC, como a MetaApi). */
export const TF_YAHOO: Record<string, string> = { M1: '1m', M5: '5m', M15: '15m', H1: '60m', H4: '60m', D1: '1d' }
/** Quanto para trás o Yahoo serve cada intervalo (dias) e o maior intervalo de tempo num só pedido. */
const YAHOO_HISTORICO_DIAS: Record<string, number> = { '1m': 29, '5m': 59, '15m': 59, '60m': 729, '1d': 36500 }
const YAHOO_JANELA_MAX_DIAS: Record<string, number> = { '1m': 7, '5m': 59, '15m': 59, '60m': 729, '1d': 36500 }

// ─────────────────────────────────────────────────────────────────────────────
// Mapeamento de símbolos
// ─────────────────────────────────────────────────────────────────────────────

const y = (symbol: string, sameLevel: boolean, extra: Partial<RefMercado> = {}): RefMercado => ({ kind: 'yahoo', symbol, sameLevel, ...extra })
const b = (symbol: string, sameLevel = true, extra: Partial<RefMercado> = {}): RefMercado => ({ kind: 'binance-spot', symbol, sameLevel, ...extra })

/**
 * Índices CFD → Yahoo. Futuros primeiro (negoceiam ~23 h como o CFD); o índice à vista só serve de
 * reserva (sessão curta). Todos `sameLevel:false`: o CFD tem a sua base.
 */
const INDICES: Record<string, RefMercado[]> = {
  US30: [y('YM=F', false), y('^DJI', false, { sessaoCurta: true })],
  NAS100: [y('NQ=F', false), y('^NDX', false, { sessaoCurta: true })],
  US500: [y('ES=F', false), y('^GSPC', false, { sessaoCurta: true })],
  US2000: [y('RTY=F', false), y('^RUT', false, { sessaoCurta: true })],
  GER40: [y('^GDAXI', false, { sessaoCurta: true })],
  UK100: [y('^FTSE', false, { sessaoCurta: true })],
  JPN225: [y('NIY=F', false), y('^N225', false, { sessaoCurta: true })],
  FRA40: [y('^FCHI', false, { sessaoCurta: true })],
  EU50: [y('^STOXX50E', false, { sessaoCurta: true })],
  ES35: [y('^IBEX', false, { sessaoCurta: true })],
  NETH25: [y('^AEX', false, { sessaoCurta: true })],
  SWI20: [y('^SSMI', false, { sessaoCurta: true })],
  HK50: [y('^HSI', false, { sessaoCurta: true })],
  CHINAH: [y('^HSCE', false, { sessaoCurta: true })],
  SPI200: [y('^AXJO', false, { sessaoCurta: true })],
  BVSPX: [y('^BVSP', false, { sessaoCurta: true })],
  TWINDEX: [y('^TWII', false, { sessaoCurta: true })],
  USDX: [y('DX-Y.NYB', false)],
  VIX: [y('^VIX', false, { sessaoCurta: true })],
}
/** Variantes «FT» da corretora (futuros) seguem o mesmo índice. */
for (const [ft, base] of [['DJ30FT', 'US30'], ['NAS100FT', 'NAS100'], ['SP500FT', 'US500'], ['GER40FT', 'GER40'], ['UK100FT', 'UK100'], ['JPN225FT', 'JPN225'], ['FRA40FT', 'FRA40'], ['HK50FT', 'HK50']] as const) {
  INDICES[ft] = INDICES[base]
}

const METAIS: Record<string, RefMercado[]> = {
  // PAXG = 1 onça, arbitrado ao spot (tempo real, 24/7 → filtra-se o fim de semana); GC=F atrasa 10 min.
  XAUUSD: [b('PAXGUSDT', false, { soHorasMercado: true }), y('GC=F', false)],
  XAGUSD: [y('SI=F', false)],
  XPTUSD: [y('PL=F', false)],
  XPDUSD: [y('PA=F', false)],
}

const ENERGIA_E_AGRICOLAS: Record<string, RefMercado[]> = {
  USOIL: [y('CL=F', false)],
  'CL-OIL': [y('CL=F', false)],
  UKOIL: [y('BZ=F', false)],
  UKOUSDFT: [y('BZ=F', false)],
  NG: [y('NG=F', false)],
  GAS: [y('NG=F', false)],
  WHEAT: [y('ZW=F', false)],
  COCOA: [y('CC=F', false)],
  COFFEE: [y('KC=F', false)],
  COPPER: [y('HG=F', false)],
  COTTON: [y('CT=F', false)],
  OJ: [y('OJ=F', false)],
  SOYBEAN: [y('ZS=F', false)],
  SUGAR: [y('SB=F', false)],
  USNOTE10Y: [y('ZN=F', false)],
}

/** Nomes da corretora para acções que não são o ticker. */
const ACCOES_NOMES: Record<string, string> = {
  AMAZON: 'AMZN', NVIDIA: 'NVDA', ALIBABA: 'BABA', BAIDU: 'BIDU', BOEING: 'BA', CISCO: 'CSCO', CITI: 'C',
  DISNEY: 'DIS', EXXON: 'XOM', INTEL: 'INTC', PFIZER: 'PFE', VISA: 'V', TOYOTA: 'TM', ABBVIE: 'ABBV',
  'AT&T': 'T', NOKIA: 'NOK', 'ASML-US': 'ASML', BRKB: 'BRK-B',
}

/** Cripto: nomes curtos da corretora → base da Binance. */
const CRIPTO_BASES: Record<string, string> = {
  DOG: 'DOGE', LNK: 'LINK', AVA: 'AVAX', ATM: 'ATOM', ALG: 'ALGO', IOT: 'IOTA', NER: 'NEAR', SHB: 'SHIB',
  SAN: 'SAND', SUS: 'SUSHI',
}
const CRIPTO_COTACOES: Record<string, string> = { USD: 'USDT', EUR: 'EUR', JPY: 'JPY' }

export type ClasseCatalogo = 'forex' | 'metal' | 'indice' | 'cripto' | 'acao' | 'etf' | 'energia' | 'commodity' | 'obrigacao' | string

/** Adivinha a classe só pelo nome (quando o catálogo não está à mão — testes, motor sem linha). */
export function classePorNome(symbol: string): ClasseCatalogo | null {
  const s = symbol.toUpperCase()
  if (METAIS[s]) return 'metal'
  if (INDICES[s]) return 'indice'
  if (ENERGIA_E_AGRICOLAS[s]) return 'energia'
  if (/^(BTC|ETH|SOL|XRP|BNB|ADA|DOG|LTC|LNK|DOT|AVA|TRX|XLM|BCH)[A-Z]{3,4}$/.test(s)) return 'cripto'
  if (/^[A-Z]{6}$/.test(s)) return 'forex'
  return null
}

/**
 * Plano de referências para um símbolo do catálogo, pela ordem a tentar. Vazio = sem reserva
 * (melhor nada do que o instrumento errado: acções europeias têm tickers que colidem com os dos EUA).
 */
export function referenciasPara(symbol: string, classe?: ClasseCatalogo | null, moedaLucro?: string | null): RefMercado[] {
  const s = symbol.trim().toUpperCase().replace(/\.S$/, '')
  const c = classe ?? classePorNome(s)

  if (METAIS[s]) return METAIS[s]
  if (INDICES[s]) return INDICES[s]
  if (ENERGIA_E_AGRICOLAS[s]) return ENERGIA_E_AGRICOLAS[s]

  if (c === 'cripto') {
    const m = s.match(/^([A-Z0-9]{2,6}?)(USDT|USD|EUR|JPY)$/)
    if (!m) return []
    const base = CRIPTO_BASES[m[1]] ?? m[1]
    const cot = m[2] === 'USDT' ? 'USDT' : CRIPTO_COTACOES[m[2]]
    if (!cot) return []
    // BTCUSD/ETHUSD vivos vêm da própria Binance (fonte-binance.ts): mesmo nível.
    return [b(`${base}${cot}`, true)]
  }
  if (c === 'forex') {
    if (!/^[A-Z]{6}$/.test(s)) return []
    return [y(`${s}=X`, true)]
  }
  if (c === 'acao' || c === 'etf') {
    // Acções de Frankfurt/Londres/Amesterdão (lucro em EUR/GBX) têm tickers que colidem com os dos
    // EUA (ADS, BMW, AMS…): o Yahoo daria outra empresa. Só as cotadas em USD.
    if (moedaLucro && moedaLucro.toUpperCase() !== 'USD') return []
    let t = ACCOES_NOMES[s] ?? s.replace(/\.24H$/, '')
    t = ACCOES_NOMES[t] ?? t
    if (/^[A-Z]{1,5}USD$/.test(t) && t.length > 3) t = t.slice(0, -3)
    if (!/^[A-Z][A-Z.-]{0,5}$/.test(t)) return []
    return [y(t, true, { sessaoCurta: true })]
  }
  return []
}

// ─────────────────────────────────────────────────────────────────────────────
// Janelas e parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Janela em tempo (period1/period2, unix s) para pedir ~`limite` velas ao Yahoo. Mercados fechados
 * (fim de semana; acções só 6,5 h/dia) pedem uma janela mais larga do que limite×tf, respeitando o
 * que o Yahoo serve para cada intervalo (1m: 7 dias por pedido e só os últimos 30).
 */
export function janelaYahoo(tf: string, limite: number, ateSeg: number | null, agoraSeg: number, sessaoCurta = false): { period1: number; period2: number; intervalo: string } {
  const intervalo = TF_YAHOO[tf] ?? '5m'
  const seg = TF_SEG[tf] ?? 300
  const period2 = Math.min(agoraSeg + 60, ateSeg ?? agoraSeg + 60)
  const fator = tf === 'D1' ? 1.5 : sessaoCurta ? 4.2 : 1.5
  let span = Math.ceil(limite * seg * fator) + 3 * 86400
  span = Math.min(span, YAHOO_JANELA_MAX_DIAS[intervalo] * 86400)
  const minimo = agoraSeg - YAHOO_HISTORICO_DIAS[intervalo] * 86400
  const period1 = Math.max(period2 - span, minimo)
  return { period1, period2, intervalo }
}

const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/**
 * Agrega velas (ordenadas por tempo) em velas de `seg` segundos, alinhadas à época UTC. Também
 * alinha e funde as velas «desalinhadas» que o Yahoo acrescenta no fim (o ponto da última cotação).
 */
export function agregarRef(velas: VelaRef[], seg: number): VelaRef[] {
  const out: VelaRef[] = []
  let a: VelaRef | null = null
  for (const v of velas) {
    const t = Math.floor(v.t / seg) * seg
    if (!a || a.t !== t) {
      if (a) out.push(a)
      a = { t, o: v.o, h: v.h, l: v.l, c: v.c, v: v.v || 0 }
    } else {
      if (v.h > a.h) a.h = v.h
      if (v.l < a.l) a.l = v.l
      a.c = v.c
      a.v += v.v || 0
    }
  }
  if (a) out.push(a)
  return out
}

/** Resposta do /v8/finance/chart do Yahoo → velas do timeframe `tf` (H4 agregado de 1h). */
export function velasDoYahoo(json: unknown, tf: string): VelaRef[] {
  const res = (json as { chart?: { result?: Array<Record<string, unknown>> } })?.chart?.result?.[0] as
    | { timestamp?: number[]; meta?: { gmtoffset?: number }; indicators?: { quote?: Array<Record<string, Array<number | null>>> } }
    | undefined
  const ts = res?.timestamp ?? []
  const q = res?.indicators?.quote?.[0] ?? {}
  const off = Number(res?.meta?.gmtoffset) || 0
  const brutas: VelaRef[] = []
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
    if (!ok(o) || !ok(h) || !ok(l) || !ok(c)) continue
    // D1: o Yahoo marca o dia à meia-noite da bolsa (23:00 UTC de véspera no forex de Londres):
    // somar o desvio da bolsa põe cada vela no seu dia de calendário.
    const t = tf === 'D1' ? ts[i] + off : ts[i]
    brutas.push({ t, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: Number(q.volume?.[i]) || 0 })
  }
  brutas.sort((x, z) => x.t - z.t)
  return agregarRef(brutas, TF_SEG[tf] ?? 300)
}

/** Klines da Binance (spot ou futuros) → velas em segundos. */
export function velasDaBinance(json: unknown): VelaRef[] {
  if (!Array.isArray(json)) return []
  const out: VelaRef[] = []
  for (const k of json) {
    const a = k as Array<string | number>
    const v = { t: Math.floor(Number(a[0]) / 1000), o: Number(a[1]), h: Number(a[2]), l: Number(a[3]), c: Number(a[4]), v: Number(a[5]) || 0 }
    if (Number.isFinite(v.t) && ok(v.o) && ok(v.h) && ok(v.l) && ok(v.c)) out.push(v)
  }
  return out.sort((x, z) => x.t - z.t)
}

/** Última cotação do /v8/finance/chart (preço e instante), para o feed ao vivo do motor. */
export function cotacaoDoYahoo(json: unknown): { preco: number; emSeg: number } | null {
  const res = (json as { chart?: { result?: Array<Record<string, unknown>> } })?.chart?.result?.[0] as
    | { timestamp?: number[]; meta?: { regularMarketPrice?: number; regularMarketTime?: number }; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }
    | undefined
  if (!res) return null
  const ts = res.timestamp ?? []
  const closes = res.indicators?.quote?.[0]?.close ?? []
  const emSeg = Number(res.meta?.regularMarketTime) || 0
  // O fecho do último minuto tem mais casas do que o regularMarketPrice (arredondado a 4 no forex).
  for (let i = ts.length - 1; i >= 0; i--) {
    const c = closes[i]
    if (ok(c)) return { preco: c, emSeg: Math.max(emSeg, ts[i]) }
  }
  const p = res.meta?.regularMarketPrice
  return ok(p) && emSeg ? { preco: p, emSeg } : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Reescala ancorada
// ─────────────────────────────────────────────────────────────────────────────

export interface Ancora { preco: number; emSeg: number }

/** Limites do fator: fora disto é outro instrumento (ou um preço estragado) — não se usa. */
export const FATOR_MIN = 0.9
export const FATOR_MAX = 1.1

/**
 * Fator nosso/referência no instante da âncora: o fecho da vela que contém (ou precede) esse
 * instante. `folgaSeg` = o maior buraco aceitável entre a vela e a âncora (mercado fechado à hora
 * da âncora → a última vela antes). null = as velas não cobrem a âncora (pede-se à parte).
 */
export function fatorAncorado(velas: VelaRef[], ancora: Ancora | null, folgaSeg: number): number | null {
  if (!ancora || !(ancora.preco > 0) || !velas.length) return null
  if (ancora.emSeg < velas[0].t) return null
  // pesquisa binária: última vela com t <= âncora
  let lo = 0, hi = velas.length - 1, idx = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (velas[m].t <= ancora.emSeg) { idx = m; lo = m + 1 } else hi = m - 1
  }
  if (idx < 0) return null
  // A âncora é depois da última vela recebida (referência atrasada, ~10 min): só serve se o buraco for curto.
  if (ancora.emSeg - velas[idx].t > folgaSeg) return null
  const f = ancora.preco / velas[idx].c
  return Number.isFinite(f) ? f : null
}

export const fatorValido = (f: number | null | undefined): f is number => typeof f === 'number' && f >= FATOR_MIN && f <= FATOR_MAX

/** Multiplica pelo fator e arredonda aos dígitos do símbolo (com f = 1 só arredonda). */
export function reescalar(velas: VelaRef[], f: number, casas?: number): VelaRef[] {
  const arredonda = casas != null && casas >= 0 && casas <= 10
  if (f === 1 && !arredonda) return velas
  const r = arredonda ? (x: number) => Number((x * f).toFixed(casas)) : (x: number) => x * f
  return velas.map((v) => ({ t: v.t, o: r(v.o), h: r(v.h), l: r(v.l), c: r(v.c), v: v.v }))
}

/**
 * Referências 24/7 (PAXG) para um símbolo com horário: tira as velas com o nosso mercado fechado.
 * `aberto` vem de fora (lib/mtmcopy/market-hours → isMarketOpen) para isto continuar puro.
 */
export function soAberto(velas: VelaRef[], aberto: (emSeg: number) => boolean): VelaRef[] {
  return velas.filter((v) => aberto(v.t))
}
