/**
 * MTM AUTO EDGE PELO pv-relay — a regra de cada pedido, pura (sem base, sem rede).
 * Testes em __tests__/edge-pv.check.ts. O cano está em app/api/telegram/primeverse-exec/route.ts.
 *
 * 07/10: o dono religou o Edge. O relay (VPS, `pv-relay`) lê o canal do trader `fxedge` e manda à rota
 * cada SETUP (só se mostra), cada ENTRY HIT (executa) e cada seguimento (cancel/close/BE/TP/SL). A
 * execução passa a ser a das mestres: `encaminharSinalParaMestre` com a fonte `edge` → estratégia
 * `mtm-auto-edge` → a conta-mestre SIM dela e quem a segue. Um trader que não seja o do Edge nunca
 * executa (a tabela trader → estratégia é a de lib/mtmfunded/estrategias-sinais/calculo.ts, e só a
 * Edge está viva).
 *
 * ATRASO — a regra que não se dobra: uma entrada ou um seguimento com mais de 3 minutos NÃO executa.
 * O relay, ao voltar depois de parado, relê o canal e despeja de seguida as mensagens antigas; um
 * ENTRY HIT de há dois dias aberto agora é uma trade que ninguém deu. Como se sabe a idade:
 *  1. pela DATA da mensagem do Telegram (`msg_date`/`date`) ou pela hora em que o relay a recebeu
 *     (`received_at`/`receivedAt`), quando o pedido as traz → > 180 s = atrasado;
 *  2. o relay em produção (07/10) NÃO manda data nenhuma. Sem data, a frescura tem de ser PROVADA,
 *     senão é atrasado:
 *       · o pedido não pode vir numa RAJADA (outro pedido do relay nos últimos 20 s — é o despejo da
 *         recuperação; ao vivo as mensagens deste trader chegam espaçadas);
 *       · um ENTRY HIT exige ainda o seu SETUP visto AO VIVO (fora de rajada) nas últimas 48 h — o
 *         primeiro pedido de uma recuperação não tem setup visto e cai aqui;
 *       · e o preço da casa (≤ 15 s) tem de estar junto da entrada (≤ 25% da distância ao stop):
 *         ENTRY HIT quer dizer «o preço está na entrada AGORA».
 *
 * DUPLICADOS: pelo id da mensagem (quando vem) e pela chave do setup — o mesmo ENTRY HIT do mesmo
 * setup só conta uma vez. Atrasados e repetidos respondem `ok` para o relay avançar.
 *
 * 26/10 — OS 2 TOP TRADERS (decisão do dono: «Edge continua individual, ativando sinais pela fonte PV
 * seguindo sempre os 2 top traders do Telegram da PrimeVerse»). O trader deixa de ser fixo (fxedge):
 *  · o relay lê o canal inteiro e faz o RANKING por pips líquidos dos resultados anunciados pelos
 *    próprios traders (TRADE CLOSED / SL HIT) numa janela móvel (14 dias por omissão) — ver
 *    services/pv-relay/relay.py › ranking;
 *  · manda o ranking à rota (`kind: 'ranking'`), que o guarda em site_settings.pv_top_traders;
 *  · um ENTRY HIT só executa se o trader estiver nos 2 primeiros desse ranking E o ranking for
 *    recente (≤ 36 h — um ranking velho quer dizer relay morto, e aí ninguém executa);
 *  · os seguimentos (cancel/close/BE/SL) de uma entrada que JÁ abriu continuam a ser seguidos mesmo
 *    que o trader saia do top entretanto — fechar o que se abriu nunca depende do ranking.
 */

export const ATRASO_MAX_S = 180
export const RAJADA_S = 20
export const PRECO_MAX_IDADE_S = 15
export const TOLERANCIA_ENTRADA_DO_RISCO = 0.25

export type KindPv = 'setup' | 'entry_hit' | 'cancel' | 'close' | 'tp_hit' | 'sl_be' | 'sl_hit'
export const KINDS_PV: readonly KindPv[] = ['setup', 'entry_hit', 'cancel', 'close', 'tp_hit', 'sl_be', 'sl_hit']

/** A estratégia que o pedido pode tocar. Só a Edge executa; o resto é recusado aqui. */
export const SLUG_EDGE = 'mtm-auto-edge'

export const TOP_N = 2
export const CHAVE_TOP = 'pv_top_traders'
export const TOP_VALIDADE_H = 36

export interface TraderNoTop { trader: string; pips: number; trades: number }
export interface TopTraders { top: TraderNoTop[]; janelaDias: number; em: string }

const normTrader = (t: unknown): string => String(t ?? '').trim().toLowerCase().replace(/^@/, '')

/** O ranking guardado (site_settings.pv_top_traders) ou o que o relay mandou — validado. */
export function lerTopTraders(v: unknown): TopTraders | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const lista = Array.isArray(o.top) ? o.top : null
  if (!lista) return null
  const top: TraderNoTop[] = []
  for (const x of lista) {
    const r = (x && typeof x === 'object' ? x : { trader: x }) as Record<string, unknown>
    const trader = normTrader(r.trader)
    if (!trader || !/^[a-z0-9_.\-]{2,40}$/.test(trader) || top.some((t) => t.trader === trader)) continue
    top.push({ trader, pips: Number(r.pips) || 0, trades: Math.max(0, Math.round(Number(r.trades) || 0)) })
  }
  const em = String(o.em ?? o.atualizado_em ?? '')
  if (!Number.isFinite(Date.parse(em))) return null
  return { top, janelaDias: Math.max(1, Math.round(Number(o.janelaDias ?? o.janela_dias) || 14)), em }
}

/** Os traders que a Edge segue AGORA (vazio = ranking ausente ou velho → ninguém executa). */
export function tradersDaEdge(t: TopTraders | null, agora: Date): string[] {
  if (!t) return []
  if (agora.getTime() - Date.parse(t.em) > TOP_VALIDADE_H * 3600_000) return []
  return t.top.slice(0, TOP_N).map((x) => x.trader)
}

/** A estratégia que um SETUP/ENTRY HIT deste trader toca: a Edge, se ele estiver no top; senão nenhuma. */
export function estrategiaDoTraderPv(trader: unknown, t: TopTraders | null, agora: Date): string | null {
  const n = normTrader(trader)
  return n && tradersDaEdge(t, agora).includes(n) ? SLUG_EDGE : null
}

/** A data da mensagem, se o relay a mandar (ISO ou epoch em s/ms). */
export function dataDoPedido(b: Record<string, unknown>): Date | null {
  for (const k of ['msg_date', 'date', 'message_date', 'received_at', 'receivedAt']) {
    const v = b[k]
    if (v == null || v === '') continue
    const n = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v))
    if (Number.isFinite(n) && n > 0) return new Date(n)
  }
  return null
}

/** A chave de deduplicação do pedido (null = não deduplica por chave). */
export function chaveDoPedido(p: { kind: KindPv; setupMsgId: string | null; symbol: string; direcao: string; entrada: number | null; sl: number | null; level?: number | null }): string | null {
  if (p.kind === 'setup') return `setup:${p.symbol}:${p.direcao}:${p.entrada ?? '-'}:${p.sl ?? '-'}`
  if (!p.setupMsgId) return null
  if (p.kind === 'entry_hit') return `entry:${p.setupMsgId}`
  return `${p.kind}:${p.setupMsgId}:${p.level ?? ''}`
}

export interface EntradaDecisaoPv {
  kind: KindPv
  /** slug da estratégia do trader (lib/mtmfunded/estrategias-sinais/calculo.ts › estrategiaDoTrader), ou null */
  estrategia: string | null
  /** a estratégia ainda abre sinais novos (só a Edge) */
  viva: boolean
  agora: Date
  dataMensagem: Date | null
  /** já existe um pedido com o mesmo id de mensagem ou a mesma chave */
  repetido: boolean
  /** outro pedido do relay nos últimos RAJADA_S segundos */
  rajada: boolean
  /** só ENTRY HIT: o setup deste sinal foi visto ao vivo (fora de rajada) nas últimas 48 h */
  setupVistoAoVivo: boolean
  /** só ENTRY HIT */
  entrada: number | null
  sl: number | null
  /** preço da casa no símbolo (meio do bid/ask) e a sua idade em segundos */
  preco: { valor: number; idadeS: number } | null
}

export type AccaoPv = 'publicar' | 'executar' | 'seguir' | 'atrasado' | 'repetido' | 'ignorar'

export interface DecisaoPv {
  accao: AccaoPv
  motivo: string
  /** o slug que a execução pode tocar — só a Edge */
  estrategia?: string
}

const ATRASADO = 'atrasado — não executado'

export function decidirPedidoPv(e: EntradaDecisaoPv): DecisaoPv {
  if (e.repetido) return { accao: 'repetido', motivo: 'repetido — já tratado (mesma mensagem ou mesmo setup)' }
  if (!e.estrategia) return { accao: 'ignorar', motivo: 'trader sem estratégia (fica fora)' }

  // 1) idade pela data, quando há
  if (e.dataMensagem) {
    const idade = (e.agora.getTime() - e.dataMensagem.getTime()) / 1000
    if (idade > ATRASO_MAX_S) return { accao: 'atrasado', motivo: `${ATRASADO} (mensagem com ${Math.round(idade)} s)` }
  } else if (e.rajada) {
    // 2) sem data: a rajada é o despejo da recuperação
    return { accao: 'atrasado', motivo: `${ATRASADO} (sem data e em rajada — recuperação do relay)` }
  }

  if (e.kind === 'setup') {
    return e.viva ? { accao: 'publicar', motivo: 'setup: só se mostra no chat Edge/Wolf/King' } : { accao: 'ignorar', motivo: 'estratégia já não publica sinais novos' }
  }

  if (e.kind === 'entry_hit') {
    if (!e.viva || e.estrategia !== SLUG_EDGE) return { accao: 'ignorar', motivo: 'só a MTM Auto Edge executa' }
    if (!e.dataMensagem) {
      if (!e.setupVistoAoVivo) return { accao: 'atrasado', motivo: `${ATRASADO} (sem data e o setup não foi visto ao vivo)` }
      if (e.entrada == null || e.sl == null || !(Math.abs(e.entrada - e.sl) > 0)) return { accao: 'atrasado', motivo: `${ATRASADO} (sem data e sem stop para provar o preço)` }
      if (!e.preco || e.preco.idadeS > PRECO_MAX_IDADE_S) return { accao: 'atrasado', motivo: `${ATRASADO} (sem data e sem preço fresco da casa)` }
      const dist = Math.abs(e.preco.valor - e.entrada)
      const tol = Math.abs(e.entrada - e.sl) * TOLERANCIA_ENTRADA_DO_RISCO
      if (dist > tol) return { accao: 'atrasado', motivo: `${ATRASADO} (sem data e o preço ${e.preco.valor} já está longe da entrada ${e.entrada})` }
    }
    return { accao: 'executar', motivo: 'entrada fresca → mestre Edge', estrategia: SLUG_EDGE }
  }

  // seguimentos (cancel/close/sl_be/tp_hit/sl_hit): fechar é sempre permitido também às que já não abrem
  return { accao: 'seguir', motivo: `seguimento ${e.kind}`, estrategia: e.estrategia }
}
