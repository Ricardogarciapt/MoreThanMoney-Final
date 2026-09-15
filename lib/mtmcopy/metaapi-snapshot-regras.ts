/**
 * FOTOGRAFIA DA CONTA POR STREAMING — as regras PURAS (sem Supabase, sem MetaApi).
 *
 * O serviço `mtm-premium-streaming` (VPS) mantém uma ligação de streaming às contas listadas em
 * `PREMIUM_STREAMING_CONTAS` e escreve em `metaapi_snapshot` as posições e os preços dos símbolos
 * delas. O monitor de preço Premium (Vercel) lê essa fotografia em vez de pedir `getPositions` e
 * `getSymbolPrice` por RPC a cada segundo.
 *
 * O que está aqui decide QUAL das fontes se usa, e mais nada:
 *  · `decidirFonte`      — fotografia fresca (≤3 s) E sincronizada → fotografia; senão RPC, como hoje.
 *  · `precoDoSnapshot`   — o preço médio do símbolo da POSIÇÃO, se o tick for recente.
 *  · `diferencasSombra`  — o que difere entre fotografia e RPC (período de verificação).
 *  · `decidirPublicacao` — quando o serviço escreve (no máximo 1×/s, só quando muda + batimento).
 *
 * As DECISÕES de gestão (trailing, BE, parciais, fechos) e as ORDENS não passam por aqui.
 */
import { pipSizeForSymbol } from './trade-outcome'

/** Idade máxima da fotografia para substituir o RPC. */
export const SNAPSHOT_MAX_IDADE_MS = 3_000
/** Relógio do VPS à frente do da Vercel mais do que isto → não se confia. */
export const SNAPSHOT_TOLERANCIA_FUTURO_MS = 2_000
/** Um tick com mais do que isto face à fotografia já não conta como preço ao vivo. */
export const PRECO_MAX_ATRASO_MS = 10_000
/** De quanto em quanto tempo a sombra compara com o RPC (por conta). */
export const SOMBRA_INTERVALO_MS = 30_000

export interface PosicaoSnapshot {
  id: string
  symbol: string
  type: string
  openPrice: number
  volume?: number
  currentPrice?: number
  stopLoss?: number
  takeProfit?: number
  comment?: string
  clientId?: string
  time?: string
  profit?: number
}

export interface PrecoSnapshot {
  bid: number
  ask: number
  /** Instante do tick (ms epoch). */
  em: number
}

export interface MetaApiSnapshot {
  account_id: string
  posicoes: PosicaoSnapshot[]
  precos: Record<string, PrecoSnapshot>
  sincronizado: boolean
  /** ISO — quando o serviço escreveu. */
  em: string
}

/** Lista de contas da variável (vírgulas, espaços tolerados). Vazia = desligado. */
export function contasStreaming(valor: string | undefined | null): string[] {
  return String(valor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export type DecisaoFonte = { fonte: 'snapshot' | 'rpc'; motivo: string }

/**
 * Usa-se a fotografia só quando é fresca E sincronizada. Tudo o resto — não existe, dessincronizada,
 * velha, com data no futuro, data ilegível — é RPC, exactamente como antes.
 */
export function decidirFonte(
  snap: Pick<MetaApiSnapshot, 'sincronizado' | 'em'> | null | undefined,
  agoraMs: number,
  maxIdadeMs = SNAPSHOT_MAX_IDADE_MS,
): DecisaoFonte {
  if (!snap) return { fonte: 'rpc', motivo: 'sem fotografia' }
  if (snap.sincronizado !== true) return { fonte: 'rpc', motivo: 'fotografia dessincronizada' }
  const em = Date.parse(String(snap.em))
  if (!Number.isFinite(em)) return { fonte: 'rpc', motivo: 'fotografia sem data' }
  const idade = agoraMs - em
  if (idade < -SNAPSHOT_TOLERANCIA_FUTURO_MS) return { fonte: 'rpc', motivo: `fotografia no futuro (${-idade} ms)` }
  if (idade > maxIdadeMs) return { fonte: 'rpc', motivo: `fotografia velha (${idade} ms)` }
  return { fonte: 'snapshot', motivo: `fotografia fresca (${Math.max(0, idade)} ms)` }
}

/**
 * Preço médio (bid+ask)/2 — a mesma conta do `getMarketPrice` — do símbolo DA CORRETORA.
 * null quando não há tick para esse símbolo ou o tick é antigo face à fotografia: quem chama cai
 * no RPC.
 */
export function precoDoSnapshot(
  snap: Pick<MetaApiSnapshot, 'precos' | 'em'>,
  simboloCorretora: string,
  maxAtrasoMs = PRECO_MAX_ATRASO_MS,
): number | null {
  const p = snap.precos?.[simboloCorretora]
  if (!p) return null
  const bid = Number(p.bid)
  const ask = Number(p.ask)
  if (!(bid > 0) || !(ask > 0)) return null
  const emSnap = Date.parse(String(snap.em))
  if (Number.isFinite(emSnap) && Number.isFinite(p.em) && emSnap - p.em > maxAtrasoMs) return null
  return (bid + ask) / 2
}

/** Idade máxima da fotografia para servir de preço aos monitores (T2T, signal-tracker). */
export const PRECO_MONITOR_MAX_IDADE_MS = 5_000

/**
 * Preço da fotografia para um MONITOR: a fotografia tem de estar sincronizada e ter menos de
 * `maxIdadeMs` (e não estar no futuro além da tolerância); o tick segue as regras de `precoDoSnapshot`.
 */
export function precoDoSnapshotParaMonitor(
  snap: Pick<MetaApiSnapshot, 'precos' | 'em' | 'sincronizado'>,
  simboloCorretora: string,
  agoraMs: number,
  maxIdadeMs = PRECO_MONITOR_MAX_IDADE_MS,
): number | null {
  if (snap.sincronizado !== true) return null
  const em = Date.parse(String(snap.em))
  if (!Number.isFinite(em)) return null
  const idade = agoraMs - em
  if (idade > maxIdadeMs || idade < -SNAPSHOT_TOLERANCIA_FUTURO_MS) return null
  return precoDoSnapshot(snap, simboloCorretora)
}

/** Assim chegam as posições do SDK (Date em `time`) → forma simples, serializável. */
export function posicaoParaSnapshot(p: Record<string, unknown>): PosicaoSnapshot | null {
  if (!p || p.id == null || !p.symbol) return null
  const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? undefined : Number(v))
  const t = p.time as string | Date | undefined
  const time = t ? new Date(t) : null
  return {
    id: String(p.id),
    symbol: String(p.symbol),
    type: String(p.type ?? ''),
    openPrice: Number(p.openPrice ?? 0),
    volume: num(p.volume),
    currentPrice: num(p.currentPrice),
    stopLoss: num(p.stopLoss),
    takeProfit: num(p.takeProfit),
    comment: p.comment != null ? String(p.comment) : undefined,
    clientId: p.clientId != null ? String(p.clientId) : undefined,
    time: time && Number.isFinite(time.getTime()) ? time.toISOString() : undefined,
    profit: num(p.profit),
  }
}

// ── publicação (serviço do VPS) ────────────────────────────────────────────────

/**
 * O que conta como «mudou»: posições (id, lado, lote, SL, TP) e bid/ask. O `currentPrice` e o
 * `profit` das posições ficam de fora — mudam a cada tick e já estão representados pelos preços.
 */
export function assinaturaSnapshot(
  posicoes: PosicaoSnapshot[],
  precos: Record<string, PrecoSnapshot>,
  sincronizado: boolean,
): string {
  const pos = [...posicoes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => [p.id, p.type, p.volume ?? null, p.stopLoss ?? null, p.takeProfit ?? null])
  const pr = Object.keys(precos)
    .sort()
    .map((s) => [s, precos[s].bid, precos[s].ask])
  return JSON.stringify([sincronizado, pos, pr])
}

export interface EstadoPublicacao {
  assinatura: string | null
  publicadoEm: number
  sincronizado: boolean | null
}

/**
 * Escreve?
 *  · perdeu a sincronização → JÁ (o monitor tem de deixar de confiar sem esperar pelo intervalo);
 *  · mudou → se passou o intervalo (1 s);
 *  · não mudou → só o batimento (2 s), para a fotografia continuar «fresca» num mercado parado.
 */
export function decidirPublicacao(
  anterior: EstadoPublicacao,
  assinatura: string,
  sincronizado: boolean,
  agoraMs: number,
  intervaloMs = 1_000,
  batimentoMs = 2_000,
): boolean {
  if (anterior.sincronizado === true && !sincronizado) return true
  const passou = agoraMs - anterior.publicadoEm
  if (anterior.assinatura !== assinatura) return passou >= intervaloMs
  return passou >= batimentoMs
}

// ── sombra (verificação fotografia × RPC) ──────────────────────────────────────

export function amostraSombraDevida(ultimaMs: number | undefined, agoraMs: number, intervaloMs = SOMBRA_INTERVALO_MS): boolean {
  return ultimaMs == null || agoraMs - ultimaMs >= intervaloMs
}

export interface ComparacaoPreco {
  symbol: string
  snapshot: number | null
  rpc: number | null
}

export interface ResultadoSombra {
  iguais: boolean
  diferencas: string[]
  contagem: { snapshot: number; rpc: number }
  precoDeltaPips: Record<string, number | null>
}

const EPS = 1e-6
const difere = (a: number | undefined | null, b: number | undefined | null) =>
  (a == null || !(Number(a) > 0) ? null : Number(a)) !== (b == null || !(Number(b) > 0) ? null : Number(b)) &&
  !(a != null && b != null && Math.abs(Number(a) - Number(b)) <= EPS)

/**
 * Diferenças entre a fotografia e a leitura RPC da mesma conta. Preço: diferença em pips (o tick
 * anda entre as duas leituras, por isso só conta como divergência acima da tolerância).
 */
export function diferencasSombra(
  snapPos: PosicaoSnapshot[],
  rpcPos: PosicaoSnapshot[],
  precos: ComparacaoPreco[] = [],
  toleranciaPips = 5,
): ResultadoSombra {
  const diferencas: string[] = []
  const porId = (l: PosicaoSnapshot[]) => new Map(l.map((p) => [String(p.id), p]))
  const s = porId(snapPos)
  const r = porId(rpcPos)
  if (snapPos.length !== rpcPos.length) diferencas.push(`contagem ${snapPos.length}≠${rpcPos.length}`)
  for (const id of r.keys()) if (!s.has(id)) diferencas.push(`${id}: só no RPC`)
  for (const id of s.keys()) if (!r.has(id)) diferencas.push(`${id}: só na fotografia`)
  for (const [id, a] of s) {
    const b = r.get(id)
    if (!b) continue
    if (difere(a.stopLoss, b.stopLoss)) diferencas.push(`${id}: sl ${a.stopLoss ?? '—'}≠${b.stopLoss ?? '—'}`)
    if (difere(a.takeProfit, b.takeProfit)) diferencas.push(`${id}: tp ${a.takeProfit ?? '—'}≠${b.takeProfit ?? '—'}`)
    if (difere(a.volume, b.volume)) diferencas.push(`${id}: volume ${a.volume ?? '—'}≠${b.volume ?? '—'}`)
  }
  const precoDeltaPips: Record<string, number | null> = {}
  for (const c of precos) {
    if (c.snapshot == null || c.rpc == null) {
      precoDeltaPips[c.symbol] = null
      if (c.snapshot == null && c.rpc != null) diferencas.push(`${c.symbol}: sem preço na fotografia`)
      continue
    }
    const d = Math.round((Math.abs(c.snapshot - c.rpc) / pipSizeForSymbol(c.symbol)) * 10) / 10
    precoDeltaPips[c.symbol] = d
    if (d > toleranciaPips) diferencas.push(`${c.symbol}: preço Δ${d}p`)
  }
  return { iguais: diferencas.length === 0, diferencas, contagem: { snapshot: snapPos.length, rpc: rpcPos.length }, precoDeltaPips }
}
