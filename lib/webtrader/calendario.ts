/**
 * EVENTOS DO CALENDÁRIO ECONÓMICO NO GRÁFICO — como o MT5 («Mostrar eventos do calendário económico
 * no gráfico»). Fonte: Finnhub (`/calendar/economic`, chave em FINNHUB_API_KEY, só no servidor).
 *
 * Um símbolo mostra os eventos das moedas que o mexem: EURUSD → EUR e USD; XAUUSD → USD; US30 → USD;
 * GER40 → EUR. Só impacto médio e alto, como o widget do calendário que já existe no WebTrader.
 * Puro; testes em __tests__/calendario.check.ts.
 */
export type Impacto = 'alto' | 'medio'

export interface EventoCalendario {
  /** Segundos unix (UTC). */
  em: number
  moeda: string
  titulo: string
  impacto: Impacto
  atual: string | null
  previsto: string | null
  anterior: string | null
}

/** País do Finnhub → moeda. A zona euro vem como EU (e às vezes por país). */
const MOEDA_DO_PAIS: Record<string, string> = {
  US: 'USD', EU: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', GB: 'GBP', UK: 'GBP', JP: 'JPY',
  CH: 'CHF', AU: 'AUD', CA: 'CAD', NZ: 'NZD', CN: 'CNY',
}
const MOEDAS = new Set(Object.values(MOEDA_DO_PAIS))

/** Índices e metais sem as moedas no nome. */
const MOEDA_DO_ATIVO: Array<[RegExp, string[]]> = [
  [/^(XAU|XAG|GOLD|SILVER)/, ['USD']],
  [/^(US30|US100|US500|NAS|SPX|DJ|USTEC|US2000|RUS2000)/, ['USD']],
  [/^(GER|DE40|DAX|EU50|EUSTX|FRA|CAC|ESP|IT40|NL25)/, ['EUR']],
  [/^(UK100|FTSE)/, ['GBP']],
  [/^(JP225|JPN|NIKKEI)/, ['JPY']],
  [/^(AUS200|ASX)/, ['AUD']],
  [/^(CH20|SMI)/, ['CHF']],
  [/^(HK50|CHINA|CN50)/, ['CNY']],
  [/^(BTC|ETH|SOL|XRP|LTC|ADA)/, ['USD']],
  [/^(USOIL|UKOIL|WTI|BRENT|XTI|XBR|NGAS)/, ['USD']],
]

export function moedasDoSimbolo(symbol: string): string[] {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  for (const [re, moedas] of MOEDA_DO_ATIVO) if (re.test(s)) return moedas
  const a = s.slice(0, 3), b = s.slice(3, 6)
  return [a, b].filter((m, i, l) => MOEDAS.has(m) && l.indexOf(m) === i)
}

interface LinhaFinnhub { time?: string; country?: string; event?: string; impact?: string; actual?: unknown; estimate?: unknown; prev?: unknown; unit?: string }

const texto = (v: unknown, unidade?: string) => (v == null || v === '' ? null : `${v}${unidade && unidade !== '%' ? ` ${unidade}` : unidade ?? ''}`)

/** Da resposta da Finnhub para os eventos destas moedas, por ordem de tempo. */
export function eventosDasMoedas(linhas: LinhaFinnhub[], moedas: string[]): EventoCalendario[] {
  const querer = new Set(moedas)
  const out: EventoCalendario[] = []
  for (const l of Array.isArray(linhas) ? linhas : []) {
    const moeda = MOEDA_DO_PAIS[String(l.country ?? '').toUpperCase()]
    const impacto = l.impact === 'high' ? 'alto' : l.impact === 'medium' ? 'medio' : null
    if (!moeda || !impacto || !querer.has(moeda) || !l.time || !l.event) continue
    // A Finnhub devolve «AAAA-MM-DD HH:MM:SS» em UTC, sem zona.
    const em = Math.floor(new Date(`${l.time.replace(' ', 'T')}Z`).getTime() / 1000)
    if (!Number.isFinite(em)) continue
    out.push({ em, moeda, titulo: l.event, impacto, atual: texto(l.actual, l.unit), previsto: texto(l.estimate, l.unit), anterior: texto(l.prev, l.unit) })
  }
  return out.sort((a, b) => a.em - b.em)
}

/** O próximo evento (a partir de agora), para o aviso por cima do gráfico. */
export function proximoEvento(eventos: EventoCalendario[], agora: number): EventoCalendario | null {
  return eventos.find((e) => e.em >= agora) ?? null
}
