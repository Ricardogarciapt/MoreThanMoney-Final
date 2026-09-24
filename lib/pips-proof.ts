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
 * A conta-espelho ANTIGA — «All tap to trade Signals» (PU Prime DEMO, login 700163127), na MetaApi.
 *
 * ESTÁ MORTA desde 2026-08-26: a conta foi apagada na MetaApi (hoje responde 404) e vive no registo
 * de contas inexistentes (lib/mtmcopy/metaapi-inexistentes.ts). Fica aqui porque as trades de 25 e
 * 26/08 ainda contam para janelas longas se algum dia o histórico voltar a ler-se — e porque o id
 * explica de onde vêm os números antigos. A conta-espelho VIVA é outra: ver
 * `computeExecutadasDoEspelhoSim`.
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
  /**
   * O instante da ENTRADA mais antiga da amostra — a abertura, não o fecho.
   *
   * Existe por causa do defeito de preço de 24/09 (ver `FRONTEIRA_VIES_PRECO`): o que ele
   * estragava era o preenchimento, ou seja o preço a que a posição ABRIU. Uma trade que abriu às
   * 10h e fechou às 20h leva o viés com ela, e `desdeReal` — que é um fecho — deixá-la-ia passar
   * por limpa. Só a conta-espelho simulada sabe dizer isto; nas outras fontes fica nulo.
   */
  entradaMaisAntiga?: string | null
  /** O que foi mesmo executado, com parciais contados. É isto que se publica. */
  executado: ProvaExecutada
  /** O que as ideias publicadas fizeram. Contexto interno — nunca se mistura com o de cima. */
  ideias: ProvaIdeias | null
  /**
   * DE ONDE saiu `executado`. Não é telemetria: é o que decide se a amostra se pode publicar.
   *
   *  · `espelho_sim` — a conta-espelho viva (MTM Funded simulado). Tem ganhos E perdas, com os
   *    parciais pesados. É a fonte boa.
   *  · `broker`      — histórico da conta-espelho antiga na MetaApi. Também completo.
   *  · `registo`     — `mtmcopy_trade_exits`. NÃO SE PUBLICA: esse registo só recebe linha quando o
   *    motor faz uma SAÍDA nos alvos (lib/gestao-real/premium.ts); um stop não escreve lá nada, e
   *    por isso a amostra é estruturalmente só de vencedoras. A 24/09 dava «20 trades · 100 % de
   *    acerto · +2 225 pips» — aritmeticamente certo e uma mentira na mesma. Serve para pesar
   *    parciais de posições que conhecemos por outra via, não para medir acerto.
   *  · `nenhuma`     — não há nada medido. Diz-se isso; não se inventa.
   */
  fonte: 'espelho_sim' | 'broker' | 'registo' | 'nenhuma'
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
 * A CONTA-ESPELHO VIVA — a conta MTM Funded simulada que abre todos os sinais publicados
 * (`mtm_trading_accounts.recolhe_todos_sinais`, migração 092; quem lá abre é
 * lib/mtmfunded/estrategias-sinais/todos-os-sinais.ts, chamado pelo signal-tracker).
 *
 * Porque é ESTA a fonte certa da prova, e não a das ideias: aqui uma posição que fecha 50 % no TP1,
 * 25 % no TP2 e o resto no break-even vale a média PESADA das três saídas. Em
 * `mtmcopy_signal_tracking` a mesma trade conta como «Stop loss» e deita fora o que já estava
 * embolsado — é esse erro que a conta-espelho existe para não cometer.
 *
 * Como se lê uma trade: no motor simulado, um parcial não altera a posição — cria uma FILHA fechada
 * com `mae_id` a apontar à mãe (funded_fechar_parcial, migração 072), com a mesma entrada e o seu
 * volume. Logo:
 *   uma TRADE  = a raiz + as filhas dela;
 *   os pips    = Σ (volume da parte ÷ volume inicial) × pips dessa parte;
 *   e só entram as trades cuja RAIZ já fechou — uma posição a meio ainda pode acabar de qualquer
 *   maneira, e contá-la agora era escolher o momento que mais convém.
 *
 * A fonte de cada trade (Premium, Scanner Sensei, Scanner MTM…) vem da ponte `funded_sinal_posicoes`,
 * que o próprio sistema escreve ao abrir — não de adivinhar pelo comentário.
 */
async function computeExecutadasDoEspelhoSim(
  dias: number,
): Promise<{ trades: TradeExecutada[]; abertas: number; desdeReal: string | null; entradaMaisAntiga: string | null }> {
  const vazio = { trades: [] as TradeExecutada[], abertas: 0, desdeReal: null as string | null, entradaMaisAntiga: null as string | null }
  try {
    const db = getSupabaseAdmin()
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
    const { data: contas } = await db.from('mtm_trading_accounts').select('id')
      .eq('recolhe_todos_sinais', true).eq('motor', 'sim').limit(20)
    const ids = (contas ?? []).map((c) => String(c.id))
    if (!ids.length) return vazio

    const { data: linhas } = await db.from('funded_positions')
      .select('id, mae_id, symbol, direcao, volume, volume_inicial, preco_entrada, preco_fecho, estado, aberta_em, fechada_em')
      .in('account_id', ids).gte('fechada_em', desde).eq('estado', 'fechada').limit(5000)
    if (!linhas?.length) return vazio

    // A raiz ainda aberta = trade por acabar. Lê-se à parte porque as abertas não têm `fechada_em`.
    const { data: vivas } = await db.from('funded_positions').select('id')
      .in('account_id', ids).eq('estado', 'aberta').limit(2000)
    const aindaAbertas = new Set((vivas ?? []).map((v) => String(v.id)))

    type Parte = { id: string; raiz: string; symbol: string; dir: 1 | -1; volume: number; volumeInicial: number | null; entrada: number; fecho: number | null; abertaEm: string | null; fechadaEm: string | null }
    const partes: Parte[] = linhas.map((l) => ({
      id: String(l.id),
      raiz: String(l.mae_id ?? l.id),
      symbol: limparSimbolo(l.symbol as string),
      dir: l.direcao === 'sell' ? -1 : 1,
      volume: Number(l.volume) || 0,
      volumeInicial: l.volume_inicial == null ? null : Number(l.volume_inicial),
      entrada: Number(l.preco_entrada) || 0,
      fecho: l.preco_fecho == null ? null : Number(l.preco_fecho),
      abertaEm: (l.aberta_em as string) ?? null,
      fechadaEm: (l.fechada_em as string) ?? null,
    }))

    const porRaiz = new Map<string, Parte[]>()
    for (const p of partes) porRaiz.set(p.raiz, [...(porRaiz.get(p.raiz) ?? []), p])

    // fonte por raiz (a ponte guarda o rótulo que foi para o comentário da posição)
    const { data: pontes } = await db.from('funded_sinal_posicoes')
      .select('funded_position_id, fonte').in('account_id', ids)
      .in('funded_position_id', [...porRaiz.keys()].slice(0, 1000)).limit(1000)
    const fonteDaRaiz = new Map<string, string>()
    for (const p of pontes ?? []) if (p.funded_position_id) fonteDaRaiz.set(String(p.funded_position_id), String(p.fonte ?? ''))

    const trades: TradeExecutada[] = []
    let abertas = 0
    let maisAntigo: number | null = null
    // A ENTRADA mais antiga, e não só o fecho: o defeito de preço de 24/09 batia no preenchimento,
    // ou seja no instante em que a posição ABRIU. Uma trade que abriu de manhã e fechou à noite
    // leva o viés com ela — medir a amostra pelo fecho deixaria-a passar por limpa.
    let entradaMaisAntiga: number | null = null
    for (const [raiz, ps] of porRaiz) {
      if (aindaAbertas.has(raiz)) { abertas++; continue }
      const mae = ps.find((p) => p.id === raiz)
      // Sem a raiz na janela a trade abriu antes dela: as filhas sozinhas não dizem o resultado.
      if (!mae || !mae.entrada) continue
      // `volume_inicial` só é preenchido quando houve parcial; sem parciais é o volume da própria raiz.
      const volInicial = mae.volumeInicial && mae.volumeInicial > 0 ? mae.volumeInicial : ps.reduce((a, p) => a + p.volume, 0)
      if (!(volInicial > 0)) continue
      const tamanhoPip = pipSizeForSymbol(mae.symbol)
      let pips = 0
      let completo = true
      for (const p of ps) {
        if (p.fecho == null) { completo = false; break }
        pips += (((p.fecho - p.entrada) * p.dir) / tamanhoPip) * (p.volume / volInicial)
      }
      if (!completo) continue
      pips = Math.round(pips * 10) / 10
      if (!Number.isFinite(pips) || Math.abs(pips) > tectoDePips(mae.symbol)) continue
      const fechadaEm = ps.map((p) => p.fechadaEm).filter(Boolean).sort().pop() ?? null
      const t = ps.map((p) => (p.fechadaEm ? Date.parse(p.fechadaEm) : NaN)).filter(Number.isFinite)
      if (t.length) maisAntigo = maisAntigo == null ? Math.min(...t) : Math.min(maisAntigo, ...t)
      const abriu = mae.abertaEm ? Date.parse(mae.abertaEm) : NaN
      if (Number.isFinite(abriu)) entradaMaisAntiga = entradaMaisAntiga == null ? abriu : Math.min(entradaMaisAntiga, abriu)
      trades.push({
        positionId: raiz,
        symbol: mae.symbol,
        fonte: chaveDaFonteDoEspelho(fonteDaRaiz.get(raiz)),
        pips,
        dinheiro: 0, // o dinheiro depende do lote de cada conta — aqui só se mede o movimento
        saidas: ps.length,
        fechadaEm,
      })
    }
    return {
      trades,
      abertas,
      desdeReal: maisAntigo ? new Date(maisAntigo).toISOString() : null,
      entradaMaisAntiga: entradaMaisAntiga ? new Date(entradaMaisAntiga).toISOString() : null,
    }
  } catch {
    return vazio
  }
}

/**
 * O rótulo que a conta-espelho escreve no comentário («Premium», «Scanner MTM», «PrimeVerse fxedge»)
 * → a chave das fontes que o resto deste ficheiro usa («premium», «mtmscanner», «primeverse»).
 *
 * É o inverso de `comentarioDaFonte` (lib/mtmfunded/estrategias-sinais/calculo.ts). Fica aqui, e não
 * importado de lá, porque o que se inverte é a tabela de rótulos — se ela mudar, isto tem de mudar
 * com ela, e uma correspondência falhada devolve `null` (trade sem fonte) em vez de uma fonte errada.
 */
function chaveDaFonteDoEspelho(rotulo: string | undefined | null): string | null {
  const r = String(rotulo ?? '').trim().toLowerCase()
  if (!r) return null
  if (r.startsWith('primeverse')) return 'primeverse'
  if (r === 'premium') return 'premium'
  if (r === 'scanner sensei' || r === 'sensei') return 'sensei'
  if (r === 'goldkiller') return 'goldkiller'
  if (r === 'scanner mtm') return 'mtmscanner'
  if (r === 'aurum flow') return 'goldenmoves'
  if (r === 'perps') return 'perps'
  return null
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
  // Pela ordem em que as fontes merecem confiança (ver o campo `fonte` de PipsProof):
  //  1. a conta-espelho VIVA, que é onde os sinais abrem hoje e onde as parciais existem;
  //  2. o histórico do broker da conta-espelho antiga — só serve enquanto ela responder;
  //  3. `mtmcopy_trade_exits`, que é só de vencedoras e por isso NÃO se publica (`publicavel`).
  let fonte: PipsProof['fonte'] = 'espelho_sim'
  let erro: string | undefined
  let { trades, abertas, desdeReal, entradaMaisAntiga } = await computeExecutadasDoEspelhoSim(dias)
  if (!trades.length) {
    const broker = await computeExecutadas(dias)
    fonte = 'broker'
    trades = broker.trades
    abertas = broker.abertas
    desdeReal = broker.desdeReal
    entradaMaisAntiga = null
    erro = broker.erro
  }
  if (!trades.length) {
    const registo = await computeExecutadasDoRegisto(dias)
    if (registo.trades.length) {
      fonte = 'registo'
      trades = registo.trades
      abertas = registo.abertas
      desdeReal = registo.trades.map((t) => t.fechadaEm).filter(Boolean).sort()[0] ?? null
      entradaMaisAntiga = null
      erro = undefined
    }
  }
  if (!trades.length) fonte = 'nenhuma'
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
    entradaMaisAntiga,
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
    fonte,
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

/**
 * ── A NOTA DO VIÉS DE PREÇO (24/09/2026) ──────────────────────────────────────────────────────
 *
 * O QUE ACONTECEU. As contas MTM Funded simuladas abriam a preços que o mercado não ofereceu, e
 * sempre para o mesmo lado — o da casa. Nas 7 trades ao vivo da mestre do Sensei a entrada bateu
 * a favor em 6 (média +1,79 USD por trade) e três delas caíram FORA do intervalo da vela de 5
 * minutos; uma ficou 1,37 acima do máximo. Refeitas as contas ao preço certo, +222,2 USD passam a
 * +84,8: desaparecem 62 % do lucro.
 *
 * PORQUÊ. O campo `funded_precos.em` era a hora a que o MOTOR tocou no preço, não a hora a que o
 * MERCADO o fez, e as fontes de recurso (Yahoo com até 240 s de atraso, ouro derivado do PAXG)
 * entravam com `Date.now()`. A guarda de frescura media a nossa vivacidade, não a idade do preço.
 *
 * O QUE SE FAZ COM ISSO AQUI. Assinala-se; não se corrige o passado. Reescrever os números
 * antigos seria inventar um histórico que ninguém viu — e a nota existe exactamente para quem
 * lê poder descontar sozinho.
 */

/**
 * A FRONTEIRA: o instante a partir do qual um preenchimento já é de confiança.
 *
 * É a hora do commit `a4b3909e` («motor: a fonte provada manda, e o preço congelado envelhece»),
 * 2026-09-24T15:23:58+01:00, e não a meia-noite de 24/09. Arredondar para o dia marcaria como
 * suspeitas horas que já estavam corrigidas, e — pior — deixaria passar por limpas as trades da
 * manhã de 24/09, que são as MAIS viciadas de todas: foram elas que se mediram.
 *
 * Porquê este commit e não a migração 123 (14:54) nem a regra de preenchimento (14:02): a
 * correcção só fica inteira quando a ÚLTIMA peça entra. Até `a4b3909e`, um preço congelado ainda
 * podia ser lido como fresco. A fronteira é a última peça, pela mesma razão por que uma corrente
 * vale o elo mais fraco.
 */
export const FRONTEIRA_VIES_PRECO = '2026-09-24T14:23:58.000Z'

/**
 * Que fontes é que o defeito tocou.
 *
 * SÓ a conta-espelho simulada (`espelho_sim`): o viés estava no preenchimento das contas MTM
 * Funded em motor `sim` (lib/mtmfunded/precos/preenchimento.ts). O histórico `broker` vem de uma
 * conta MT5 na corretora, preenchida pela corretora, e o `registo` vem de saídas em contas reais
 * — nenhum dos dois passou por este motor. Pôr a nota neles seria ruído: uma ressalva que também
 * aparece onde não se aplica ensina o leitor a saltá-la, que é o contrário do que se quer.
 */
const FONTES_COM_VIES_DE_PRECO = new Set<PipsProof['fonte']>(['espelho_sim'])

/** dd/mm, como o resto do funil escreve as datas. */
function diaMes(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * A amostra inclui trades abertas ANTES da correcção?
 *
 * Mede-se pela ENTRADA mais antiga, que é onde o defeito batia. Quando a prova gravada não a
 * traz — provas guardadas antes de este campo existir — cai-se para o fecho mais antigo e, à
 * falta dele, para o início da janela pedida. Os dois fallbacks erram para o lado de pôr a nota:
 * na dúvida sobre se a amostra está limpa, avisa-se. O contrário seria esconder por descuido.
 */
export function amostraAtravessaViesDePreco(p: PipsProof | null | undefined): boolean {
  if (!p || !p.executado?.trades) return false
  if (!FONTES_COM_VIES_DE_PRECO.has(p.fonte)) return false
  const fronteira = Date.parse(FRONTEIRA_VIES_PRECO)
  const candidatos = [p.entradaMaisAntiga, p.desdeReal]
  for (const c of candidatos) {
    const t = c ? Date.parse(c) : NaN
    if (Number.isFinite(t)) return t < fronteira
  }
  const asOf = Date.parse(`${p.asOf}T23:59:59Z`)
  if (!Number.isFinite(asOf)) return true
  return asOf - (p.dias ?? 30) * 86_400_000 < fronteira
}

/**
 * A nota, na voz do resto do funil: curta, sem rodeios e com a data lá dentro.
 *
 * DESAPARECE SOZINHA. Não há interruptor para desligar, nem data escrita à mão num template:
 * assim que a trade mais antiga da amostra for posterior à fronteira — o que acontece por si à
 * medida que a janela de 30 dias anda para a frente — `amostraAtravessaViesDePreco` passa a dar
 * falso e isto devolve `null`. Uma ressalva que fica para sempre deixa de ser lida, e daqui a
 * duas semanas já nem seria verdade.
 */
export function notaViesPreco(p: PipsProof | null | undefined): string | null {
  if (!amostraAtravessaViesDePreco(p)) return null
  return `Nota: os resultados até ${diaMes(FRONTEIRA_VIES_PRECO)} podem estar inflacionados por um defeito de preço já corrigido.`
}

/**
 * Há amostra que chegue para publicar? Abaixo disto é ruído com ar de prova.
 *
 * Duas condições, e a segunda é tão importante como a primeira: a amostra tem de vir de uma fonte
 * que consiga medir PERDAS. `mtmcopy_trade_exits` não consegue — só lá entra linha quando o motor
 * sai nos alvos, um stop não escreve nada, e o que sobra é uma lista de vencedoras. Foi assim que a
 * prova esteve a dar «20 trades · 100 % de acerto» durante quase um mês depois de a conta-espelho
 * ter morrido (26/08). Um número impossível de defender é pior do que não ter número nenhum.
 */
export function publicavel(p: PipsProof | null): p is PipsProof {
  return Boolean(p && p.executado.trades >= 20 && p.fonte !== 'registo')
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
  const nota = notaViesPreco(p)
  if (nota) partes.push(nota)
  return partes.join(' · ')
}

export function linhaPips(p: PipsProof, opts?: { comExemplos?: boolean }): string {
  const nf = new Intl.NumberFormat('pt-PT')
  const sinal = (n: number) => (n >= 0 ? `+${nf.format(Math.round(n))}` : `−${nf.format(Math.abs(Math.round(n)))}`)
  const e = p.executado
  const parciais = e.comParciais ? ` (${e.comParciais} com saídas parciais)` : ''
  const base = `No total ${periodoReal(p)}: ${e.trades} trades executadas${parciais} · ${e.winRatePct}% de acerto · ${sinal(e.pips)} pips`
  // A nota do viés viaja COLADA ao número, nunca num rodapé à parte: quem cita a linha leva-a.
  const nota = notaViesPreco(p)
  const fim = nota ? `\n${nota}` : ''
  if (opts?.comExemplos === false || !e.ouro) return base + fim
  const g = e.ouro.pips
  const usd = (n: number) => `${n >= 0 ? '+' : '−'}${nf.format(Math.abs(Math.round(n)))} $`
  return (
    `${base}\n` +
    `Só em ouro: ${e.ouro.trades} trades, ${e.ouro.winRatePct}% de acerto, ${sinal(g)} pips. ` +
    `O que isso vale depende do teu lote — 0,01 → ${usd(g * VALOR_PIP_OURO['0.01'])} · ` +
    `0,1 → ${usd(g * VALOR_PIP_OURO['0.1'])} · 1,0 → ${usd(g * VALOR_PIP_OURO['1'])}.` +
    fim
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
