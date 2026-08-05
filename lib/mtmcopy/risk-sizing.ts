import { getAccountSnapshot, getMarketPrice } from './metaapi'
import { computeLotSize } from './lot-sizing'
import type { ParsedSignal } from './signal-parser'

/**
 * Dimensiona o lote por RISCO: a posição é calculada para que, se bater o Stop Loss, a perda
 * seja `riskPct`% da equity da conta. Reutiliza o computeLotSize (risk_percent) do sistema.
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
): Promise<{ lot: number; basis: 'risk' | 'fallback'; equity: number | null; entry: number | null }> {
  try {
    const snap = await getAccountSnapshot(accountId)
    const equity = snap?.equity ?? snap?.balance ?? null
    if (!equity || equity <= 0 || !sl || sl <= 0) {
      return { lot: fallbackLot, basis: 'fallback', equity, entry: entry ?? null }
    }
    let e = entry != null && entry > 0 ? entry : null
    if (e == null) e = await getMarketPrice(accountId, symbol)
    if (e == null || e <= 0) return { lot: fallbackLot, basis: 'fallback', equity, entry: null }

    const signal = { symbol, sl, entry: e, tp: [] } as unknown as ParsedSignal
    const lot = computeLotSize({ lot_mode: 'risk_percent', lot_value: riskPct } as never, signal, equity)
    if (!lot || lot <= 0) return { lot: fallbackLot, basis: 'fallback', equity, entry: e }
    return { lot, basis: 'risk', equity, entry: e }
  } catch {
    return { lot: fallbackLot, basis: 'fallback', equity: null, entry: entry ?? null }
  }
}
