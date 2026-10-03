/**
 * DECISÃO ÚNICA de quem gere as saídas de uma posição MTM Auto (o "gate" que estava espalhado).
 * Consolidação — ver o mapa de execução. Fonte única de verdade para o código novo.
 *
 *  'price'   → premium-price-monitor (realtime, por PREÇO, sobre a posição REAL). Principal.
 *              Gere Premium · Sensei · Gold Did (registados em mtmcopy_auto_positions).
 *  'alert'   → sensei-management-exec (webhook tp_hit/sl_hit/be). LEGADO — só quando price_monitor OFF.
 *  'message' → premium-management-exec (Telegram HIT TP / running). FALLBACK do Premium.
 *  'own'     → motor próprio isolado (Forex Swings / PrimeVerse / Bybit) — mercados distintos, fica à parte.
 */
export type ExitEngine = 'price' | 'alert' | 'message' | 'own'

export interface ExitEngineInput {
  /** execution.price_monitor da rota (true = saídas por PREÇO no monitor realtime). */
  priceMonitor?: boolean | null
  /** motor legado desta rota quando price_monitor está OFF ('alert' p/ Sensei-webhook, 'message' p/ Premium). */
  legacy?: Exclude<ExitEngine, 'price' | 'own'>
}

/** Resolve o motor de saída. price_monitor ON tem sempre prioridade (a direção da consolidação). */
export function resolveExitEngine(input: ExitEngineInput): ExitEngine {
  if (input.priceMonitor === true) return 'price'
  return input.legacy ?? 'alert'
}

/** Atalho legível: esta rota gere as saídas por PREÇO (monitor realtime)? */
export function usesPriceMonitor(input: { price_monitor?: boolean | null }): boolean {
  return input?.price_monitor === true
}
