/**
 * Horário de mercado — gate para evitar tentativas de abertura com o mercado FECHADO
 * (causa nº1 das falhas "market closed" do GoldKiller e de qualquer estratégia de metais/FX).
 *
 * Regra: em vez de tentar abrir e apanhar um erro do broker, o pipeline consulta isto ANTES
 * e salta (no-op benigno) quando o mercado está fechado. Fail-open: se algo falhar na conta
 * do tempo, devolve `open` para não bloquear indevidamente.
 *
 * Janelas em UTC. Ouro/FX (spot, via brokers MT5) seguem a semana cambial:
 *   Abre  domingo ~22:00 UTC (abertura de Sydney)
 *   Fecha sexta   ~21:00 UTC (fecho de Nova Iorque)
 *   Pausa diária de manutenção/rollover ~21:00–22:00 UTC (seg–qui) — muitos brokers rejeitam ordens.
 * Os limites reais variam ~1h por broker/DST; usamos margens conservadoras + um buffer.
 */

export type MarketKind = 'gold' | 'forex' | 'crypto'

export interface MarketHoursResult {
  open: boolean
  reason: string
}

/** Classe de mercado a partir do símbolo (heurística leve, suficiente para o gate). */
export function marketKindForSymbol(symbol: string): MarketKind {
  const s = (symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (/BTC|ETH|SOL|XRP|DOGE|USDT|PERP|BNB|ADA|AVAX|LINK|LTC|BCH|DOT|MATIC|ARB|SUI|TIA|NEAR/.test(s)) return 'crypto'
  if (/^XAU|^XAG|GOLD|SILVER|^XPT|^XPD/.test(s)) return 'gold'
  return 'forex'
}

/**
 * Está o mercado aberto para este símbolo neste instante?
 * `crypto` está sempre aberto (24/7). `gold`/`forex` seguem a semana cambial + pausa diária.
 */
export function isMarketOpen(symbol: string, at: Date = new Date()): MarketHoursResult {
  const kind = marketKindForSymbol(symbol)
  if (kind === 'crypto') return { open: true, reason: 'cripto 24/7' }

  const day = at.getUTCDay() // 0=Dom … 6=Sáb
  const h = at.getUTCHours()
  const m = at.getUTCMinutes()
  const hm = h * 60 + m

  // Sábado: fechado o dia todo.
  if (day === 6) return { open: false, reason: 'fim de semana (sábado) — mercado fechado' }

  // Domingo: só abre a partir das ~22:00 UTC.
  if (day === 0) {
    if (hm >= 22 * 60) return { open: true, reason: 'abertura de domingo' }
    return { open: false, reason: 'fim de semana (domingo, pré-abertura) — mercado fechado' }
  }

  // Sexta: fecha ~21:00 UTC.
  if (day === 5) {
    if (hm >= 21 * 60) return { open: false, reason: 'fecho de sexta (Nova Iorque) — mercado fechado' }
    // ainda dentro da pausa diária?
    if (hm >= 21 * 60 && hm < 22 * 60) return { open: false, reason: 'pausa diária de rollover' }
  }

  // Seg–Qui (e Sex antes do fecho): pausa diária de manutenção/rollover ~21:00–22:00 UTC.
  if (hm >= 21 * 60 && hm < 22 * 60) {
    return { open: false, reason: 'pausa diária de rollover (~21:00–22:00 UTC)' }
  }

  return { open: true, reason: 'sessão aberta' }
}

/** Conveniência: só o booleano. */
export function marketOpenNow(symbol: string, at: Date = new Date()): boolean {
  return isMarketOpen(symbol, at).open
}
