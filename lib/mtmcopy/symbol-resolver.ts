/**
 * Resolve o símbolo canónico do sinal (ex.: XAUUSD) para o símbolo REAL da corretora,
 * que muitas vezes traz sufixos/prefixos próprios (XAUUSD.r, EURUSDm, US30.cash, GER40+,
 * _i, .pro, -5, #, micro, ecn, raw, …). Matching tolerante mas SEGURO: compara o "core"
 * por igualdade (nunca substring), por isso US30 nunca casa com US3000.
 */

/** Símbolo canónico → equivalentes conhecidos noutras nomenclaturas (índices/metais/cripto). */
const BROKER_ALIASES: Record<string, string[]> = {
  XAUUSD: ['XAUUSD', 'GOLD', 'GOLDUSD'],
  XAGUSD: ['XAGUSD', 'SILVER', 'SILVERUSD'],
  BTCUSD: ['BTCUSD', 'BTCUSDT', 'BITCOIN'],
  ETHUSD: ['ETHUSD', 'ETHUSDT', 'ETHEREUM'],
  NAS100: ['NAS100', 'US100', 'USTEC', 'USTECH', 'NASDAQ', 'NDX', 'USNAS100'],
  SPX500: ['SPX500', 'US500', 'SP500', 'SPX', 'USSPX500'],
  US30: ['US30', 'DJ30', 'DOW30', 'USA30', 'WS30', 'DJI', 'US30CASH'],
  GER40: ['GER40', 'DE40', 'DAX40', 'DAX', 'GER30', 'DE30'],
  UK100: ['UK100', 'FTSE100', 'FTSE', 'UK100GBP'],
  JPN225: ['JPN225', 'JP225', 'NIKKEI', 'NIKKEI225'],
  USOIL: ['USOIL', 'WTI', 'CRUDE', 'XTIUSD', 'OILUSD', 'UKOIL', 'BRENT', 'XBRUSD'],
  NATGAS: ['NATGAS', 'NATURALGAS', 'NGAS', 'XNGUSD', 'NG', 'GAS', 'NATURAL_GAS', 'NATURALGASUSD'],
}

/** Sufixos/segmentos de corretora a remover (sem separador) para chegar ao core. */
const TRAILING_SUFFIXES = [
  'MICRO', 'CASH', 'SPOT', 'PERP', 'CENT', 'ECN', 'RAW', 'PRO', 'STD', 'ZERO', 'PLUS',
  'MINI', 'FT', 'SB', 'M', 'C', 'I', 'A', 'E', 'Z', 'S', 'R', 'X', 'N', 'P', 'K', 'U', 'V',
]

/** Constrói o conjunto de "cores" possíveis de um símbolo (>=3 chars). */
function coresOf(symbol: string): Set<string> {
  const up = (symbol || '').toUpperCase().trim()
  const out = new Set<string>()
  if (!up) return out
  out.add(up)

  // 1) parte antes do 1.º separador (XAUUSD.r → XAUUSD, US30_cash → US30, GER40+ → GER40)
  const beforeSep = up.split(/[._\-+#/\\ :]/)[0]
  if (beforeSep) out.add(beforeSep)

  // 2) forma compacta (sem separadores)
  const compact = up.replace(/[^A-Z0-9]/g, '')
  if (compact) out.add(compact)

  // 3) remover sufixos conhecidos (com e sem separador) — preservando >=3 chars
  for (const base of [beforeSep, compact]) {
    if (!base) continue
    for (const suf of TRAILING_SUFFIXES) {
      if (base.length - suf.length >= 3 && base.endsWith(suf)) {
        out.add(base.slice(0, base.length - suf.length))
      }
    }
  }
  return out
}

/** Expande um símbolo canónico nos seus cores + aliases conhecidos. */
function canonicalCores(canonical: string): Set<string> {
  const up = (canonical || '').toUpperCase().trim()
  const cores = coresOf(up)
  // aliases: se o canónico (ou um alias) corresponder a uma família, junta todos
  for (const [key, list] of Object.entries(BROKER_ALIASES)) {
    if (key === up || list.includes(up) || [...cores].some((c) => c === key || list.includes(c))) {
      cores.add(key)
      for (const a of list) cores.add(a)
    }
  }
  return cores
}

/**
 * Devolve TODOS os símbolos da corretora que correspondem ao canónico, ordenados do
 * melhor para o pior: match exato primeiro, depois por core preferindo o sufixo NATIVO
 * (mais frequente na conta) e a grafia mais próxima. A execução percorre esta lista para
 * escolher a 1ª variante NEGOCIÁVEL (ex.: VT Markets tem EURUSD bare = DISABLED e
 * EURUSD-STD = FULL; o exato bare vem 1º mas é disabled → salta para -STD).
 */
export function rankedBrokerSymbols(canonical: string, availableSymbols: string[]): string[] {
  const up = (canonical || '').toUpperCase().trim()
  if (!availableSymbols?.length) return []

  // Frequência de cada sufixo ([.-]XXX no fim) na conta — para preferir o sufixo NATIVO
  // da corretora entre variantes do mesmo core. Ex.: VT tem -STD (71×), .s (32×), .crp
  // (1×) → prefere -STD (o negociável na conta Standard).
  const suffixFreq = new Map<string, number>()
  for (const s of availableSymbols) {
    const m = s.toUpperCase().match(/([.\-][A-Z0-9]+)$/)
    if (m) suffixFreq.set(m[1], (suffixFreq.get(m[1]) ?? 0) + 1)
  }
  const suffixScore = (s: string): number => {
    const m = s.toUpperCase().match(/([.\-][A-Z0-9]+)$/)
    return m ? (suffixFreq.get(m[1]) ?? 0) : 0
  }

  const wanted = canonicalCores(up)
  const wantedCompact = up.replace(/[^A-Z0-9]/g, '').length
  const exactUp = up

  const ranked: Array<{ sym: string; exact: boolean; suffix: number; score: number }> = []
  for (const s of availableSymbols) {
    const su = s.toUpperCase().trim()
    const exact = su === exactUp
    let matched = exact
    if (!matched) {
      for (const c of coresOf(s)) {
        if (c.length >= 3 && wanted.has(c)) { matched = true; break }
      }
    }
    if (!matched) continue
    // Normaliza maiúsculas ANTES de compactar — senão sufixos minúsculos (".crp") são
    // removidos pelo [^A-Z0-9] e o símbolo parece um match perfeito.
    const compactLen = s.toUpperCase().replace(/[^A-Z0-9]/g, '').length
    ranked.push({ sym: s, exact, suffix: suffixScore(s), score: Math.abs(compactLen - wantedCompact) })
  }
  // exato 1º; depois sufixo nativo (freq desc); depois grafia mais próxima (score asc).
  ranked.sort((a, b) =>
    (a.exact === b.exact ? 0 : a.exact ? -1 : 1) || (b.suffix - a.suffix) || (a.score - b.score),
  )
  return ranked.map((r) => r.sym)
}

export function resolveBrokerSymbol(canonical: string, availableSymbols: string[]): string {
  const up = (canonical || '').toUpperCase().trim()
  if (!availableSymbols?.length) return up
  const ranked = rankedBrokerSymbols(up, availableSymbols)
  // sem correspondência → devolve o canónico (o caller reporta erro claro)
  return ranked[0] ?? up
}

/**
 * Versão estrita: devolve null se a corretora NÃO tiver o símbolo (em vez de adivinhar).
 * Útil para dar erro claro ("X não disponível nesta corretora") antes de enviar a ordem.
 */
export function findBrokerSymbol(canonical: string, availableSymbols: string[]): string | null {
  const resolved = resolveBrokerSymbol(canonical, availableSymbols)
  const hit = availableSymbols.find((s) => s.toUpperCase().trim() === resolved.toUpperCase().trim())
  return hit ?? null
}
