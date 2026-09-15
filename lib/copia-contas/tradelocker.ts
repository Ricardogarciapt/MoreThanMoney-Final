/**
 * TRADELOCKER NA CÓPIA ENTRE CONTAS — o contexto do destino (lote, valor do tick, preço) e a
 * resolução do instrumento, a partir do detalhe do instrumento da TradeLocker. Puro e testado
 * (lib/copia-contas/__tests__/copia-equipas.check.ts, com fixtures reais do formato da API).
 *
 * Risco %: perda no stop = equity × risco%. O motor calcula lote = (equity × %)/(distânciaSl × V), com
 * V = valor, na moeda da conta, de 1,0 de PREÇO num lote. Na TradeLocker:
 *   · com tickSize/tickCost (faixas por preço): V = tickCost / tickSize  (tickCost já vem na moeda da conta)
 *   · sem eles: V = lotSize (contract size), mas SÓ se a moeda de cotação for a da conta — senão null e o
 *     motor RECUSA o risco % (nunca adivinhar um valor de tick noutra moeda).
 * Regra de lote: minLot/maxLot em lotes; lotStep em unidades quando ≥1 com lotSize>1 (regraDeLote).
 */
import { canonicoDe } from '@/lib/webtrader/corretoras/regras'
import type { TLDetalheInstrumento, TLInstrumento } from '@/lib/tradelocker/client'
import { faixaPara, regraDeLote, resolverInstrumento, type TLInstrumentoResolvido } from '@/lib/tradelocker/sizing'
import type { ContextoDestino } from './tipos'

export function valorPorPrecoPorLoteTL(
  d: Partial<TLDetalheInstrumento> | null | undefined,
  preco: number | null,
  moedaConta: string | null,
): number | null {
  if (!d) return null
  const ref = preco != null && preco > 0 ? preco : 0
  const ts = Number(faixaPara(d.tickSize, ref)?.tickSize)
  const tc = Number(faixaPara(d.tickCost, ref)?.tickCost)
  if (ts > 0 && tc > 0) return tc / ts
  const lotSize = Number(d.lotSize)
  const cotacao = String(d.quotingCurrency ?? '').toUpperCase()
  if (lotSize > 0 && cotacao && moedaConta && cotacao === moedaConta.toUpperCase()) return lotSize
  return null
}

/** Casas decimais do preço a partir do tickSize (0,01 → 2; 0,00001 → 5). */
export function digitsDoTick(d: Partial<TLDetalheInstrumento> | null | undefined, preco: number | null): number | null {
  const ts = Number(faixaPara(d?.tickSize, preco != null && preco > 0 ? preco : 0)?.tickSize)
  if (!(ts > 0)) return null
  const s = ts.toFixed(10).replace(/0+$/, '')
  const casas = (s.split('.')[1] || '').length
  return Math.min(10, casas)
}

/**
 * Instrumento do destino. Um nome EXACTO com rota TRADE ganha (o mapa manual da rota ou o símbolo já
 * escolhido pelo motor); senão o ranking pelo canónico, como no MTM Auto.
 */
export function resolverInstrumentoDestino(simbolo: string, lista: TLInstrumento[]): TLInstrumentoResolvido | null {
  const alvo = String(simbolo ?? '').trim()
  const exacto = lista.find((i) => i.name === alvo && i.routes.some((r) => r.type === 'TRADE'))
    ?? lista.find((i) => i.name.toUpperCase() === alvo.toUpperCase() && i.routes.some((r) => r.type === 'TRADE'))
  if (exacto) {
    const trade = exacto.routes.find((r) => r.type === 'TRADE')!
    const info = exacto.routes.find((r) => r.type === 'INFO') ?? trade
    return { instrumento: exacto, routeTrade: trade.id, routeInfo: info.id }
  }
  return resolverInstrumento(canonicoDe(alvo.toUpperCase()), lista)
}

/** Nomes negociáveis (rota TRADE) — a lista que o motor usa para mapear o símbolo. */
export function nomesNegociaveis(lista: TLInstrumento[]): string[] {
  return [...new Set(lista.filter((i) => i.routes.some((r) => r.type === 'TRADE')).map((i) => i.name))]
}

export function contextoTradeLocker(p: {
  instrumento: TLInstrumentoResolvido
  detalhe: Partial<TLDetalheInstrumento> | null
  equity: number | null
  saldo: number | null
  moedaConta: string | null
  bid: number | null
  ask: number | null
}): ContextoDestino {
  const r = regraDeLote(p.detalhe)
  const preco = p.ask ?? p.bid ?? null
  return {
    simbolo: p.instrumento.instrumento.name,
    regra: { min: r.min, max: r.max, step: r.passo },
    equity: p.equity,
    saldo: p.saldo,
    valorPorPrecoPorLote: valorPorPrecoPorLoteTL(p.detalhe, preco, p.moedaConta),
    bid: p.bid,
    ask: p.ask,
    digits: digitsDoTick(p.detalhe, preco),
  }
}

// ── cache de longa duração (detalhe por conta+instrumento) ───────────────────

export const TTL_DETALHE_TL_MS = 12 * 60 * 60_000
export const TTL_INSTRUMENTOS_TL_MS = 6 * 60 * 60_000

/** Cache simples com prazo e deduplicação de pedidos em curso. */
export function cacheComPrazo<V>(ttlMs: number, agora: () => number = Date.now) {
  const m = new Map<string, { v: V; em: number }>()
  const emCurso = new Map<string, Promise<V>>()
  return {
    async obter(chave: string, ler: () => Promise<V>): Promise<V> {
      const c = m.get(chave)
      if (c && agora() - c.em < ttlMs) return c.v
      const p = emCurso.get(chave)
      if (p) return p
      const novo = ler().then((v) => { m.set(chave, { v, em: agora() }); return v }).finally(() => emCurso.delete(chave))
      emCurso.set(chave, novo)
      return novo
    },
    esquecer(chave?: string) { if (chave) m.delete(chave); else m.clear() },
    get tamanho() { return m.size },
  }
}
