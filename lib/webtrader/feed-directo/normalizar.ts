/**
 * NORMALIZAÇÃO DO FEED DIRECTO — FUNÇÕES PURAS (sem React, sem rede, sem SDK).
 *
 *  · símbolos da corretora ↔ catálogo MTM, por conta (`XAUUSD.r`, `GOLD`, `US100.cash`…): o mapa
 *    constrói-se UMA vez com a lista da conta e é ele que decide o que o ecrã lê;
 *  · timeframes do gráfico (M1, M5, H1…) → código de cada plataforma (`5m`, `1H`…), e de que
 *    timeframe suportado se agrega um que a plataforma não dá (M15 numa MT4 que só tem M1/M5…);
 *  · posições, ordens, conta e velas de cada plataforma → os tipos do WebTrader (PosicaoWT…);
 *  · ficha mínima de um símbolo que só existe na corretora (spec MetaApi / instrumento TradeLocker).
 *
 * Testado em lib/webtrader/feed-directo/normalizar.check.ts.
 */
import { rankedBrokerSymbols } from '@/lib/mtmcopy/symbol-resolver'
import { canonicoDe } from '@/lib/webtrader/corretoras/regras'
import type { ContaWT, OrdemWT, PosicaoWT } from '@/lib/webtrader/corretoras/tipos'
import type { VelaC } from '@/lib/webtrader/velas'
import { TF_METAAPI_MT4, TF_METAAPI_MT5, TF_TRADELOCKER, type FichaMinima, type MapaSimbolos } from './tipos'

// ── símbolos ─────────────────────────────────────────────────────────────────────────────────

/**
 * O mapa da conta. Para cada símbolo da corretora calcula-se o canónico; quando vários apontam
 * ao mesmo canónico (XAUUSD, XAUUSD.r, XAUUSDm) escolhe-se pelo ranking de sempre da execução
 * (rankedBrokerSymbols: exacto primeiro, depois o sufixo nativo da conta). `preferencias` são
 * escolhas guardadas (o cliente pode fixar «para XAUUSD lê GOLD») e ganham ao ranking, desde que o
 * símbolo ainda exista na conta.
 */
export function construirMapa(simbolosCorretora: string[], preferencias: Record<string, string> = {}): MapaSimbolos {
  const lista = [...new Set(simbolosCorretora.map((s) => String(s ?? '').trim()).filter(Boolean))]
  const existe = new Set(lista)
  const porCanonico = new Map<string, string[]>()
  const paraCanonico: Record<string, string> = {}
  for (const s of lista) {
    const c = canonicoDe(s)
    if (!c) continue
    paraCanonico[s] = c
    const arr = porCanonico.get(c) ?? []
    arr.push(s)
    porCanonico.set(c, arr)
  }
  const paraCorretora: Record<string, string> = {}
  for (const [c, candidatos] of porCanonico) {
    const pref = preferencias[c]
    if (pref && existe.has(pref)) { paraCorretora[c] = pref; continue }
    const ranked = rankedBrokerSymbols(c, candidatos)
    paraCorretora[c] = ranked[0] ?? candidatos[0]
  }
  return { paraCorretora, paraCanonico }
}

/** O símbolo da corretora para ler um canónico — ou o próprio nome, se ele já for da corretora. */
export function simboloDaCorretora(mapa: MapaSimbolos, canonico: string): string | null {
  const c = String(canonico ?? '').toUpperCase()
  if (mapa.paraCorretora[c]) return mapa.paraCorretora[c]
  // Pode vir já o nome da corretora (XAUUSD.r) — a pesquisa de símbolos devolve os dois.
  if (mapa.paraCanonico[canonico]) return canonico
  const porMaiusculas = Object.keys(mapa.paraCanonico).find((s) => s.toUpperCase() === c)
  return porMaiusculas ?? null
}

export function classeDoSimbolo(canonico: string): FichaMinima['classe'] {
  const c = canonico.toUpperCase()
  if (/^XA[UG]/.test(c)) return 'metal'
  if (/^(BTC|ETH|LTC|XRP|SOL|ADA|DOGE|BNB|DOT|AVAX|LINK)/.test(c)) return 'cripto'
  if (/^(USO|UKO|WTI|BRENT|XTI|XBR|NGAS|XNG)/.test(c)) return 'energia'
  if (/^[A-Z]{6}$/.test(c)) return 'forex'
  if (/^(NAS|US|GER|UK|JPN|AUS|FRA|ESP|EU|HK|CHINA|SPX|DJ|DAX|FTSE|NIKKEI)\d*/.test(c) || /\d{2,3}$/.test(c)) return 'indice'
  if (/^(XPT|XPD|COPPER|WHEAT|CORN|SOY|COFFEE|SUGAR|COCOA|COTTON)/.test(c)) return 'commodity'
  return 'acao'
}

/** Pip a partir dos dígitos, como o MetaTrader: 5/3 dígitos → 10 points; 2 dígitos (ouro) → 0,1. */
export function pipDeDigitos(digits: number): number {
  const d = Math.max(0, Math.min(8, Math.round(digits)))
  const point = Math.pow(10, -d)
  return d >= 2 ? point * 10 : point
}

export interface SpecMetaApiMinima {
  symbol: string
  digits?: number
  contractSize?: number
  minVolume?: number
  maxVolume?: number
  volumeStep?: number
  profitCurrency?: string
  description?: string
}

export function fichaDeSpecMetaApi(canonico: string, s: SpecMetaApiMinima): FichaMinima {
  const digits = Number.isFinite(s.digits) ? Number(s.digits) : 5
  return {
    symbol: canonico, simboloCorretora: s.symbol, classe: classeDoSimbolo(canonico), digits,
    contract_size: s.contractSize && s.contractSize > 0 ? s.contractSize : 100_000,
    pip_size: pipDeDigitos(digits),
    volume_min: s.minVolume && s.minVolume > 0 ? s.minVolume : 0.01,
    volume_step: s.volumeStep && s.volumeStep > 0 ? s.volumeStep : 0.01,
    volume_max: s.maxVolume && s.maxVolume > 0 ? s.maxVolume : 100,
    moeda_lucro: s.profitCurrency ?? null, nome: s.description ?? null,
  }
}

export interface DetalheTLMinimo {
  name: string
  lotSize?: number
  lotStep?: number
  minLot?: number
  maxLot?: number
  tickSize?: Array<{ tickSize?: number }>
  quotingCurrency?: string
  description?: string
}

/** Na TradeLocker os dígitos não vêm: deduzem-se do tickSize da primeira faixa (0,00001 → 5). */
export function digitosDeTick(tick: number | undefined): number {
  if (!tick || !(tick > 0)) return 5
  return Math.max(0, Math.min(8, Math.round(-Math.log10(tick))))
}

export function fichaDeInstrumentoTL(canonico: string, d: DetalheTLMinimo): FichaMinima {
  const digits = digitosDeTick(d.tickSize?.[0]?.tickSize)
  return {
    symbol: canonico, simboloCorretora: d.name, classe: classeDoSimbolo(canonico), digits,
    contract_size: d.lotSize && d.lotSize > 0 ? d.lotSize : 100_000, pip_size: pipDeDigitos(digits),
    volume_min: d.minLot && d.minLot > 0 ? d.minLot : 0.01, volume_step: d.lotStep && d.lotStep > 0 ? d.lotStep : 0.01,
    volume_max: d.maxLot && d.maxLot > 0 ? d.maxLot : 100, moeda_lucro: d.quotingCurrency ?? null, nome: d.description ?? null,
  }
}

// ── timeframes ───────────────────────────────────────────────────────────────────────────────

export type PlataformaFeed = 'metaapi' | 'tradelocker'

export function tabelaTimeframes(plataforma: PlataformaFeed, versao: 'mt4' | 'mt5' = 'mt5'): Record<string, number> {
  if (plataforma === 'tradelocker') return TF_TRADELOCKER
  return versao === 'mt4' ? TF_METAAPI_MT4 : TF_METAAPI_MT5
}

/** O código da plataforma para `seg` segundos por vela, ou null se ela não o dá. */
export function codigoTimeframe(seg: number, plataforma: PlataformaFeed, versao: 'mt4' | 'mt5' = 'mt5'): string | null {
  const t = tabelaTimeframes(plataforma, versao)
  return Object.keys(t).find((k) => t[k] === seg) ?? null
}

/**
 * Quando a plataforma não dá o timeframe pedido, o maior que ela dá e que o divide (M15 → M5;
 * H2 numa MT4 → H1). Null quando nem isso há (nada divide um timeframe mais pequeno que o mínimo).
 */
export function timeframeParaDerivar(seg: number, plataforma: PlataformaFeed, versao: 'mt4' | 'mt5' = 'mt5'): { codigo: string; seg: number } | null {
  const t = tabelaTimeframes(plataforma, versao)
  let melhor: { codigo: string; seg: number } | null = null
  for (const [codigo, s] of Object.entries(t)) {
    if (s < seg && seg % s === 0 && (!melhor || s > melhor.seg)) melhor = { codigo, seg: s }
  }
  return melhor
}

/** Filtra a lista de timeframes do gráfico (components/funded/grafico-tipos.ts) pelo que a conta dá. */
export function timeframesSuportados<T extends { seg: number }>(lista: readonly T[], plataforma: PlataformaFeed, versao: 'mt4' | 'mt5' = 'mt5'): T[] {
  return lista.filter((t) => codigoTimeframe(t.seg, plataforma, versao) != null || timeframeParaDerivar(t.seg, plataforma, versao) != null)
}

// ── MetaApi → WebTrader ──────────────────────────────────────────────────────────────────────

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const iso = (v: unknown): string | null => {
  if (v == null) return null
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(String(v))
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}
const canonico = (mapa: MapaSimbolos, simbolo: string) => mapa.paraCanonico[simbolo] ?? canonicoDe(simbolo)

export interface PosicaoMetaApiMinima {
  id: string | number; symbol: string; type: string; openPrice: number; volume?: number; currentPrice?: number
  stopLoss?: number; takeProfit?: number; profit?: number; unrealizedProfit?: number; time?: Date | string
}
export interface OrdemMetaApiMinima {
  id: string | number; symbol: string; type: string; openPrice?: number; volume?: number; currentVolume?: number
  stopLoss?: number; takeProfit?: number; time?: Date | string
}
export interface ContaMetaApiMinima {
  balance?: number; equity?: number; margin?: number; freeMargin?: number; marginLevel?: number; currency?: string
}

export function posicaoDeMetaApi(p: PosicaoMetaApiMinima, mapa: MapaSimbolos): PosicaoWT {
  return {
    id: String(p.id), symbol: canonico(mapa, p.symbol), simboloCorretora: p.symbol,
    direcao: /SELL/i.test(p.type) ? 'sell' : 'buy', volume: Number(p.volume ?? 0), precoEntrada: Number(p.openPrice),
    precoAtual: num(p.currentPrice), sl: num(p.stopLoss) || null, tp: num(p.takeProfit) || null,
    lucro: num(p.profit) ?? num(p.unrealizedProfit), abertaEm: iso(p.time),
  }
}

export function ordemDeMetaApi(o: OrdemMetaApiMinima, mapa: MapaSimbolos): OrdemWT | null {
  const t = String(o.type ?? '').toUpperCase()
  if (t.includes('STOP_LIMIT')) return null
  const tipo = t.includes('LIMIT') ? 'limit' : t.includes('STOP') ? 'stop' : null
  if (!tipo) return null
  return {
    id: String(o.id), symbol: canonico(mapa, o.symbol), simboloCorretora: o.symbol, direcao: t.includes('SELL') ? 'sell' : 'buy', tipo,
    volume: Number(o.currentVolume ?? o.volume ?? 0), preco: Number(o.openPrice ?? 0),
    sl: num(o.stopLoss) || null, tp: num(o.takeProfit) || null, criadaEm: iso(o.time),
  }
}

export function contaDeMetaApi(i: ContaMetaApiMinima | null | undefined): ContaWT | null {
  if (!i) return null
  const saldo = num(i.balance)
  const equity = num(i.equity)
  return {
    saldo, equity, margem: num(i.margin), margemLivre: num(i.freeMargin),
    nivelMargem: num(i.marginLevel), flutuante: saldo != null && equity != null ? Number((equity - saldo).toFixed(2)) : null,
    moeda: i.currency ?? null,
  }
}

export interface VelaMetaApiMinima { time: Date | string | number; open: number; high: number; low: number; close: number; tickVolume?: number; volume?: number }

export function velaDeMetaApi(c: VelaMetaApiMinima): VelaC | null {
  const ms = c.time instanceof Date ? c.time.getTime() : typeof c.time === 'number' ? c.time : Date.parse(String(c.time))
  if (!Number.isFinite(ms)) return null
  return { t: Math.floor(ms / 1000), o: Number(c.open), h: Number(c.high), l: Number(c.low), c: Number(c.close), v: Number(c.tickVolume ?? c.volume ?? 0) || 0 }
}

/** Velas ordenadas por tempo, sem repetidas (a MetaApi pode devolver a mesma vela em duas páginas). */
export function ordenarVelas(velas: Array<VelaC | null>): VelaC[] {
  const porT = new Map<number, VelaC>()
  for (const v of velas) if (v && Number.isFinite(v.t) && v.o > 0) porT.set(v.t, v)
  return [...porT.values()].sort((a, b) => a.t - b.t)
}

// ── TradeLocker → WebTrader ──────────────────────────────────────────────────────────────────

export interface PosicaoTLMinima {
  id: string; tradableInstrumentId: number; side: 'buy' | 'sell'; qty: number; avgPrice: number
  stopLossId: string | null; takeProfitId: string | null; openDate: number | null; unrealizedPl: number | null
}
export interface OrdemTLMinima {
  id: string; tradableInstrumentId: number; side: 'buy' | 'sell'; qty: number; type: string; status: string
  price: number | null; stopPrice: number | null; positionId: string | null; stopLoss: number | null; takeProfit: number | null; createdDate: number | null
}

/**
 * Posições + pendentes das linhas cruas — a mesma regra do adaptador do servidor
 * (lib/webtrader/corretoras/tradelocker.ts::montarPosicoesEOrdensTL), que importa a base e por isso
 * não pode correr no browser. O SL/TP de uma posição são ordens próprias (stopLossId/takeProfitId).
 */
export function posicoesEOrdensDeTL(posicoes: PosicaoTLMinima[], ordens: OrdemTLMinima[], nomes: Map<number, string>, mapa: MapaSimbolos): { posicoes: PosicaoWT[]; ordens: OrdemWT[] } {
  const porId = new Map(ordens.map((o) => [o.id, o]))
  const protecoes = new Set<string>()
  const outP: PosicaoWT[] = posicoes.map((p) => {
    const nome = nomes.get(p.tradableInstrumentId) ?? String(p.tradableInstrumentId)
    const sl = p.stopLossId ? porId.get(p.stopLossId) : undefined
    const tp = p.takeProfitId ? porId.get(p.takeProfitId) : undefined
    if (p.stopLossId) protecoes.add(p.stopLossId)
    if (p.takeProfitId) protecoes.add(p.takeProfitId)
    return {
      id: p.id, symbol: canonico(mapa, nome), simboloCorretora: nome, direcao: p.side, volume: p.qty, precoEntrada: p.avgPrice,
      precoAtual: null, sl: sl ? sl.stopPrice ?? sl.price : null, tp: tp ? tp.price ?? tp.stopPrice : null,
      lucro: p.unrealizedPl, abertaEm: iso(p.openDate),
    }
  })
  const outO: OrdemWT[] = ordens
    .filter((o) => !protecoes.has(o.id) && (o.type === 'limit' || o.type === 'stop') && !['filled', 'cancelled', 'canceled', 'rejected', 'expired'].includes(o.status))
    .filter((o) => !o.positionId)
    .map((o) => {
      const nome = nomes.get(o.tradableInstrumentId) ?? String(o.tradableInstrumentId)
      return {
        id: o.id, symbol: canonico(mapa, nome), simboloCorretora: nome, direcao: o.side, tipo: o.type as 'limit' | 'stop', volume: o.qty,
        preco: Number((o.type === 'stop' ? o.stopPrice ?? o.price : o.price ?? o.stopPrice) ?? 0), sl: o.stopLoss, tp: o.takeProfit, criadaEm: iso(o.createdDate),
      }
    })
  return { posicoes: outP, ordens: outO }
}

export function contaDeTL(bruto: Record<string, number>, moeda: string | null): ContaWT {
  const saldo = num(bruto.balance)
  const equity = num(bruto.projectedBalance) ?? saldo
  const margem = num(bruto.initialMarginReq) ?? num(bruto.maintMarginReq)
  return {
    saldo, equity, margem, margemLivre: num(bruto.availableFunds),
    nivelMargem: margem && equity != null && margem > 0 ? Number(((equity / margem) * 100).toFixed(1)) : null,
    flutuante: num(bruto.openNetPnL) ?? num(bruto.openGrossPnL) ?? (saldo != null && equity != null ? Number((equity - saldo).toFixed(2)) : null),
    moeda,
  }
}

/**
 * `GET /trade/history` devolve `d.barDetails: [{t,o,h,l,c,v}]` com `t` em ms. Aceita-se também
 * `d.bars`/arrays posicionais — a documentação pública já mudou de forma uma vez.
 */
export function velasDeTL(json: unknown): VelaC[] {
  const d = (json as { d?: Record<string, unknown> })?.d ?? (json as Record<string, unknown>)
  const bruto = (d?.barDetails ?? d?.bars ?? d?.history ?? []) as unknown[]
  const out: VelaC[] = []
  for (const b of Array.isArray(bruto) ? bruto : []) {
    let t: number, o: number, h: number, l: number, c: number, v: number
    if (Array.isArray(b)) [t, o, h, l, c, v] = b.map(Number)
    else { const x = b as Record<string, unknown>; t = Number(x.t ?? x.time); o = Number(x.o ?? x.open); h = Number(x.h ?? x.high); l = Number(x.l ?? x.low); c = Number(x.c ?? x.close); v = Number(x.v ?? x.volume ?? 0) }
    if (!Number.isFinite(t) || !(o > 0)) continue
    out.push({ t: Math.floor(t > 1e11 ? t / 1000 : t), o, h, l, c, v: Number.isFinite(v) ? v : 0 })
  }
  return ordenarVelas(out)
}
