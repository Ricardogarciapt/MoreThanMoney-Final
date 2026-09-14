/**
 * PROVA EM PIPS — o que os sinais fizeram, medido onde foram mesmo executados.
 *
 * Substitui a linha "675 trades · 63% win rate · +7.060€", que estava congelada em 30/06 e falava
 * em euros. Euros não são comparáveis: o mesmo sinal vale ~8 $ a quem opera 0,01 lote e ~800 $ a
 * quem opera 1. Pips e percentagem são iguais para toda a gente; o dinheiro entra só como exemplo.
 *
 * ── Porque é que isto foi reescrito ────────────────────────────────────────────────────────────
 * A primeira versão contava linhas de `mtmcopy_signal_tracking` e dava 11% de acerto em 30 dias.
 * Não era o desempenho: era o instrumento. Aquela tabela segue IDEIAS publicadas — inclui sinais
 * que nunca abriram em conta nenhuma, e fecha em "Stop loss" com o prejuízo inteiro trades que já
 * tinham levado TP1 e TP2 (23 casos em 30 dias). Medir assim é contar a bola que bateu no poste
 * como golo sofrido.
 *
 * A medição certa já existia no desenho do sistema: a CONTA-ESPELHO abre TODOS os sinais
 * publicados, a 0,03 lotes, precisamente para haver parciais a sério e métricas sem escolha a
 * dedo. Por isso a prova passa a ser lida do histórico de negócios dessa conta no broker:
 *
 *   deals do broker → agrupados por posição → entrada média + CADA saída parcial com o seu peso
 *
 * É assim que os parciais contam: uma posição de 0,03 que fecha 0,01 no TP1, 0,01 no TP2 e 0,01
 * no stop vale a média ponderada dos três, não o stop.
 *
 * As ideias continuam a ser medidas — mas à parte, com esse nome, e nunca somadas às executadas.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { lerHistorico, type MetaApiDeal } from '@/lib/mtmcopy/metaapi'
import { pipSizeForSymbol, unitFor } from '@/lib/mtmcopy/trade-outcome'

const KEY = 'pips_proof'

/**
 * A conta-espelho «All tap to trade Signals» (PU Prime DEMO) — abre todos os sinais publicados.
 * É demo de propósito: serve para medir os sinais, não para render dinheiro, e isso é dito a
 * quem lê os números.
 */
const CONTA_ESPELHO = process.env.METAAPI_T2T_MIRROR_ACCOUNT_ID?.trim() || '6014b4fc-3ed3-458a-8cea-7099cf29b51f'
/** Lote da conta-espelho — é o que transforma os pips em dólares nos exemplos. */
const LOTE_ESPELHO = Number(process.env.T2T_MIRROR_LOT) || 0.03

/** Símbolo do broker → símbolo limpo ("XAUUSD.s" → "XAUUSD"). */
function limparSimbolo(s: string | undefined | null): string {
  return (s ?? '').toUpperCase().replace(/\.[A-Z]+$/, '')
}

export interface TradeExecutada {
  positionId: string
  symbol: string
  /** Que estratégia gerou a trade. Só existe quando a leitura vem do registo de saídas. */
  fonte?: string | null
  /** Pips realizados, já com o peso de cada saída parcial. */
  pips: number
  /** Lucro/prejuízo em dinheiro na conta-espelho, ao lote dela. */
  dinheiro: number
  /** Quantas saídas teve — 1 = fechou de uma vez; 2+ = houve parciais. */
  saidas: number
  fechadaEm: string | null
}

export interface ProvaExecutada {
  trades: number
  winRatePct: number
  /** Soma de pips das trades cujo símbolo conta em pips (ouro, forex, metais). */
  pips: number
  pipsPorTrade: number
  /** Quantas trades tiveram saídas parciais — a diferença entre medir bem e medir mal. */
  comParciais: number
  ouro: { trades: number; winRatePct: number; pips: number } | null
  porSimbolo: Array<{ symbol: string; trades: number; winRatePct: number; pips: number }>
  /** Por fonte de sinal — só existe quando a leitura vem do registo de saídas do motor. */
  porFonte?: Array<{ chave: string; trades: number; winRatePct: number; pips: number }>
  /** Posições ainda abertas na janela — ficam de fora até fecharem. */
  aindaAbertas: number
}

export interface ProvaIdeias {
  ideias: number
  /** Ideias cuja entrada chegou a ser tocada pelo preço. NÃO quer dizer que abriu ordem em conta
   *  nenhuma — para isso existe `executado`, que é o que se publica. */
  entradaTocada: number
  winRatePct: number
  pips: number
  /** Linhas rejeitadas por não serem trade ou por terem dados impossíveis. */
  ignoradas: number
}

export interface PipsProof {
  dias: number
  /** O instante da trade mais antiga da amostra. A janela pedida pode ser maior do que a
   *  operação real da conta — e o texto tem de dizer o período que os dados cobrem, não o que
   *  foi pedido. */
  desdeReal?: string | null
  /** O que foi mesmo executado, com parciais contados. É isto que se publica. */
  executado: ProvaExecutada
  /** O que as ideias publicadas fizeram. Contexto interno — nunca se mistura com o de cima. */
  ideias: ProvaIdeias | null
  loteEspelho: number
  asOf: string
  /** Falha na leitura do broker → `erro` preenchido e nada se publica. */
  erro?: string
}

/**
 * O que é NOSSO.
 *
 * O destaque só se constrói sobre o sistema e as fontes MTM — Premium, Sensei, GoldKiller, MTM
 * Scanner, Aurum Flow e os perpétuos da casa. As fontes de terceiros continuam a ser medidas e
 * a entrar no total (esconder metade do que se publica não seria medir, seria escolher), mas não
 * servem de montra: vender o acerto de outra pessoa é vender uma coisa que não controlamos.
 */
const FONTES_MTM = new Set(['premium', 'sensei', 'goldkiller', 'mtmscanner', 'goldenmoves', 'perps'])
// `goldenmoves` fica só como chave HISTÓRICA: há linhas de 2026-08-25 gravadas com ela.
export function fonteEhMtm(chave: string | null | undefined): boolean {
  return FONTES_MTM.has(String(chave ?? '').toLowerCase())
}
/** O nome legível de cada fonte — o mesmo dos flyers semanais e das provas. */
export const NOME_FONTE: Record<string, string> = {
  premium: 'Premium', sensei: 'Sensei', goldkiller: 'GoldKiller',
  mtmscanner: 'MTM Scanner', goldenmoves: 'Aurum Flow', perps: 'Perpétuos',
}

/** Tecto de plausibilidade por unidade. Acima disto é erro de dados, não uma trade. */
function tectoDePips(symbol: string): number {
  const p = pipSizeForSymbol(symbol)
  if (p === 0.1 || p === 0.01) return 3000
  if (p === 0.0001) return 1500
  return 60_000
}

/**
 * Lê o histórico de negócios da conta-espelho e reconstrói cada posição.
 *
 * Uma posição pode ter várias entradas (raro) e VÁRIAS SAÍDAS (o caso normal aqui: 0,01 no TP1,
 * 0,01 no TP2, 0,01 no fim). O resultado é a média das saídas ponderada pelo volume de cada uma —
 * é literalmente o que a conta ganhou ou perdeu.
 */
export async function computeExecutadas(
  dias = 30,
): Promise<{ trades: TradeExecutada[]; abertas: number; desdeReal: string | null; erro?: string }> {
  const desde = new Date(Date.now() - dias * 86_400_000)

  // `lerHistorico` devolve null quando NÃO CONSEGUIU LER, e [] quando a conta não negociou. A
  // diferença é tudo: durante semanas isto deu "0 trades" com 254 negócios na conta, porque o
  // caminho antigo (SDK, três sincronizações) falhava em silêncio e o falhanço era indistinguível
  // de uma conta parada. Já não há segunda tentativa nem espera de 1,5 s a fingir que resolve.
  const deals = await lerHistorico(CONTA_ESPELHO, desde)
  if (deals == null) return { trades: [], abertas: 0, desdeReal: null, erro: 'não foi possível ler o histórico do broker' }
  if (!deals.length) return { trades: [], abertas: 0, desdeReal: null }

  interface Posicao {
    symbol: string
    dir: 1 | -1
    fonte: string | null
    entradas: Array<{ price: number; volume: number }>
    saidas: Array<{ price: number; volume: number; profit: number; time: string | null }>
  }
  const posicoes = new Map<string, Posicao>()
  // O período REAL coberto pelos dados. A conta-espelho não existe há 30 dias; dizer "nos últimos
  // 30 dias" sobre 36 horas de operação seria exagerar a amostra, que é o oposto do que isto veio
  // corrigir.
  let maisAntigo: number | null = null

  for (const d of deals) {
    if (!d.positionId) continue // depósitos e ajustes de saldo não são trades
    const quando = d.time ? new Date(d.time).getTime() : null
    if (quando && Number.isFinite(quando)) maisAntigo = maisAntigo == null ? quando : Math.min(maisAntigo, quando)
    const p =
      posicoes.get(d.positionId) ??
      ({ symbol: limparSimbolo(d.symbol), dir: 1, fonte: null, entradas: [], saidas: [] } as Posicao)
    if (!p.symbol) p.symbol = limparSimbolo(d.symbol)
    if (!p.fonte) p.fonte = fonteDoComentario(d.comment)
    const volume = Number(d.volume) || 0
    const price = Number(d.price) || 0
    if (d.entryType === 'DEAL_ENTRY_IN') {
      p.dir = d.type === 'DEAL_TYPE_BUY' ? 1 : -1
      p.entradas.push({ price, volume })
    } else if (d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_OUT_BY') {
      const t = d.time ? new Date(d.time).toISOString() : null
      p.saidas.push({ price, volume, profit: Number(d.profit) || 0, time: t })
    }
    posicoes.set(d.positionId, p)
  }

  const trades: TradeExecutada[] = []
  let abertas = 0
  for (const [positionId, p] of posicoes) {
    const volEntrada = p.entradas.reduce((a, b) => a + b.volume, 0)
    const volSaida = p.saidas.reduce((a, b) => a + b.volume, 0)
    // Só entram posições FECHADAS. Uma posição a meio ainda pode acabar de qualquer maneira, e
    // contá-la agora seria escolher o momento que mais convém.
    if (!volEntrada || volSaida < volEntrada - 1e-9) { abertas++; continue }

    const entrada = p.entradas.reduce((a, b) => a + b.price * b.volume, 0) / volEntrada
    const tamanhoPip = pipSizeForSymbol(p.symbol)
    let pips = 0
    for (const s of p.saidas) {
      pips += ((s.price - entrada) * p.dir / tamanhoPip) * (s.volume / volEntrada)
    }
    pips = Math.round(pips * 10) / 10
    if (!Number.isFinite(pips) || Math.abs(pips) > tectoDePips(p.symbol)) continue

    trades.push({
      positionId,
      symbol: p.symbol,
      fonte: p.fonte,
      pips,
      dinheiro: Math.round(p.saidas.reduce((a, b) => a + b.profit, 0) * 100) / 100,
      saidas: p.saidas.length,
      fechadaEm: p.saidas.map((s) => s.time).filter(Boolean).sort().pop() ?? null,
    })
  }
  return { trades, abertas, desdeReal: maisAntigo ? new Date(maisAntigo).toISOString() : null }
}

/**
 * A estratégia que abriu a trade, lida do comentário da ordem ("T2T-premium" → "premium").
 *
 * Sem isto, a atribuição por fonte só existia quando a leitura vinha do registo do motor — e o
 * destaque, que só pode falar de fontes MTM, caía sempre para o símbolo. O comentário é escrito
 * pelo próprio sistema no momento da ordem; é a etiqueta mais fiável que existe na conta.
 */
function fonteDoComentario(comment: string | undefined | null): string | null {
  const c = String(comment ?? '').trim().toLowerCase()
  if (!c) return null
  const m = c.match(/^t2t[-_ ]([a-z0-9]+)/)
  if (m) return m[1]
  for (const chave of FONTES_MTM) if (c.includes(chave)) return chave
  return null
}

/** As ideias publicadas — medidas à parte, e com o mesmo cuidado. */
async function computeIdeias(dias: number): Promise<ProvaIdeias | null> {
  try {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
    const { data } = await getSupabaseAdmin()
      .from('mtmcopy_signal_tracking')
      .select('symbol, result_pips, outcome_label, entry_hit_at')
      .eq('status', 'closed')
      .gte('closed_at', desde)
      .limit(5000)
    const linhas = (data ?? []) as Array<{
      symbol: string | null
      result_pips: number | null
      outcome_label: string | null
      entry_hit_at: string | null
    }>
    let ignoradas = 0
    const validas: Array<{ symbol: string; pips: number; abriu: boolean }> = []
    for (const l of linhas) {
      if ((l.outcome_label ?? '').toLowerCase().includes('descartada')) { ignoradas++; continue }
      const pips = typeof l.result_pips === 'number' ? l.result_pips : null
      if (pips == null || !Number.isFinite(pips) || Math.abs(pips) > tectoDePips(l.symbol ?? '')) { ignoradas++; continue }
      validas.push({ symbol: l.symbol ?? '', pips, abriu: Boolean(l.entry_hit_at) })
    }
    if (!validas.length) return null
    const emPips = validas.filter((v) => unitFor(v.symbol) === 'pips')
    return {
      ideias: validas.length,
      entradaTocada: validas.filter((v) => v.abriu).length,
      winRatePct: Math.round((validas.filter((v) => v.pips > 0).length / validas.length) * 1000) / 10,
      pips: Math.round(emPips.reduce((a, b) => a + b.pips, 0) * 10) / 10,
      ignoradas,
    }
  } catch {
    return null
  }
}

/**
 * As saídas registadas pelo motor (`mtmcopy_trade_exits`) — a fonte que não depende de ninguém.
 *
 * O histórico do broker é a verdade última, mas a leitura dele a partir das funções serverless é
 * frágil (o SDK devolve vazio em lambda frio; a ingestão de histórico esteve um mês parada por
 * causa disso). Por isso o motor grava cada saída no momento em que a faz. Uma posição vale a
 * soma de fração×pips das suas saídas — que é exatamente contar os parciais.
 */
async function computeExecutadasDoRegisto(dias: number): Promise<{ trades: TradeExecutada[]; abertas: number }> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
  const { data } = await getSupabaseAdmin()
    .from('mtmcopy_trade_exits')
    .select('position_id, symbol, source_key, exit_level, fraccao, pips, fechou_tudo, created_at')
    .gte('created_at', desde)
    .limit(5000)

  const linhas = (data ?? []) as Array<{
    position_id: string
    symbol: string
    source_key: string | null
    exit_level: number
    fraccao: number | null
    pips: number | null
    fechou_tudo: boolean
    created_at: string
  }>
  const porPosicao = new Map<string, typeof linhas>()
  for (const l of linhas) porPosicao.set(l.position_id, [...(porPosicao.get(l.position_id) ?? []), l])

  const trades: TradeExecutada[] = []
  let abertas = 0
  for (const [positionId, saidas] of porPosicao) {
    // Só conta quem já acabou: sem a saída final, o resultado ainda não existe.
    if (!saidas.some((x) => x.fechou_tudo)) { abertas++; continue }
    const symbol = saidas[0].symbol
    let pips = 0
    for (const x of saidas) pips += (Number(x.fraccao) || 0) * (Number(x.pips) || 0)
    pips = Math.round(pips * 10) / 10
    if (!Number.isFinite(pips) || Math.abs(pips) > tectoDePips(symbol)) continue
    trades.push({
      positionId,
      symbol,
      fonte: saidas[0].source_key ?? null,
      pips,
      dinheiro: 0, // o dinheiro depende do lote de cada conta — aqui só se mede o movimento
      saidas: saidas.length,
      fechadaEm: saidas.map((x) => x.created_at).sort().pop() ?? null,
    })
  }
  return { trades, abertas }
}

export async function computePipsProof(dias = 30): Promise<PipsProof> {
  // Primeiro o broker (verdade última). Se não responder, o registo do motor — que tem a mesma
  // informação, gravada no instante de cada saída.
  let { trades, abertas, desdeReal, erro } = await computeExecutadas(dias)
  if (!trades.length) {
    const registo = await computeExecutadasDoRegisto(dias)
    if (registo.trades.length) {
      trades = registo.trades
      abertas = registo.abertas
      desdeReal = registo.trades.map((t) => t.fechadaEm).filter(Boolean).sort()[0] ?? null
      erro = undefined
    }
  }
  const emPips = trades.filter((t) => unitFor(t.symbol) === 'pips')
  const ouro = trades.filter((t) => pipSizeForSymbol(t.symbol) === 0.1)
  const soma = (xs: TradeExecutada[]) => Math.round(xs.reduce((a, b) => a + b.pips, 0) * 10) / 10
  const win = (xs: TradeExecutada[]) =>
    xs.length ? Math.round((xs.filter((x) => x.pips > 0).length / xs.length) * 1000) / 10 : 0

  const porSimbolo = new Map<string, TradeExecutada[]>()
  for (const t of trades) porSimbolo.set(t.symbol, [...(porSimbolo.get(t.symbol) ?? []), t])

  const porFonte = new Map<string, TradeExecutada[]>()
  for (const t of trades) if (t.fonte) porFonte.set(t.fonte, [...(porFonte.get(t.fonte) ?? []), t])

  return {
    dias,
    desdeReal,
    executado: {
      trades: trades.length,
      winRatePct: win(trades),
      pips: soma(emPips),
      pipsPorTrade: emPips.length ? Math.round((soma(emPips) / emPips.length) * 10) / 10 : 0,
      comParciais: trades.filter((t) => t.saidas > 1).length,
      ouro: ouro.length ? { trades: ouro.length, winRatePct: win(ouro), pips: soma(ouro) } : null,
      porSimbolo: [...porSimbolo.entries()]
        .map(([symbol, xs]) => ({ symbol, trades: xs.length, winRatePct: win(xs), pips: soma(xs) }))
        .sort((a, b) => b.trades - a.trades),
      porFonte: porFonte.size
        ? [...porFonte.entries()]
            .map(([chave, xs]) => ({ chave, trades: xs.length, winRatePct: win(xs), pips: soma(xs) }))
            .sort((a, b) => b.pips - a.pips)
        : undefined,
      aindaAbertas: abertas,
    },
    ideias: await computeIdeias(dias),
    loteEspelho: LOTE_ESPELHO,
    asOf: new Date().toISOString().slice(0, 10),
    ...(erro ? { erro } : {}),
  }
}

/** Grava o cálculo do dia. Corre no cron diário; o conteúdo lê sempre daqui. */
export async function savePipsProof(dias = 30): Promise<PipsProof> {
  const p = await computePipsProof(dias)
  // Uma leitura falhada não apaga a última boa: publicar zero seria mentir por omissão.
  if (p.erro && !p.executado.trades) return p
  await getSupabaseAdmin().from('site_settings').upsert(
    {
      key: KEY,
      value: p as unknown as Record<string, unknown>,
      description: 'Prova em pips/% da conta-espelho (parciais contados) — funil e bom-dia',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  return p
}

/** Lê o último cálculo gravado. Devolve null se não houver — nunca inventa. */
export async function getPipsProof(): Promise<PipsProof | null> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', KEY).maybeSingle()
    const v = data?.value as PipsProof | null
    return v && v.executado && typeof v.executado.trades === 'number' ? v : null
  } catch {
    return null
  }
}

/** Valor de 1 pip de OURO por tamanho de lote, em dólares (contrato de 100 oz). */
export const VALOR_PIP_OURO: Record<'0.01' | '0.1' | '1', number> = { '0.01': 0.1, '0.1': 1, '1': 10 }

/** A ressalva que acompanha SEMPRE qualquer número. Não é opcional. */
export const RESSALVA_LEGAL =
  'Medido numa conta de demonstração que abre todos os sinais publicados, sem escolha a dedo. ' +
  'Valores brutos, sem spread, comissões nem swap, e antes de impostos. ' +
  'Resultados passados não garantem resultados futuros. Operar com produtos alavancados tem risco ' +
  'elevado de perda. Isto não é aconselhamento financeiro.'

/** Há amostra que chegue para publicar? Abaixo disto é ruído com ar de prova. */
export function publicavel(p: PipsProof | null): p is PipsProof {
  return Boolean(p && p.executado.trades >= 20)
}

/**
 * A linha de prova: pips, percentagem e o que isso vale por lote.
 *
 * O exemplo em dinheiro usa o OURO porque é onde 1 pip vale sempre o mesmo (10 $ por lote).
 * Misturar símbolos num só número em dinheiro seria repetir o erro que isto veio corrigir.
 */
/**
 * Como se descreve a janela — pelo que os dados cobrem, não pelo que se pediu.
 *
 * A conta-espelho começou a operar a 25/08. Um pedido de 30 dias devolve os dados desse dia em
 * diante, e escrever "nos últimos 30 dias" sobre 36 horas de operação inflaciona a amostra aos
 * olhos de quem lê. Quando o período real é bem menor do que o pedido, diz-se o período real.
 */
function periodoReal(p: PipsProof): string {
  const inicio = p.desdeReal ? new Date(p.desdeReal) : null
  if (!inicio || Number.isNaN(inicio.getTime())) return `dos últimos ${p.dias} dias`
  const horas = (Date.now() - inicio.getTime()) / 3_600_000
  if (horas >= p.dias * 24 * 0.8) return `dos últimos ${p.dias} dias`
  if (horas < 48) return `das últimas ${Math.max(1, Math.round(horas))} horas de operação`
  return `dos últimos ${Math.round(horas / 24)} dias de operação`
}

/**
 * A prova que se pode dizer A UM LEAD, numa conversa privada.
 *
 * Difere da `linhaPips` num ponto que importa: **não cita taxa de acerto em amostras pequenas**.
 * A 01/09 a janela de 5 dias tinha 9 trades e 100% de acerto — verdade aritmética, e uma frase
 * que um vendedor não pode dizer: lida por quem está a decidir se entrega dinheiro, "100% de
 * acerto" é uma promessa, não uma medição. Abaixo de 30 trades falam-se pips e período, e diz-se
 * que a amostra é curta.
 *
 * Devolve `null` quando não há nada medido. Nesse caso o bot fala da comunidade e do produto e
 * NÃO inventa números — que foi exactamente o que aconteceu enquanto isto não existia: sem
 * factos na mão, o modelo foi buscar o "+7.060€" antigo, que está proibido desde 26/08.
 */
export const MINIMO_PARA_TAXA = 30

export function provaParaLead(p: PipsProof | null | undefined): string | null {
  if (!p || p.erro) return null
  const e = p.executado
  if (!e?.trades) return null
  const nf = new Intl.NumberFormat('pt-PT')
  const sinal = (n: number) => (n >= 0 ? `+${nf.format(Math.round(n))}` : `−${nf.format(Math.abs(Math.round(n)))}`)

  const partes = [`${periodoReal(p)}: ${e.trades} trades executadas · ${sinal(e.pips)} pips`]
  if (e.trades >= MINIMO_PARA_TAXA) partes.push(`${e.winRatePct}% de acerto`)
  else partes.push('amostra curta — não cites percentagem de acerto')

  if (e.ouro?.pips) {
    const usd = (n: number) => `${n >= 0 ? '+' : '−'}${nf.format(Math.abs(Math.round(n)))} $`
    partes.push(
      `em ouro ${sinal(e.ouro.pips)} pips, que por lote dá ` +
      `0,01 → ${usd(e.ouro.pips * VALOR_PIP_OURO['0.01'])} · ` +
      `0,1 → ${usd(e.ouro.pips * VALOR_PIP_OURO['0.1'])} · ` +
      `1,0 → ${usd(e.ouro.pips * VALOR_PIP_OURO['1'])} (bruto)`,
    )
  }
  return partes.join(' · ')
}

export function linhaPips(p: PipsProof, opts?: { comExemplos?: boolean }): string {
  const nf = new Intl.NumberFormat('pt-PT')
  const sinal = (n: number) => (n >= 0 ? `+${nf.format(Math.round(n))}` : `−${nf.format(Math.abs(Math.round(n)))}`)
  const e = p.executado
  const parciais = e.comParciais ? ` (${e.comParciais} com saídas parciais)` : ''
  const base = `No total ${periodoReal(p)}: ${e.trades} trades executadas${parciais} · ${e.winRatePct}% de acerto · ${sinal(e.pips)} pips`
  if (opts?.comExemplos === false || !e.ouro) return base
  const g = e.ouro.pips
  const usd = (n: number) => `${n >= 0 ? '+' : '−'}${nf.format(Math.abs(Math.round(n)))} $`
  return (
    `${base}\n` +
    `Só em ouro: ${e.ouro.trades} trades, ${e.ouro.winRatePct}% de acerto, ${sinal(g)} pips. ` +
    `O que isso vale depende do teu lote — 0,01 → ${usd(g * VALOR_PIP_OURO['0.01'])} · ` +
    `0,1 → ${usd(g * VALOR_PIP_OURO['0.1'])} · 1,0 → ${usd(g * VALOR_PIP_OURO['1'])}.`
  )
}

/**
 * O melhor facto VERDADEIRO que os números permitem dizer.
 *
 * Não é maquilhagem: é escolher, entre coisas que aconteceram mesmo, aquela que melhor descreve
 * o trabalho — e publicá-la ao lado do total, nunca em vez dele. Um destaque sem total é uma
 * meia-verdade; um total sem destaque esconde o que correu bem. Vão os dois ou não vai nenhum.
 *
 * Devolve null quando não há nada de positivo a dizer com verdade. Nesse caso publica-se só o
 * total: um mês mau dito com clareza vale mais do que um mês mau disfarçado.
 */
export function destaquePositivo(p: PipsProof): string | null {
  const e = p.executado
  if (!e.trades) return null
  const nf = new Intl.NumberFormat('pt-PT')
  const candidatos: Array<{ peso: number; texto: string }> = []

  // Só o que é NOSSO. Um destaque construído sobre o sinal de um terceiro estaria a vender
  // trabalho que não é nosso — e a expor-nos ao dia em que esse terceiro desapareça.
  // Quando há registo por fonte usa-se a fonte (é a divisão certa); senão, cai-se no símbolo.
  const fontesNossas = (e.porFonte ?? []).filter((f) => fonteEhMtm(f.chave))
  for (const f of fontesNossas) {
    if (f.trades >= 5 && f.winRatePct >= 55) {
      candidatos.push({ peso: f.winRatePct + 15, texto: `${NOME_FONTE[f.chave] ?? f.chave} fechou ${f.winRatePct}% das ${f.trades} trades no verde.` })
    }
    if (f.trades >= 4 && f.pips > 0) {
      candidatos.push({ peso: 70 + Math.min(f.pips / 10, 25), texto: `${NOME_FONTE[f.chave] ?? f.chave} somou +${nf.format(Math.round(f.pips))} pips em ${f.trades} trades.` })
    }
  }
  const nossos = e.porSimbolo

  // 1) Símbolo com melhor taxa de acerto (amostra mínima para não celebrar duas trades).
  //    E só entra se a taxa for POSITIVA a sério: o destaque existe para dizer o que correu bem.
  const porTaxa = nossos.filter((s) => s.trades >= 8 && s.winRatePct >= 55).sort((a, b) => b.winRatePct - a.winRatePct)[0]
  if (porTaxa) {
    candidatos.push({
      peso: porTaxa.winRatePct,
      texto: `${porTaxa.symbol} fechou ${porTaxa.winRatePct}% das ${porTaxa.trades} trades no verde.`,
    })
  }

  // 2) Símbolo com mais pips GANHOS — nunca perdidos.
  const porPips = nossos.filter((s) => s.pips > 0 && s.trades >= 5).sort((a, b) => b.pips - a.pips)[0]
  if (porPips) {
    candidatos.push({
      peso: 60 + Math.min(porPips.pips / 10, 30),
      texto: `${porPips.symbol} somou +${nf.format(Math.round(porPips.pips))} pips em ${porPips.trades} trades.`,
    })
  }

  // 3) A gestão a funcionar: parciais realizados. É o que separa "seguir um sinal" de "gerir".
  if (e.comParciais >= 5) {
    const pct = Math.round((e.comParciais / e.trades) * 100)
    candidatos.push({
      peso: 50 + pct / 2,
      texto: `${e.comParciais} trades (${pct}%) realizaram lucro em alvos parciais antes de fechar.`,
    })
  }

  // 4) Taxa de acerto global, quando é de facto boa.
  if (e.winRatePct >= 55) {
    candidatos.push({ peso: e.winRatePct + 10, texto: `${e.winRatePct}% das ${e.trades} trades fecharam no verde.` })
  }

  const melhor = candidatos.sort((a, b) => b.peso - a.peso)[0]
  return melhor ? melhor.texto : null
}

/**
 * Bloco pronto a publicar: destaque + TOTAL + exemplos + ressalva.
 *
 * A ordem é deliberada. O destaque vem primeiro porque é o que se lê; o total vem logo a seguir,
 * na mesma respiração, porque é o que torna o destaque honesto.
 */
export function blocoPips(p: PipsProof): string {
  const destaque = destaquePositivo(p)
  const cabeca = destaque ? `✨ ${destaque}\n` : ''
  return `${cabeca}${linhaPips(p)}\n${RESSALVA_LEGAL}`
}


/**
 * Factos curtos para um cartão — o que cabe numa linha e ajuda o CTA.
 *
 * Substituem a linha fixa "675 trades · 63% win rate · +7.060€", que estava congelada em 30/06,
 * falava em euros (que não são comparáveis: o mesmo sinal vale ~8 $ a 0,01 lote e ~800 $ a 1) e,
 * de tanto se repetir, deixou de ser prova para passar a ser decoração.
 *
 * Vêm todos dos mesmos números da conta-espelho. Devolve VÁRIOS de propósito: quem publica todos
 * os dias com a mesma frase treina o leitor a saltá-la. Rodando, cada post traz um facto novo.
 *
 * Devolve lista vazia quando não há amostra que chegue — publicar 3 trades como prova é ruído
 * com ar de prova, e é pior do que não pôr número nenhum.
 */
export function factosParaCartao(p: PipsProof | null): string[] {
  if (!publicavel(p)) return []
  const nf = new Intl.NumberFormat('pt-PT')
  const e = p.executado
  const factos: string[] = []

  const sinal = (n: number) => (n >= 0 ? `+${nf.format(Math.round(n))}` : `−${nf.format(Math.abs(Math.round(n)))}`)

  // O total vai sempre — é o que torna qualquer destaque honesto.
  factos.push(`${e.trades} trades · ${e.winRatePct}% de acerto · ${sinal(e.pips)} pips`)

  if (e.ouro && e.ouro.trades >= 8) {
    factos.push(`Ouro: ${e.ouro.trades} trades · ${e.ouro.winRatePct}% de acerto · ${sinal(e.ouro.pips)} pips`)
  }
  if (e.comParciais >= 5) {
    const pct = Math.round((e.comParciais / e.trades) * 100)
    factos.push(`${pct}% das trades realizaram lucro em alvos parciais`)
  }
  for (const f of (e.porFonte ?? []).filter((x) => fonteEhMtm(x.chave))) {
    if (f.trades >= 5 && f.pips > 0) {
      factos.push(`${NOME_FONTE[f.chave] ?? f.chave}: ${sinal(f.pips)} pips em ${f.trades} trades`)
    }
  }
  const melhor = e.porSimbolo.filter((s) => s.trades >= 8 && s.pips > 0).sort((a, b) => b.pips - a.pips)[0]
  if (melhor) factos.push(`${melhor.symbol}: ${sinal(melhor.pips)} pips em ${melhor.trades} trades`)

  return factos
}

/**
 * Um facto, escolhido pelo dia.
 *
 * Pelo DIA e não à sorte: dois posts do mesmo dia devem dizer o mesmo número, senão quem vê os
 * dois pensa que um deles está errado.
 */
export function factoDoDia(p: PipsProof | null, deslocamento = 0): string | null {
  const lista = factosParaCartao(p)
  if (!lista.length) return null
  const dia = Math.floor(Date.now() / 86_400_000)
  return lista[(dia + deslocamento) % lista.length]
}
