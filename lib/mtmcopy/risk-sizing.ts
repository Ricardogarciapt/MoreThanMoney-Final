import { getAccountSnapshot, getMarketPrice, getRiskTickContext } from './metaapi'
import { computeLotSize } from './lot-sizing'
import type { ParsedSignal } from './signal-parser'

/**
 * Dimensiona o lote por RISCO: a posição é calculada para que, se bater o Stop Loss, a perda
 * seja `riskPct`% da equity da conta.
 *
 * Preferência: usa o **tickValue REAL da MetaApi** (currency-agnostic) — correto para QUALQUER par
 * (JPY, cruzados, USD-base, ouro, índices). Só se o broker não expuser tickValue é que cai na
 * heurística `computeLotSize` (contractSize fixo — correta só para pares cotados em USD).
 *
 * @param entry  preço de entrada; se null (ordem a mercado), vai buscar o preço de mercado atual.
 * Devolve o lote (mín. 0.01) ou o fallback se faltarem dados (equity/SL/preço).
 */
export async function computeRiskLot(
  accountId: string,
  symbol: string,
  sl: number | null | undefined,
  riskPct: number,
  entry?: number | null,
  fallbackLot = 0.01,
  direction: 'buy' | 'sell' = 'buy',
): Promise<{ lot: number; basis: 'risk' | 'risk_tick' | 'fallback'; equity: number | null; entry: number | null }> {
  try {
    const snap = await getAccountSnapshot(accountId)
    const equity = snap?.equity ?? snap?.balance ?? null
    if (!equity || equity <= 0 || !sl || sl <= 0) {
      return { lot: fallbackLot, basis: 'fallback', equity, entry: entry ?? null }
    }
    let e = entry != null && entry > 0 ? entry : null
    if (e == null) e = await getMarketPrice(accountId, symbol)
    if (e == null || e <= 0) return { lot: fallbackLot, basis: 'fallback', equity, entry: null }

    const slDistance = Math.abs(e - sl)
    if (slDistance <= 0) return { lot: fallbackLot, basis: 'fallback', equity, entry: e }

    // 1) Preferência: tickValue real da MetaApi → sizing exato em qualquer par.
    const tick = await getRiskTickContext(accountId, symbol, direction)
    if (tick && tick.tickSize > 0 && tick.tickValue > 0) {
      const riskAmount = equity * (riskPct / 100)
      const valuePerLot = (slDistance / tick.tickSize) * tick.tickValue // perda por 1.0 lote se bater SL
      if (valuePerLot > 0) {
        const raw = riskAmount / valuePerLot
        const lot = Math.min(50, Math.max(0.01, Math.round(raw * 100) / 100))
        if (lot > 0) return { lot, basis: 'risk_tick', equity, entry: e }
      }
    }

    // 2) Fallback: heurística por contractSize (correta para pares cotados em USD / ouro / índices).
    const signal = { symbol, sl, entry: e, tp: [] } as unknown as ParsedSignal
    const lot = computeLotSize({ lot_mode: 'risk_percent', lot_value: riskPct } as never, signal, equity)
    if (!lot || lot <= 0) return { lot: fallbackLot, basis: 'fallback', equity, entry: e }
    return { lot, basis: 'risk', equity, entry: e }
  } catch {
    return { lot: fallbackLot, basis: 'fallback', equity: null, entry: entry ?? null }
  }
}
