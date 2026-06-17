/** Mapeia símbolo canónico → variantes comuns em brokers MT5 */
const BROKER_ALIASES: Record<string, string[]> = {
  XAUUSD: ['XAUUSD', 'XAUUSD-STD', 'GOLD', 'XAUUSDm', 'XAUUSD.', 'XAUUSD.a', 'XAUUSDpro', 'XAUUSD-i'],
  EURUSD: ['EURUSD', 'EURUSDm', 'EURUSD.', 'EURUSD.a'],
  GBPUSD: ['GBPUSD', 'GBPUSDm', 'GBPUSD.'],
  USDJPY: ['USDJPY', 'USDJPYm', 'USDJPY.'],
  BTCUSD: ['BTCUSD', 'BTCUSDm', 'BTCUSD.', 'BTCUSDT'],
  NAS100: ['NAS100', 'US100', 'USTEC', 'US500', 'NASDAQ'],
  US30: ['US30', 'DJ30', 'DOW30', 'USA30'],
  GER40: ['GER40', 'DE40', 'DAX40'],
}

export function resolveBrokerSymbol(canonical: string, availableSymbols: string[]): string {
  const upper = canonical.toUpperCase()
  const set = new Set(availableSymbols.map((s) => s.toUpperCase()))

  if (set.has(upper)) {
    return availableSymbols.find((s) => s.toUpperCase() === upper) ?? upper
  }

  const aliases = BROKER_ALIASES[upper] ?? [upper]
  for (const alias of aliases) {
    const hit = availableSymbols.find((s) => s.toUpperCase() === alias.toUpperCase())
    if (hit) return hit
  }

  const compact = upper.replace(/[^A-Z0-9]/g, '')
  const fuzzy = availableSymbols.find((s) => {
    const sc = s.toUpperCase().replace(/[^A-Z0-9]/g, '')
    return sc === compact || sc.startsWith(compact) || compact.startsWith(sc)
  })
  return fuzzy ?? upper
}
