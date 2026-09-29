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
  NAS100: ['NAS100', 'US100', 'USTEC', 'USTECH', 'NASDAQ', 'NDX', 'USNAS100', 'NAS100USD'],
  SPX500: ['SPX500', 'US500', 'SP500', 'SPX', 'USSPX500', 'SPX500USD'],
  US30: ['US30', 'DJ30', 'DOW30', 'USA30', 'WS30', 'DJI', 'US30CASH', 'US30USD', 'DOWUSD'],
  GER40: ['GER40', 'DE40', 'DAX40', 'DAX', 'GER30', 'DE30', 'GER40CASH', 'DE40CASH'],
  UK100: ['UK100', 'FTSE100', 'FTSE', 'UK100GBP', 'UK100CASH'],
  JPN225: ['JPN225', 'JP225', 'NIKKEI', 'NIKKEI225', 'N225'],
  // Petróleo WTI — tickers reais de corretora (VT usa USOUSD; outras WTI/XTI/USOIL).
  USOIL: ['USOIL', 'WTI', 'WTIUSD', 'CRUDE', 'CRUDEOIL', 'XTIUSD', 'OILUSD', 'USOUSD', 'USOILSPOT'],
  // Petróleo Brent (instrumento distinto — só se o sinal pedir Brent).
  UKOIL: ['UKOIL', 'BRENT', 'BRENTUSD', 'XBRUSD', 'UKOUSD', 'BRENTOIL'],
  // Gás natural.
  NATGAS: ['NATGAS', 'NATURALGAS', 'NGAS', 'XNGUSD', 'XNG', 'NGUSD', 'GASUSD', 'NATURAL_GAS', 'NATURALGASUSD'],
}

/**
 * Tokens DISTINTIVOS por família p/ match por substring (contains) quando o core exato
 * falha — apanha tickers de corretora com grafias diferentes (VT: petróleo=USOUSD, etc.).
 * REGRA: só tokens que NÃO são prefixo de outro símbolo válido (evita US30↔US3000). Por
 * isso NÃO se usam aqui os canónicos de índice (US30/UK100/GER40/NAS100/SPX500); só as
 * grafias inequívocas (DAX, FTSE, DOW, NIKKEI, NASDAQ, WTI, XTI, NGAS, …). >=3 chars.
 */
const FAMILY_TOKENS: Record<string, string[]> = {
  USOIL: ['USOIL', 'USOUSD', 'WTIUSD', 'XTIUSD', 'CRUDE', 'OILUSD', 'WTI', 'XTI'],
  UKOIL: ['UKOIL', 'UKOUSD', 'BRENT', 'XBRUSD'],
  NATGAS: ['NATGAS', 'NATURALGAS', 'NGAS', 'XNGUSD', 'XNG', 'GASUSD'],
  US30: ['DJ30', 'DOW', 'WS30', 'DJI', 'USA30'],
  GER40: ['DAX'],
  UK100: ['FTSE'],
  NAS100: ['USTEC', 'NASDAQ', 'NDX'],
  SPX500: ['SP500', 'SPX500'],
  JPN225: ['NIKKEI', 'N225'],
}

/** Tokens distintivos da família a que o canónico pertence (para match por substring). */
function familyTokensFor(canonical: string): string[] {
  const up = (canonical || '').toUpperCase().trim()
  for (const [key, list] of Object.entries(BROKER_ALIASES)) {
    if (key === up || list.includes(up)) return FAMILY_TOKENS[key] ?? []
  }
  return FAMILY_TOKENS[up] ?? []
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
  return rankedBrokerSymbolsComChave(canonical, availableSymbols).map((r) => r.sym)
}

/**
 * O MESMO ranking, mas com a chave de desempate à vista.
 *
 * Existe porque escolher `[0]` às cegas é seguro quando há um vencedor e é um palpite quando há
 * dois candidatos empatados em TUDO (ex.: uma conta com `XAUUSD.r` e `XAUUSD.x`, ambos com a mesma
 * frequência de sufixo e a mesma grafia). Quem resolve símbolos automaticamente precisa de ver o
 * empate para poder recusar em vez de adivinhar — ver `lib/mtmcopy/resolucao-simbolos.ts`.
 */
export interface CandidatoSimbolo {
  sym: string
  /** Igual ao canónico, letra a letra. */
  exact: boolean
  /** Só apanhado pelo fallback de família (commodities/índices) — match mais fraco. */
  fuzzy: boolean
  /** Quantas vezes este sufixo aparece na conta (o sufixo NATIVO da corretora ganha). */
  suffix: number
  /** Distância da grafia à do canónico; menor é melhor. */
  score: number
}

export function rankedBrokerSymbolsComChave(canonical: string, availableSymbols: string[]): CandidatoSimbolo[] {
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
  const tokens = familyTokensFor(up) // grafias distintivas (fallback contains p/ commodities/índices)
  const wantedCompact = up.replace(/[^A-Z0-9]/g, '').length
  const exactUp = up

  const ranked: CandidatoSimbolo[] = []
  for (const s of availableSymbols) {
    const su = s.toUpperCase().trim()
    const exact = su === exactUp
    let matched = exact
    let fuzzy = false
    if (!matched) {
      for (const c of coresOf(s)) {
        if (c.length >= 3 && wanted.has(c)) { matched = true; break }
      }
    }
    // Fallback SÓ p/ famílias (commodities/índices): o core exato falhou mas o símbolo da
    // corretora contém uma grafia distintiva da família (ex.: USOUSD contém 'USOUSD'/'WTI').
    if (!matched && tokens.length) {
      const compact = su.replace(/[^A-Z0-9]/g, '')
      if (tokens.some((t) => t.length >= 3 && compact.includes(t))) { matched = true; fuzzy = true }
    }
    if (!matched) continue
    // Normaliza maiúsculas ANTES de compactar — senão sufixos minúsculos (".crp") são
    // removidos pelo [^A-Z0-9] e o símbolo parece um match perfeito.
    const compactLen = s.toUpperCase().replace(/[^A-Z0-9]/g, '').length
    ranked.push({ sym: s, exact, fuzzy, suffix: suffixScore(s), score: Math.abs(compactLen - wantedCompact) })
  }
  // exato 1º; core-match antes de fuzzy; depois sufixo nativo (freq desc); grafia mais próxima.
  ranked.sort((a, b) =>
    (a.exact === b.exact ? 0 : a.exact ? -1 : 1) ||
    (a.fuzzy === b.fuzzy ? 0 : a.fuzzy ? 1 : -1) ||
    (b.suffix - a.suffix) ||
    (a.score - b.score),
  )
  return ranked
}

/**
 * Dois símbolos pertencem à mesma família? (ex.: XAUUSD ↔ XAUUSD.S ↔ GOLD ↔ GOLD.r)
 * Compara os CORES canónicos (com aliases) de ambos — nunca substring cega, por isso
 * US30 nunca casa com US3000. Para whitelists e filtros configurados pelo utilizador,
 * onde o membro escreve o símbolo COM o sufixo da corretora dele.
 */
export function symbolMatchesCanonical(a: string | null | undefined, b: string | null | undefined): boolean {
  const ua = (a || '').toUpperCase().trim()
  const ub = (b || '').toUpperCase().trim()
  if (!ua || !ub) return false
  if (ua === ub) return true
  const coresA = canonicalCores(ua)
  const coresB = canonicalCores(ub)
  for (const c of coresA) {
    if (c.length >= 3 && coresB.has(c)) return true
  }
  return false
}

/**
 * Expande entradas de whitelist para o filtro CopyFactory: cada entrada (possivelmente
 * com sufixo de corretora, ex.: "XAUUSD.S") passa a incluir também o canónico e os
 * aliases da família ("XAUUSD", "GOLD", …). O symbolFilter do CopyFactory compara com o
 * símbolo do PROVIDER (canónico) — sem esta expansão, uma whitelist com sufixo local
 * filtraria TODAS as trades e a conta nunca copiaria nada.
 */
export function expandWhitelistForCopyFactory(entries: string[] | null | undefined): string[] | null {
  if (!entries?.length) return entries ?? null
  const out = new Set<string>()
  for (const entry of entries) {
    const up = (entry || '').toUpperCase().trim()
    if (!up) continue
    out.add(up)
    for (const core of canonicalCores(up)) {
      if (core.length >= 3) out.add(core)
    }
  }
  return out.size ? [...out] : null
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
