/**
 * AUDITORIA PÚBLICA DE UMA CONTA MTM FUNDED — as contas, sem base nem rede (pura, com teste).
 *
 * O que um investidor ou um aluno precisa para confiar num histórico, e só isso:
 *  · cada operação ligada ao SINAL que a abriu (estratégia, hora do sinal, latência, desvio da entrada);
 *  · resultado em R (múltiplos do risco inicial) e em pips — as duas unidades que não mudam com o tamanho
 *    da conta. Os dólares mudam com o lote e com os ajustes de saldo, por isso o retorno em % é
 *    PONDERADO NO TEMPO (cada trade conta sobre o saldo que havia na altura): um ajuste de capital não
 *    aparece como ganho nem como drawdown;
 *  · drawdown máximo (em R e no índice ponderado), sequências, resultado por mês;
 *  · risco de ruína por reamostragem das próprias trades (semente fixa — o mesmo histórico dá sempre o
 *    mesmo número, qualquer pessoa pode repetir a conta).
 *
 * Regras da casa: contas SIMULADAS (MTM Funded não é corretora nem prop firm), nada de promessas, nada
 * inventado — se não há risco inicial registado a trade não entra no R; se não há sinal, diz «manual».
 * As trades marcadas `fora_estatisticas` (testes internos) já vêm filtradas pelo leitor.
 */

export interface PernaAuditoria {
  id: string
  mae_id: string | null
  symbol: string
  direcao: 'buy' | 'sell' | string
  volume: number | string
  preco_entrada: number | string | null
  preco_fecho: number | string | null
  pnl: number | string | null
  comissao?: number | string | null
  swap?: number | string | null
  aberta_em: string | null
  fechada_em: string
  origem?: string | null
  risco_inicial?: number | string | null
}

export interface SinalLigado {
  funded_position_id: string
  estrategia: string | null
  created_at: string
  entrada?: number | string | null
}

export interface AjusteSaldo { em: string; delta: number }

export interface TradeAuditoria {
  id: string
  symbol: string
  direcao: 'buy' | 'sell'
  abertaEm: string | null
  fechadaEm: string
  partes: number
  volume: number
  resultado: number
  r: number | null
  /** Em pips (forex e metais) ou pontos (índices e cripto) — ver `unidade`. */
  movimento: number | null
  unidade: 'pips' | 'pts' | null
  origem: string
  estrategia: string | null
  sinalEm: string | null
  latenciaSeg: number | null
  desvioEntrada: number | null
}

const num = (v: unknown) => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? null : x }
const r2 = (x: number) => Math.round(x * 100) / 100
const r1 = (x: number) => Math.round(x * 10) / 10

/** Tamanho do pip (forex/metais) ou do ponto (índices/cripto). Os mesmos do flyer semanal. */
export function tamanhoPip(symbol: string): { pip: number; unidade: 'pips' | 'pts' } | null {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.startsWith('XAU')) return { pip: 0.1, unidade: 'pips' }
  if (s.startsWith('XAG')) return { pip: 0.01, unidade: 'pips' }
  if (/^(BTC|ETH|SOL|XRP|LTC|ADA|DOGE|BNB)/.test(s)) return { pip: 1, unidade: 'pts' }
  if (/^(NAS|US30|US500|SPX|GER|DE40|UK100|JPN|HK50|USOIL|WTI|UKOIL)/.test(s)) return { pip: 1, unidade: 'pts' }
  if (/^[A-Z]{6}$/.test(s)) return { pip: s.endsWith('JPY') ? 0.01 : 0.0001, unidade: 'pips' }
  return null
}

const NOMES_ESTRATEGIA: Record<string, string> = {
  'premium-ouro': 'MTM Auto Premium',
  'mtm-auto-premium-ii': 'MTM Auto Premium II',
  'mtm-auto-edge': 'MTM Auto Edge',
  'mtm-auto-trendshot': 'MTM Auto TrendShot',
  'mtm-auto-defy': 'MTM Auto DEFY',
  'mtm-scanner': 'MTM Scanner',
  'aurum-flow': 'Aurum Flow',
  sensei: 'Sensei',
  goldkiller: 'GoldKiller',
}
export function nomeEstrategia(slug: string | null | undefined): string | null {
  if (!slug) return null
  return NOMES_ESTRATEGIA[slug.toLowerCase()] ?? slug
}

/** Junta as parciais na trade-mãe e liga cada trade ao sinal que a abriu. Ordem: por fecho. */
export function agruparTrades(pernas: PernaAuditoria[], sinais: SinalLigado[] = []): TradeAuditoria[] {
  const porRaiz = new Map<string, PernaAuditoria[]>()
  for (const p of pernas) {
    const raiz = p.mae_id ?? p.id
    const g = porRaiz.get(raiz)
    if (g) g.push(p); else porRaiz.set(raiz, [p])
  }
  const sinalDe = new Map<string, SinalLigado>()
  for (const s of sinais) if (s.funded_position_id && !sinalDe.has(s.funded_position_id)) sinalDe.set(s.funded_position_id, s)

  const out: TradeAuditoria[] = []
  for (const [raiz, g] of porRaiz) {
    const mae = g.find((p) => p.id === raiz) ?? g[0]
    const dir: 'buy' | 'sell' = String(mae.direcao).toLowerCase() === 'sell' ? 'sell' : 'buy'
    const sinal = dir === 'buy' ? 1 : -1
    let resultado = 0, vol = 0, movVol = 0, fecho = mae.fechada_em
    let movOk = true
    for (const p of g) {
      resultado += (num(p.pnl) ?? 0) + (num(p.swap) ?? 0) - (num(p.comissao) ?? 0)
      const v = num(p.volume) ?? 0
      const e = num(p.preco_entrada), f = num(p.preco_fecho)
      vol += v
      if (e == null || f == null) movOk = false; else movVol += sinal * (f - e) * v
      if (p.fechada_em > fecho) fecho = p.fechada_em
    }
    const tp = tamanhoPip(mae.symbol)
    const risco = num(mae.risco_inicial)
    const s = sinalDe.get(raiz) ?? null
    const entrada = num(mae.preco_entrada), entradaSinal = num(s?.entrada)
    const latencia = s && mae.aberta_em ? (Date.parse(mae.aberta_em) - Date.parse(s.created_at)) / 1000 : null
    out.push({
      id: raiz,
      symbol: mae.symbol,
      direcao: dir,
      abertaEm: mae.aberta_em,
      fechadaEm: fecho,
      partes: g.length,
      volume: r2(vol),
      resultado: r2(resultado),
      r: risco && risco > 0 ? r2(resultado / risco) : null,
      movimento: tp && movOk && vol > 0 ? r1(movVol / vol / tp.pip) : null,
      unidade: tp?.unidade ?? null,
      origem: s ? 'sinal' : String(mae.origem ?? 'manual'),
      estrategia: s?.estrategia ?? null,
      sinalEm: s?.created_at ?? null,
      latenciaSeg: latencia != null && Number.isFinite(latencia) ? r1(latencia) : null,
      desvioEntrada: tp && entrada != null && entradaSinal != null && entradaSinal > 0
        ? r1(sinal * (entrada - entradaSinal) / tp.pip) : null,
    })
  }
  return out.sort((a, b) => a.fechadaEm.localeCompare(b.fechadaEm))
}

/** PRNG pequeno e determinista (mulberry32): a mesma semente dá a mesma simulação. */
function prng(semente: number) {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * RISCO DE RUÍNA por reamostragem (bootstrap) das trades em R.
 * Arrisca `riscoPct` do saldo ACTUAL por trade (fracção fixa) e conta as simulações que perdem
 * `limitePct` do capital inicial em `trades` operações. Devolve a fracção (0–1).
 */
export function riscoDeRuina(rs: number[], o: { riscoPct: number; limitePct: number; trades?: number; simulacoes?: number; semente?: number }): number | null {
  const amostra = rs.filter((x) => Number.isFinite(x))
  if (amostra.length < 10) return null
  const n = o.trades ?? 250, sims = o.simulacoes ?? 4000
  const rnd = prng(o.semente ?? 20261111)
  const f = o.riscoPct / 100, piso = 1 - o.limitePct / 100
  let ruinas = 0
  for (let s = 0; s < sims; s++) {
    let saldo = 1
    for (let i = 0; i < n; i++) {
      saldo *= 1 + f * amostra[Math.floor(rnd() * amostra.length)]
      if (saldo <= piso) { ruinas++; break }
    }
  }
  return ruinas / sims
}

export interface Mes { mes: string; trades: number; r: number; retornoPct: number }
export interface Grupo { chave: string; trades: number; ganhas: number; taxaAcertoPct: number | null; r: number; resultado: number }

export interface MetricasAuditoria {
  trades: number
  tradesComR: number
  tradesComSinal: number
  ganhas: number
  perdidas: number
  taxaAcertoPct: number | null
  rTotal: number
  expectativaR: number | null
  mediaGanhoR: number | null
  mediaPerdaR: number | null
  fatorLucroR: number | null
  drawdownMaxR: number
  pips: number
  pontos: number
  resultadoTrades: number
  retornoPonderadoPct: number
  drawdownMaxPct: number
  maxGanhasSeguidas: number
  maxPerdidasSeguidas: number
  latenciaMedianaSeg: number | null
  desvioMedianoEntrada: number | null
  ajustes: { quantidade: number; total: number }
  ruina: Array<{ riscoPct: number; limitePct: number; prob: number | null }>
  curva: Array<{ t: number; r: number; indice: number }>
  porMes: Mes[]
  porEstrategia: Grupo[]
  porSimbolo: Grupo[]
  primeiraTrade: string | null
  ultimaTrade: string | null
  diasNegociados: number
}

const mediana = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function agrupar(trades: TradeAuditoria[], chave: (t: TradeAuditoria) => string): Grupo[] {
  const m = new Map<string, Grupo>()
  for (const t of trades) {
    const k = chave(t)
    const g = m.get(k) ?? { chave: k, trades: 0, ganhas: 0, taxaAcertoPct: null, r: 0, resultado: 0 }
    g.trades++; if (t.resultado > 0) g.ganhas++
    g.r += t.r ?? 0; g.resultado += t.resultado
    m.set(k, g)
  }
  return [...m.values()].map((g) => ({ ...g, r: r2(g.r), resultado: r2(g.resultado), taxaAcertoPct: g.trades ? r1((100 * g.ganhas) / g.trades) : null }))
    .sort((a, b) => b.trades - a.trades)
}

export function metricasAuditoria(trades: TradeAuditoria[], o: { saldoInicial: number; ajustes?: AjusteSaldo[] }): MetricasAuditoria {
  const ajustes = [...(o.ajustes ?? [])].sort((a, b) => a.em.localeCompare(b.em))
  const comR = trades.filter((t) => t.r != null)
  const rs = comR.map((t) => t.r as number)
  const ganhos = rs.filter((x) => x > 0), perdas = rs.filter((x) => x < 0)
  const somaG = ganhos.reduce((a, b) => a + b, 0), somaP = -perdas.reduce((a, b) => a + b, 0)

  // Curva: R acumulado e índice ponderado no tempo (cada trade sobre o saldo que havia na altura).
  let saldo = o.saldoInicial, indice = 1, picoIdx = 1, ddPct = 0, cumR = 0, picoR = 0, ddR = 0, ia = 0
  let seqG = 0, seqP = 0, maxG = 0, maxP = 0
  const curva: MetricasAuditoria['curva'] = []
  const meses = new Map<string, { trades: number; r: number; idx0: number; idx1: number }>()
  for (const t of trades) {
    while (ia < ajustes.length && ajustes[ia].em <= t.fechadaEm) { saldo += ajustes[ia].delta; ia++ }
    const mes = t.fechadaEm.slice(0, 7)
    const m = meses.get(mes) ?? { trades: 0, r: 0, idx0: indice, idx1: indice }
    if (saldo > 0) indice *= 1 + t.resultado / saldo
    saldo += t.resultado
    picoIdx = Math.max(picoIdx, indice); ddPct = Math.max(ddPct, (picoIdx - indice) / picoIdx)
    if (t.r != null) { cumR += t.r; picoR = Math.max(picoR, cumR); ddR = Math.max(ddR, picoR - cumR) }
    if (t.resultado > 0) { seqG++; seqP = 0 } else if (t.resultado < 0) { seqP++; seqG = 0 }
    maxG = Math.max(maxG, seqG); maxP = Math.max(maxP, seqP)
    m.trades++; m.r += t.r ?? 0; m.idx1 = indice
    meses.set(mes, m)
    curva.push({ t: Date.parse(t.fechadaEm), r: r2(cumR), indice: Math.round(indice * 10000) / 10000 })
  }

  const pips = trades.filter((t) => t.unidade === 'pips').reduce((a, t) => a + (t.movimento ?? 0), 0)
  const pontos = trades.filter((t) => t.unidade === 'pts').reduce((a, t) => a + (t.movimento ?? 0), 0)
  const lat = trades.map((t) => t.latenciaSeg).filter((x): x is number => x != null && x >= 0 && x < 3600)
  const desv = trades.map((t) => t.desvioEntrada).filter((x): x is number => x != null)
  const dias = new Set(trades.map((t) => t.fechadaEm.slice(0, 10)))

  return {
    trades: trades.length,
    tradesComR: comR.length,
    tradesComSinal: trades.filter((t) => t.sinalEm).length,
    ganhas: trades.filter((t) => t.resultado > 0).length,
    perdidas: trades.filter((t) => t.resultado < 0).length,
    taxaAcertoPct: rs.length ? r1((100 * ganhos.length) / rs.length) : null,
    rTotal: r2(cumR),
    expectativaR: rs.length ? Math.round((cumR / rs.length) * 1000) / 1000 : null,
    mediaGanhoR: ganhos.length ? r2(somaG / ganhos.length) : null,
    mediaPerdaR: perdas.length ? r2(-somaP / perdas.length) : null,
    fatorLucroR: somaP > 0 ? r2(somaG / somaP) : null,
    drawdownMaxR: r2(ddR),
    pips: Math.round(pips),
    pontos: Math.round(pontos),
    resultadoTrades: r2(trades.reduce((a, t) => a + t.resultado, 0)),
    retornoPonderadoPct: r2((indice - 1) * 100),
    drawdownMaxPct: r2(ddPct * 100),
    maxGanhasSeguidas: maxG,
    maxPerdidasSeguidas: maxP,
    latenciaMedianaSeg: lat.length ? r1(mediana(lat) as number) : null,
    desvioMedianoEntrada: desv.length ? r1(mediana(desv) as number) : null,
    ajustes: { quantidade: ajustes.length, total: r2(ajustes.reduce((a, j) => a + j.delta, 0)) },
    ruina: [0.5, 1, 2].map((riscoPct) => ({ riscoPct, limitePct: 30, prob: riscoDeRuina(rs, { riscoPct, limitePct: 30 }) })),
    curva,
    porMes: [...meses.entries()].map(([mes, m]) => ({ mes, trades: m.trades, r: r2(m.r), retornoPct: r2((m.idx1 / m.idx0 - 1) * 100) })),
    porEstrategia: agrupar(trades, (t) => nomeEstrategia(t.estrategia) ?? (t.origem === 'manual' ? 'Manual' : t.origem)),
    porSimbolo: agrupar(trades, (t) => t.symbol),
    primeiraTrade: trades[0]?.abertaEm ?? trades[0]?.fechadaEm ?? null,
    ultimaTrade: trades.at(-1)?.fechadaEm ?? null,
    diasNegociados: dias.size,
  }
}

/** Token público: 24 caracteres base62, sem ligação ao id da conta nem ao login. */
export function gerarTokenAuditoria(aleatorio: (n: number) => Uint8Array): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  return Array.from(aleatorio(24), (b) => abc[b % abc.length]).join('')
}
