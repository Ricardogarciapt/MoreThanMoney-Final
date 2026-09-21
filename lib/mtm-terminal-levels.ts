/**
 * Níveis técnicos REAIS para o Terminal MTM — velas diárias do instrumento de REFERÊNCIA do ativo
 * (Binance spot para cripto, perpétuo Binance para metais — ao nível do spot —, Yahoo para o resto)
 * e cálculo puro em lib/mtm-terminal-technicals.ts. Sem MetaApi, sem variáveis novas.
 * Se a referência principal falhar, tenta as de reserva do ativo (refFallbacks).
 */
import { referencePlan, type ReferenceInstrument, type TerminalAsset } from "@/lib/mtm-terminal-assets"
import { basisAdjust, computeTerminalLevels, type Candle, type TerminalLevels } from "@/lib/mtm-terminal-technicals"
import { buscarVelasRef } from "@/lib/mercado/velas-referencia"

export type { Candle, TerminalLevels } from "@/lib/mtm-terminal-technicals"
export { computeTerminalLevels, buildLevelsContext } from "@/lib/mtm-terminal-technicals"

/**
 * Velas diárias de UMA referência pelo buscador comum (lib/mercado/velas-referencia.ts — o mesmo
 * que serve as velas de reserva do WebTrader). Vazio se a fonte falhar: passa-se à seguinte.
 * Cripto sem Binance → CoinGecko (só aqui: o Terminal precisa do diário, o WebTrader não).
 */
async function fetchRefCandles(ref: ReferenceInstrument): Promise<Candle[]> {
  try {
    const velas = await buscarVelasRef(ref, "D1", 260)
    if (velas.length) return velas.map((v) => ({ t: v.t * 1000, o: v.o, h: v.h, l: v.l, c: v.c }))
    if (ref.kind !== "binance-spot") return []
    const { fetchCoinGeckoOhlcAsKlines } = await import("@/lib/crypto-usd")
    const k = await fetchCoinGeckoOhlcAsKlines(ref.symbol, 90).catch(() => null)
    return (k ?? []).map(([t, o, h, l, c]) => ({ t, o, h, l, c }))
  } catch {
    return []
  }
}

/**
 * OHLC diário (mais recente por último), ~1 ano, e a referência de onde veio — quem usa as velas
 * precisa do `sameLevel` DESSA referência para saber se as reescala (a de reserva nunca está ao nível).
 * Mínimo de velas para servir: com menos não há EMA50/ATR/intervalo, e é melhor tentar a seguinte.
 */
export const MIN_CANDLES = 60
export async function fetchTerminalCandleSeries(asset: TerminalAsset): Promise<{ ref: ReferenceInstrument; candles: Candle[] }> {
  const plan = referencePlan(asset)
  let best: { ref: ReferenceInstrument; candles: Candle[] } = { ref: asset.ref, candles: [] }
  for (const ref of plan) {
    const candles = await fetchRefCandles(ref)
    if (candles.length >= MIN_CANDLES) return { ref, candles }
    if (candles.length > best.candles.length) best = { ref, candles }
  }
  return best
}

/** Compatibilidade: só as velas. Quem as reescala deve usar fetchTerminalCandleSeries. */
export async function fetchTerminalCandles(asset: TerminalAsset): Promise<Candle[]> {
  return (await fetchTerminalCandleSeries(asset)).candles
}

/** Busca candles + calcula níveis num só passo (best-effort), já ao nível do preço mostrado. */
export async function fetchTerminalLevels(asset: TerminalAsset, price: number | null): Promise<TerminalLevels | null> {
  if (price == null) return null
  const { ref, candles } = await fetchTerminalCandleSeries(asset)
  const { candles: adj } = basisAdjust(candles, price, ref.sameLevel)
  return computeTerminalLevels(adj, price)
}
