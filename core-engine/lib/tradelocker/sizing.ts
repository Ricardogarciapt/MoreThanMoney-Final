/**
 * Símbolos e lotes na TradeLocker — funções puras (testadas em __tests__/sizing.check.ts).
 *
 * Símbolo: o sinal diz "XAUUSD"; a corretora pode chamar-lhe "XAUUSD.r", "GOLD" ou "XAUUSD+".
 * Reaproveita-se o ranking do MT5 (lib/mtmcopy/symbol-resolver) sobre os NOMES dos instrumentos
 * da conta, e só se aceitam instrumentos com rota TRADE (sem ela a TradeLocker recusa a ordem).
 *
 * Lotes: a documentação abre "0.02 lots" com qty 0.02 (recipes/open-and-close-a-position.md),
 * logo o qty é em lotes. O detalhe do instrumento traz minLot/maxLot em lotes; o `lotStep` do
 * exemplo da documentação vem em UNIDADES (lotSize 100000, lotStep 1000 → 0,01 lote). Trata-se
 * dos dois casos: lotStep ≥ 1 com lotSize > 1 lê-se como unidades, senão como lotes.
 */
import { rankedBrokerSymbols } from '@/lib/mtmcopy/symbol-resolver'
import type { TLDetalheInstrumento, TLFaixa, TLInstrumento } from './client'

export interface TLInstrumentoResolvido {
  instrumento: TLInstrumento
  routeTrade: number
  routeInfo: number
}

export function resolverInstrumento(canonico: string, lista: TLInstrumento[]): TLInstrumentoResolvido | null {
  const negociaveis = lista.filter((i) => i.routes.some((r) => r.type === 'TRADE'))
  const porNome = new Map<string, TLInstrumento>()
  for (const i of negociaveis) if (!porNome.has(i.name)) porNome.set(i.name, i)
  const ordenados = rankedBrokerSymbols(canonico, [...porNome.keys()])
  const escolhido = ordenados.length ? porNome.get(ordenados[0]) : undefined
  if (!escolhido) return null
  const trade = escolhido.routes.find((r) => r.type === 'TRADE')!
  const info = escolhido.routes.find((r) => r.type === 'INFO') ?? trade
  return { instrumento: escolhido, routeTrade: trade.id, routeInfo: info.id }
}

export interface RegraDeLote {
  min: number
  max: number
  passo: number
}

export function regraDeLote(d: Partial<TLDetalheInstrumento> | null | undefined): RegraDeLote {
  const min = d?.minLot && d.minLot > 0 ? d.minLot : 0.01
  const max = d?.maxLot && d.maxLot > 0 ? d.maxLot : 50
  let passo = 0.01
  const step = Number(d?.lotStep)
  const lotSize = Number(d?.lotSize)
  if (step > 0) {
    passo = step >= 1 && lotSize > 1 ? step / lotSize : step
  }
  if (!(passo > 0) || passo > max) passo = min
  return { min, max, passo }
}

/** Arredonda PARA BAIXO ao passo e prende a [min, max]. Nunca sobe o risco por arredondamento. */
export function ajustarQty(lote: number, r: RegraDeLote): number {
  if (!(lote > 0)) return 0
  const passos = Math.floor(lote / r.passo + 1e-9)
  let q = passos * r.passo
  if (q < r.min) q = r.min
  if (q > r.max) q = r.max
  const casas = Math.max(0, Math.min(8, Math.ceil(-Math.log10(r.passo)) + 1))
  return Number(q.toFixed(casas))
}

/** Faixa aplicável ao preço (faixas ordenadas por leftRangeLimit). */
export function faixaPara(faixas: TLFaixa[] | undefined, preco: number): TLFaixa | null {
  if (!faixas?.length) return null
  const ord = [...faixas].sort((a, b) => a.leftRangeLimit - b.leftRangeLimit)
  let pick = ord[0]
  for (const f of ord) if (preco >= f.leftRangeLimit) pick = f
  return pick
}

/**
 * Lote por RISCO: perda no stop = equity × risco%.
 * Com tickSize/tickCost da corretora (custo de um tick por 1 lote, na moeda da conta) o cálculo
 * serve para qualquer par. Sem eles devolve null e o chamador usa a heurística do MT5.
 */
export function lotePorRisco(p: {
  equity: number
  riscoPct: number
  entrada: number
  stop: number
  detalhe: Partial<TLDetalheInstrumento> | null | undefined
}): number | null {
  if (!(p.equity > 0) || !(p.riscoPct > 0) || !(p.entrada > 0) || !(p.stop > 0)) return null
  const distancia = Math.abs(p.entrada - p.stop)
  if (!(distancia > 0)) return null
  const ts = faixaPara(p.detalhe?.tickSize, p.entrada)?.tickSize
  const tc = faixaPara(p.detalhe?.tickCost, p.entrada)?.tickCost
  if (!(Number(ts) > 0) || !(Number(tc) > 0)) return null
  const perdaPorLote = (distancia / Number(ts)) * Number(tc)
  if (!(perdaPorLote > 0)) return null
  return (p.equity * (p.riscoPct / 100)) / perdaPorLote
}

/** Quantidade a fechar num parcial (fração da posição actual), já ajustada ao passo. */
export function qtyParcial(qtyAtual: number, fracao: number, r: RegraDeLote): number {
  if (!(qtyAtual > 0) || !(fracao > 0)) return 0
  if (fracao >= 0.999) return 0 // 0 = fecha tudo na TradeLocker
  const q = ajustarQty(qtyAtual * fracao, { ...r, min: r.passo })
  // O que sobra tem de continuar a ser uma posição válida; senão fecha tudo.
  if (qtyAtual - q < r.min - 1e-9) return 0
  return q
}
