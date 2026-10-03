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

// ── Saltar LEITURAS à MetaApi com o mercado fechado (fim de semana) ─────────────
//
// Ao fim de semana o ouro e o forex não mexem: não há ticks, os SL/TP não disparam e a corretora
// não aceita ordens. Ler posições e preços dessas contas de segundo a segundo é pagar créditos
// para receber a mesma fotografia de sexta à noite. A cripto negoceia 24/7 e continua a ser lida.
//
// A janela é a semana cambial de NOVA IORQUE (sexta 17:00 → domingo 17:00, hora de NY), que em UTC
// é sexta 21:00 → domingo 21:00 no horário de verão e 22:00 → 22:00 no de inverno. Com 5 min de
// margem dos dois lados: começa a saltar às 17:05 de sexta e volta a ler às 16:55 de domingo.
// Ainda por cima exige que o `isMarketOpen` (acima) também diga fechado — só se salta quando as
// duas contas concordam. Feriados da corretora: o helper não os conhece, por isso NÃO se saltam
// (lê-se como num dia normal — é o lado seguro).

const MARGEM_FIM_DE_SEMANA_MIN = 5

/** Dia da semana (0=Dom) e minutos do dia em Nova Iorque. null se o Intl falhar. */
function horaNovaIorque(at: Date): { dia: number; hm: number } | null {
  try {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at)
    const v = (t: string) => partes.find((p) => p.type === t)?.value ?? ''
    const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v('weekday'))
    const h = Number(v('hour'))
    const m = Number(v('minute'))
    if (dia < 0 || !Number.isFinite(h) || !Number.isFinite(m)) return null
    return { dia, hm: (h % 24) * 60 + m }
  } catch {
    return null
  }
}

/** Fim de semana cambial (sexta 17:05 → domingo 16:55, hora de Nova Iorque)? Falha → false. */
export function fimDeSemanaFx(at: Date = new Date()): boolean {
  const ny = horaNovaIorque(at)
  if (!ny) return false
  const fecho = 17 * 60 + MARGEM_FIM_DE_SEMANA_MIN
  const abertura = 17 * 60 - MARGEM_FIM_DE_SEMANA_MIN
  if (ny.dia === 6) return true
  if (ny.dia === 5) return ny.hm >= fecho
  if (ny.dia === 0) return ny.hm < abertura
  return false
}

/** Interruptor `SALTAR_LEITURAS_MERCADO_FECHADO` — ligado por defeito; '0'/'false'/'off' desliga. */
export function saltarLeiturasLigado(valor: string | undefined = process.env.SALTAR_LEITURAS_MERCADO_FECHADO): boolean {
  const v = String(valor ?? '1').trim().toLowerCase()
  return !(v === '0' || v === 'false' || v === 'off' || v === 'nao' || v === 'não')
}

/**
 * Pode-se saltar a leitura de uma conta/posição com estes símbolos agora?
 *
 * Só quando: o interruptor está ligado, é fim de semana cambial, o `isMarketOpen` concorda, e
 * NENHUM símbolo é cripto. Uma lista vazia NÃO salta (não sabemos o que lá está — lê-se).
 */
export function podeSaltarLeitura(
  simbolos: Array<string | null | undefined>,
  at: Date = new Date(),
  ligado: boolean = saltarLeiturasLigado(),
): boolean {
  if (!ligado) return false
  const lista = simbolos.map((s) => String(s ?? '').trim()).filter(Boolean)
  if (!lista.length) return false
  if (!fimDeSemanaFx(at)) return false
  return lista.every((s) => marketKindForSymbol(s) !== 'crypto' && !isMarketOpen(s, at).open)
}
