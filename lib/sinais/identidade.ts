/**
 * IDENTIDADE DE UM SINAL — estratégia, fonte e id de origem (isolamento por estratégia, 07/10/2026).
 *
 * Até aqui cada etapa da cadeia (alerta → ideia → entrada → seguimento → mestre → slaves → desfecho)
 * encontrava a anterior pelo TICKER, pela «mais recente» ou por um texto. Com duas estratégias no
 * mesmo par isso misturava-as: a entrada do Sensei activava a ideia do MTM Scanner, os TP do Sensei
 * marcavam a compra do Scanner, e qualquer alerta de ouro sem nome conhecido ia parar à mestre do
 * Sensei. O modelo está em docs/sinais-isolamento-estrategias.md.
 *
 * Três regras, todas aqui e todas puras (sem base, sem rede — testes em
 * lib/sinais/__tests__/isolamento-estrategias.check.ts):
 *
 *  1. A ESTRATÉGIA resolve-se UMA vez, à entrada, e é um slug de `mestres_estrategias`. O
 *     `?strategy=` do URL manda; sem ele, o nome do alerta — e se o nome servir a duas estratégias
 *     a resposta é «ambígua», nunca «a primeira que apanhar».
 *  2. A CHAVE DA TRADE vem dos campos da própria fonte: o id que ela mandar, ou (o Pine do Sensei
 *     não manda id) a impressão digital que ela repete IGUAL em todos os seguimentos — ticker,
 *     direcção, entrada, timeframe e TP1. Medido a 07/10: 111 de 111 seguimentos do Sensei em 30
 *     dias encontram exactamente uma entrada por esta chave.
 *  3. UM SEGUIMENTO SÓ TOCA NA SUA ENTRADA: mesma estratégia E mesma chave. Zero candidatas = sem
 *     entrada; duas ou mais = ambíguo. Em nenhum dos casos se escolhe «a mais recente» — não se
 *     executa e o motivo fica escrito.
 */

/** Chave interna do webhook TradingView (o `scannerKey` da rota). */
export type ChaveWebhook = 'sensei' | 'goldkiller' | 'mtmscanner' | 'aurum' | 'mtmperps'

/**
 * Slug canónico (o de `mestres_estrategias.slug`) de cada chave do webhook. `mtm-perps` não tem
 * mestre — continua a ter identidade própria para nunca se confundir com a Aurum.
 */
export const ESTRATEGIA_DA_CHAVE: Record<ChaveWebhook, string> = {
  sensei: 'sensei',
  goldkiller: 'Goldkiller',
  mtmscanner: 'mtm-scanner',
  aurum: 'aurum-flow',
  mtmperps: 'mtm-perps',
}

/** Fonte da mestre (`ESTRATEGIA_DO_WEBHOOK` em lib/mestres/servidor/sinal-mestre.ts) por estratégia. */
export const FONTE_DA_MESTRE: Record<string, ChaveWebhook> = {
  sensei: 'sensei',
  Goldkiller: 'goldkiller',
  'mtm-scanner': 'mtmscanner',
  'aurum-flow': 'aurum',
}

const FORCADA: Record<string, ChaveWebhook> = {
  sensei: 'sensei',
  goldkiller: 'goldkiller',
  mtmscanner: 'mtmscanner',
  scanner: 'mtmscanner',
  aurum: 'aurum',
  aurumflow: 'aurum',
  mtmperps: 'mtmperps',
}

export interface IdentidadeDoAlerta {
  chave: ChaveWebhook | null
  /** slug canónico; `null` = desconhecida ou ambígua (não executa) */
  estrategia: string | null
  /** porque é que não há estratégia (só quando `estrategia` é null) */
  motivo: string | null
}

/**
 * Resolve a estratégia de um alerta TradingView.
 *
 *  · `forcada` (`?strategy=` do URL) manda sempre — é o URL dedicado de cada alerta.
 *  · Sem ela, o nome/texto do alerta. A Aurum chama-se «MTM Perps Aurum Flow»: quando o nome traz
 *    «Aurum Flow» é a Aurum (o «MTM Perps» faz parte do nome dela). Fora isso, dois nomes no mesmo
 *    alerta (ex.: «GoldKiller» e «Sensei») = ambíguo.
 */
export function resolverEstrategiaDoAlerta(a: {
  forcada?: string | null
  alertName?: string | null
  texto?: string | null
}): IdentidadeDoAlerta {
  const f = String(a.forcada ?? '').toLowerCase().trim()
  if (f) {
    const chave = FORCADA[f] ?? null
    return chave
      ? { chave, estrategia: ESTRATEGIA_DA_CHAVE[chave], motivo: null }
      : { chave: null, estrategia: null, motivo: `?strategy=${f} não é uma estratégia conhecida` }
  }
  const t = `${a.alertName ?? ''} ${a.texto ?? ''}`.toLowerCase()
  const achadas = new Set<ChaveWebhook>()
  if (/aurum\s*flow/.test(t)) achadas.add('aurum')
  else if (/mtm[\s_-]*perps?\b|perps?[\s_-]*scanner/.test(t)) achadas.add('mtmperps')
  if (/mtm[\s_-]*scanner/.test(t)) achadas.add('mtmscanner')
  if (/goldkiller|gold[\s_-]*kill/.test(t)) achadas.add('goldkiller')
  if (/sensei/.test(t)) achadas.add('sensei')
  if (achadas.size === 1) {
    const chave = [...achadas][0]
    return { chave, estrategia: ESTRATEGIA_DA_CHAVE[chave], motivo: null }
  }
  if (achadas.size === 0) return { chave: null, estrategia: null, motivo: 'alerta sem estratégia reconhecível (sem ?strategy= e sem nome conhecido)' }
  return { chave: null, estrategia: null, motivo: `alerta ambíguo: o nome serve a ${[...achadas].map((c) => ESTRATEGIA_DA_CHAVE[c]).join(' e ')}` }
}

/** A estratégia infere-se do `alert_name` gravado? (preenchimento dos registos recentes — mesma regra) */
export function estrategiaDoNomeGravado(alertName: string | null | undefined): string | null {
  return resolverEstrategiaDoAlerta({ alertName }).estrategia
}

// ── Chave da trade ──────────────────────────────────────────────────────────────────────────────

function campo(p: Record<string, unknown>, nomes: string[]): unknown {
  for (const n of nomes) {
    const v = p[n]
    if (v != null && v !== '') return v
  }
  return null
}

/** Número normalizado como texto («4132.730» → «4132.73»); null se não for um preço. */
export function numeroCanonico(v: unknown): string | null {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return String(Number(n.toFixed(8)))
}

function direcaoCanonica(v: unknown): 'buy' | 'sell' | null {
  const s = String(v ?? '').toLowerCase()
  if (/buy|long|compra/.test(s)) return 'buy'
  if (/sell|short|venda/.test(s)) return 'sell'
  return null
}

/** Campos onde uma fonte pode mandar o id da sua trade (o mais forte de todos). */
export const CAMPOS_ID_DA_TRADE = ['trade_id', 'tradeId', 'signal_id', 'id_sinal', 'entry_id', 'position_id'] as const

/**
 * A chave que liga a entrada aos seus seguimentos, calculada SÓ com os campos da fonte (o payload
 * cru, nunca o preço corrigido pela corretora — a fonte repete o seu, não o nosso).
 *
 *  · id explícito da fonte → `<estrategia>|id:<id>`;
 *  · senão → `<estrategia>|<TICKER>|<dir>|<entrada>|<tf>|<tp1>`;
 *  · sem estratégia, ticker, direcção ou entrada → null (não há chave; um seguimento sem chave não
 *    liga a nada).
 */
export function chaveDaTrade(a: {
  estrategia: string | null
  ticker: string | null | undefined
  payload: unknown
  /** direcção já resolvida (os seguimentos do Sensei trazem `action` = lado da trade) */
  direcao?: string | null
}): string | null {
  if (!a.estrategia) return null
  const p = a.payload && typeof a.payload === 'object' && !Array.isArray(a.payload) ? (a.payload as Record<string, unknown>) : {}
  const id = campo(p, [...CAMPOS_ID_DA_TRADE])
  if (id != null && String(id).trim()) return `${a.estrategia}|id:${String(id).trim()}`
  const ticker = String(a.ticker ?? campo(p, ['ticker', 'symbol']) ?? '').toUpperCase().replace(/^[A-Z0-9_]+:/, '').trim()
  const dir = direcaoCanonica(a.direcao ?? campo(p, ['action', 'side', 'direction']))
  const entrada = numeroCanonico(campo(p, ['entry', 'entry_price']))
  if (!ticker || !dir || !entrada) return null
  const tf = String(campo(p, ['tf', 'timeframe', 'interval']) ?? '').trim()
  const tp1 = numeroCanonico(campo(p, ['tp1', 'tp', 'take_profit', 'target'])) ?? ''
  return `${a.estrategia}|${ticker}|${dir}|${entrada}|${tf}|${tp1}`
}

// ── Seguimento → entrada ────────────────────────────────────────────────────────────────────────

export interface EntradaComIdentidade {
  id: string
  estrategia: string | null
  chave_trade: string | null
  /** preenchido = esta linha é um duplicado de outra entrada (não é candidata) */
  entrada_id?: string | null
  chat_message_id?: string | null
}

export type Ligacao =
  | { ok: true; entradaId: string; entrada: EntradaComIdentidade; ligacao: 'chave' }
  | { ok: false; entradaId: null; entrada: null; ligacao: 'sem_estrategia' | 'sem_chave' | 'sem_entrada' | 'ambigua'; motivo: string }

/**
 * A entrada de um seguimento. Só candidatas da MESMA estratégia e com a MESMA chave; nunca a mais
 * recente do ticker. `candidatas` podem vir de qualquer consulta (até sem filtro): a decisão
 * filtra-as outra vez, para que um erro na consulta não chegue a uma trade alheia.
 */
export function ligarSeguimento(
  candidatas: readonly EntradaComIdentidade[],
  seg: { estrategia: string | null; chave: string | null },
): Ligacao {
  if (!seg.estrategia) return { ok: false, entradaId: null, entrada: null, ligacao: 'sem_estrategia', motivo: 'seguimento sem estratégia: não toca em entrada nenhuma' }
  if (!seg.chave) return { ok: false, entradaId: null, entrada: null, ligacao: 'sem_chave', motivo: 'seguimento sem chave da trade (sem id nem entrada da fonte): não toca em entrada nenhuma' }
  const minhas = candidatas.filter((c) => c.estrategia === seg.estrategia && c.chave_trade === seg.chave && !c.entrada_id)
  if (minhas.length === 1) return { ok: true, entradaId: minhas[0].id, entrada: minhas[0], ligacao: 'chave' }
  if (minhas.length === 0) return { ok: false, entradaId: null, entrada: null, ligacao: 'sem_entrada', motivo: `nenhuma entrada aberta de ${seg.estrategia} com a chave ${seg.chave}` }
  return { ok: false, entradaId: null, entrada: null, ligacao: 'ambigua', motivo: `${minhas.length} entradas abertas de ${seg.estrategia} com a mesma chave: nada executado` }
}

/**
 * Uma entrada repetida (a fonte reenviou o mesmo alerta) liga-se à original em vez de nascer como
 * segunda trade — senão os seguimentos dessa trade passavam a ser ambíguos.
 */
export function entradaOriginal(
  abertas: readonly EntradaComIdentidade[],
  nova: { id?: string | null; estrategia: string | null; chave: string | null },
): string | null {
  if (!nova.estrategia || !nova.chave) return null
  const iguais = abertas.filter((c) => c.id !== nova.id && c.estrategia === nova.estrategia && c.chave_trade === nova.chave && !c.entrada_id)
  return iguais.length === 1 ? iguais[0].id : null
}

// ── Mestre ──────────────────────────────────────────────────────────────────────────────────────

/**
 * A fonte da mestre para uma estratégia — e SÓ a dela. Antes o webhook mandava para a mestre do
 * Sensei tudo o que fosse ouro/BTC e não fosse GoldKiller (`execTarget`), incluindo alertas sem
 * estratégia reconhecida.
 */
export function fonteDaMestreParaEstrategia(estrategia: string | null): ChaveWebhook | null {
  if (!estrategia) return null
  return FONTE_DA_MESTRE[estrategia] ?? null
}

/**
 * Alvo do executor legado (`processMtmcopyWebhookSignal`, contas MT5 provider) por estratégia.
 * `null` = esta estratégia não tem executor legado — não se escolhe um por omissão.
 */
export function alvoLegadoDaEstrategia(estrategia: string | null, classe: string | null): 'sensei' | 'goldkiller' | 'forex' | null {
  if (estrategia === 'Goldkiller') return classe === 'gold_btc' ? 'goldkiller' : null
  if (estrategia === 'sensei') return classe === 'forex' ? 'forex' : classe === 'gold_btc' ? 'sensei' : null
  return null
}
