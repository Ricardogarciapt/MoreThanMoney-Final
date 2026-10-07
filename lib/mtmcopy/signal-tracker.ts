/**
 * Segue TODOS os sinais publicados nos canais do Tap to Trade — tenha alguém aceitado ou não.
 *
 * O que já existia seguia POSIÇÕES: o motor Premium seguia as contas provedoras, o monitor T2T
 * seguia as ordens de quem carregava no botão. Um sinal que ninguém aceitasse nunca ganhava
 * desfecho, e os canais que não publicam fechos — Ideias de Forex e MTM Scanner (o scanner só
 * emite entradas) e o Forex Swings («set & forget») — não tinham métricas nenhumas. Foi assim
 * que 19 sinais do James passaram duas semanas sem que ninguém soubesse que só um chegara ao alvo.
 *
 * Aqui o preço é a única fonte de verdade: a entrada enche, os alvos são tocados, o stop é tocado.
 * Cada acontecimento vira cartão em thread no sinal e escreve os pips e a percentagem em
 * `chat_messages.outcome`, que é de onde o chat e o Tap to Trade os lêem.
 */
import { canalPublicadoPelaMestre } from '@/lib/mestres/servidor/canais-publicados'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getExecSwitches } from './exec-switches'
import { parseSignal } from './signal-parser'
import { referencePrice } from './reference-price'
import { isT2TEntrySignal, t2tSourceKey, t2tMode } from './t2t-source'
import { pipSizeForSymbol } from './trade-outcome'
import { lifecycleMessage, type SignalEvent } from './signal-lifecycle'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import { CANAIS_ACOMPANHADOS } from './tap-to-trade-channels'
import { placeOrdersSequential, getMarketPrice } from './metaapi'
import { isMarketOpen, podeSaltarLeitura } from './market-hours'
import { slComMinimo, stopDoLadoErrado } from './source-risk-rules'
import { gravarDesfechoUnico } from './desfecho-unico'
import { descarteSilencioso, entradaEncheu, horasAteDesistir, tipoDaEntrada, type TipoEntrada } from './tracker-entrada'

/**
 * Conta que ABRE todos os sinais do Tap to Trade — «All tap to trade Signals», PU Prime Demo,
 * login 700163127. É a conta-espelho: cada sinal publicado abre aqui, com 0,03 lotes (três para
 * poder haver parciais a sério), e a gestão corre no motor de preço a 1 segundo como em qualquer
 * outra. É daqui que saem as métricas honestas de cada fonte — sem depender de alguém aceitar.
 */
const CONTA_ESPELHO_T2T =
  process.env.METAAPI_T2T_MIRROR_ACCOUNT_ID?.trim() || '6014b4fc-3ed3-458a-8cea-7099cf29b51f'
/** Três lotes mínimos: sem isto não há parcial possível, fecha-se tudo no primeiro alvo. */
const LOTE_ESPELHO = Number(process.env.T2T_MIRROR_LOT) || 0.03

/** Um setup pendente desiste ao fim disto sem a entrada encher. */
const HORAS_ATE_DESISTIR = Number(process.env.SIGNAL_TRACKER_PENDING_HOURS) || 24
/** Quanto tempo para trás vamos buscar sinais por registar. */
const HORAS_DE_ADMISSAO = Number(process.env.SIGNAL_TRACKER_INTAKE_HOURS) || 12
/**
 * Sinais mais velhos do que isto entram em SILÊNCIO: contam para as métricas mas não publicam
 * cartões. Sem isto, a primeira passagem despejava o histórico das últimas horas em cima dos
 * chats — dezenas de «alvo atingido» de trades que já ninguém tinha aberto.
 */
const MINUTOS_PARA_ANUNCIAR = Number(process.env.SIGNAL_TRACKER_ANNOUNCE_MINUTES) || 45

interface Linha {
  id: string
  chat_message_id: string
  channel_slug: string
  symbol: string
  direction: 'buy' | 'sell'
  entry: number | null
  /** Stop VIVO: sobe para a entrada no primeiro alvo. Não serve para medir o risco do sinal. */
  sl: number | null
  /**
   * Stop que a fonte PUBLICOU, intocado. Null nas 163 linhas anteriores à migração 148, onde o
   * original já tinha sido apagado por cima — não há de onde o recuperar sem adivinhar.
   *
   * OPCIONAL de propósito: enquanto a migração 148 não correr, a coluna não existe e o `select *`
   * devolve a linha sem este campo. Quem o lê trata `undefined` como «não se sabe», que é o
   * mesmo que já faz com as linhas antigas.
   */
  sl_original?: number | null
  tps: number[]
  source_key: string | null
  status: 'pending' | 'active' | 'closed'
  exits_done: number
  peak_pips: number
  created_at: string
  announce: boolean
  /** Flutuante já gravado (vem no `select *`) — para não reescrever a linha quando não mexeu. */
  live_pips?: number | null
  live_pct?: number | null
  live_at?: string | null
  /**
   * Caminho do preço e saídas — migração 150. OPCIONAIS pela mesma razão que o `sl_original`:
   * enquanto a migração não correr, a coluna não existe e o `select *` devolve a linha sem elas.
   */
  percurso?: Amostra[] | null
  saidas?: Saida[] | null
  /** 199: preço no instante da admissão e o tipo de entrada que ele decide (ver tracker-entrada.ts) */
  preco_admissao?: number | null
  tipo_entrada?: TipoEntrada | null
}

/** Um ponto do caminho: instante (epoch, segundos), preço, lucro flutuante e pico em pips até ali. */
interface Amostra { t: number; p: number; pips: number; pico: number }
/** Uma saída: que nível, quando, o pico até ali e quanto já tinha recuado desde esse pico. */
interface Saida { nivel: string; em: number; pico: number; recuo: number }

/** Tecto de amostras por sinal. ~4 h de caminho a uma amostra por minuto, ou muito mais se andar parado. */
const MAX_AMOSTRAS = 240
/** Intervalo mínimo entre amostras quando o preço não mexeu o bastante (segundos). */
const AMOSTRA_CADA_S = 300

/**
 * Decide se este instante merece ficar gravado.
 *
 * Gravar todos os minutos de todos os sinais activos seria a coluna a crescer por nada — o preço
 * arredondado fica igual em muitas passagens. Grava-se quando passaram 5 minutos da última amostra
 * OU quando o preço andou pelo menos 1 pip desde ela. O detalhe que interessa — os picos e os
 * recuos — é exactamente o que se move, por isso é o movimento que puxa a amostra.
 */
function mereceAmostra(percurso: Amostra[], agora: number, pips: number): boolean {
  const ultima = percurso[percurso.length - 1]
  if (!ultima) return true
  if (agora - ultima.t >= AMOSTRA_CADA_S) return true
  return Math.abs(pips - ultima.pips) >= 1
}

/**
 * Escreve um patch tolerando que as colunas da 150 ainda não existam.
 *
 * O MESMO princípio da 148, e pela mesma razão: uma ordem de deploy trocada não pode parar o motor
 * de medição. Se o PostgREST recusar por causa de `percurso`/`saidas`, repete-se sem elas — a
 * linha continua a ser seguida, só fica sem o caminho gravado até a migração correr.
 */
async function gravarTolerante(id: string, patch: Record<string, unknown>): Promise<void> {
  const admin = getSupabaseAdmin()
  const { error } = await admin.from('mtmcopy_signal_tracking').update(patch).eq('id', id)
  if (!error) return
  if (!/percurso|saidas/.test(error.message)) {
    console.warn('[signal-tracker] escrita falhou:', error.message)
    return
  }
  const { percurso: _p, saidas: _s, ...semColunas } = patch
  const { error: e2 } = await admin.from('mtmcopy_signal_tracking').update(semColunas).eq('id', id)
  if (e2) console.warn('[signal-tracker] escrita falhou:', e2.message)
  else console.warn('[signal-tracker] gravado SEM percurso/saidas — falta correr a migração 150')
}

/** Junta uma saída à lista da linha, com o recuo desde o pico já calculado. */
function comSaida(l: Linha, nivel: string, pipsAgora: number | null): Saida[] {
  const anteriores = Array.isArray(l.saidas) ? l.saidas : []
  const pico = Number.isFinite(l.peak_pips) ? l.peak_pips : 0
  // `recuo` nunca é negativo: se a saída acontece NO pico, recuou zero.
  const recuo = pipsAgora == null ? 0 : Math.max(0, pico - pipsAgora)
  return [
    ...anteriores.slice(-20),
    { nivel, em: Math.round(Date.now() / 1000), pico: Math.round(pico * 10) / 10, recuo: Math.round(recuo * 10) / 10 },
  ]
}

export interface ResultadoTracker {
  ran: boolean
  admitidos: number
  seguidos: number
  eventos: string[]
}

/** Regista sinais novos dos canais T2T que ainda não estejam a ser seguidos. */
async function admitirNovos(): Promise<number> {
  const admin = getSupabaseAdmin()
  const desde = new Date(Date.now() - HORAS_DE_ADMISSAO * 3600_000).toISOString()
  const { data: msgs } = await admin
    .from('chat_messages')
    .select('id, channel_slug, content, created_at')
    .in('channel_slug', CANAIS_ACOMPANHADOS)
    .eq('is_deleted', false)
    .gte('created_at', desde)
    .order('created_at', { ascending: true })
    .limit(500)
  if (!msgs?.length) return 0

  const { data: jaSeguidos } = await admin
    .from('mtmcopy_signal_tracking')
    .select('chat_message_id')
    .in('chat_message_id', msgs.map((m) => m.id))
  const vistos = new Set((jaSeguidos ?? []).map((r) => r.chat_message_id as string))

  const novos: Record<string, unknown>[] = []
  for (const m of msgs) {
    if (vistos.has(m.id)) continue
    if (!isT2TEntrySignal(m.channel_slug, m.content)) continue
    // Perpétuos que não existem em MT5 são SEGUIDOS na Bybit, não abertos aqui — a gestão deles
    // vive no motor dos perps e seguir por cotação daria números de outro mercado.
    if (t2tMode(m.channel_slug, m.content) === 'follow') continue
    const p = parseSignal(m.content ?? '')
    if (!p?.symbol || !p.direction) continue
    if (!p.sl || !(p.sl > 0)) continue
    const tps = (p.tp ?? []).filter((n) => Number.isFinite(n) && n > 0)
    if (!tps.length) continue
    /**
     * Stop do lado errado: não se segue.
     *
     * A 31/08 entrou aqui um «GOLD BUY … SL 4532 … TP1 4447» (compra a 4437, stop 95 pontos
     * ACIMA). O acompanhamento seguiu-o na mesma e, quando o preço tocou o «stop», anunciou no
     * chat «🛑 Stop loss · XAUUSD 🔵 COMPRA · +950 pips · +2,14%» — um stop a dar lucro.
     *
     * A conta estava certa para os números que recebeu (|4532−4437| = 95 pontos = 950 pips); o
     * que não podia era ter recebido aqueles números. Corrigir o sinal por nós seria adivinhar
     * qual dos dois valores é que o autor trocou, por isso não se segue — e fica de fora do
     * histórico, em vez de lá entrar como uma vitória que nunca houve.
     *
     * A verificação vive agora em `source-risk-rules` e olha para a ENTRADA, não só para o
     * primeiro alvo: era por isso que o defeito só estava meio resolvido e passaram mais dez
     * linhas, uma delas publicada como «Stop loss · +50 pips» (premium XAUUSD compra, entrada
     * 4353, SL 4358, 01/09). Contra o TP1 aquele stop parecia bem; contra a entrada, não.
     */
    const maGeometria = stopDoLadoErrado({ direction: p.direction, entry: p.entry ?? null, sl: p.sl, tp1: tps[0] })
    if (maGeometria) {
      console.warn('[signal-tracker] não admitido:', m.id, p.symbol, p.direction, maGeometria)
      continue
    }
    // O tipo da entrada (limite/stop/mercado) decide-se AGORA, contra o preço deste instante.
    const precoAgora = await referencePrice(p.symbol).catch(() => null)
    const entradaSinal = p.entry ?? null
    novos.push({
      preco_admissao: precoAgora,
      tipo_entrada: tipoDaEntrada({ direcao: p.direction, entrada: entradaSinal, preco: precoAgora }),
      chat_message_id: m.id,
      channel_slug: m.channel_slug,
      source_key: t2tSourceKey(m.channel_slug, m.content),
      symbol: p.symbol,
      direction: p.direction,
      entry: p.entry ?? null,
      sl: p.sl,
      // O stop que a FONTE publicou, guardado à parte. `sl` move-se para a entrada no primeiro
      // alvo e deixa de servir para medir risco; este não se mexe nunca. Ver a migração 148.
      sl_original: p.sl,
      tps,
      status: 'pending',
      created_at: m.created_at,
      announce: Date.now() - Date.parse(m.created_at) <= MINUTOS_PARA_ANUNCIAR * 60_000,
    })
  }
  if (!novos.length) return 0
  const { error } = await admin.from('mtmcopy_signal_tracking').insert(novos)
  if (!error) return novos.length
  /**
   * A COLUNA PODE AINDA NÃO EXISTIR — e isso não pode parar a medição.
   *
   * `sl_original` nasce na migração 148. Se o código chegar a produção antes de a migração
   * correr, o PostgREST recusa o insert inteiro (PGRST204, «could not find the column») e o
   * motor de medição pára de admitir sinais — uma ordem de deploy trocada apagaria o histórico
   * de um dia inteiro, que é bem pior do que ficar sem o stop original de alguns sinais.
   *
   * Por isso a segunda tentativa vai sem o campo: a admissão continua, e as linhas admitidas
   * nessa janela ficam com `sl_original` a null — o mesmo estado honesto das linhas antigas.
   * Quando a migração correr, volta tudo ao normal sozinho, sem novo deploy.
   */
  if (/sl_original|preco_admissao|tipo_entrada/.test(error.message)) {
    const semColuna = novos.map(({ sl_original: _ignorado, preco_admissao: _p, tipo_entrada: _t, ...resto }) => resto)
    const { error: e2 } = await admin.from('mtmcopy_signal_tracking').insert(semColuna)
    if (!e2) {
      console.warn('[signal-tracker] admitido SEM sl_original — falta correr a migração 148')
      return semColuna.length
    }
    console.warn('[signal-tracker] admissão falhou:', e2.message)
    return 0
  }
  console.warn('[signal-tracker] admissão falhou:', error.message)
  return 0
}

/** Publica o cartão em thread no sinal (idempotente pelo prefixo do próprio cartão). */
async function anunciar(linha: Linha, evento: SignalEvent, ctx: { price?: number | null; level?: number }) {
  if (!linha.announce) return
  // Canal publicado pela mestre: quem conta o que aconteceu é a conta-mestre, não o preço daqui.
  if (await canalPublicadoPelaMestre(linha.channel_slug)) return
  const admin = getSupabaseAdmin()
  const { text } = lifecycleMessage(evento, {
    symbol: linha.symbol,
    direction: linha.direction,
    source: 'MTM',
    entry: linha.entry,
    price: ctx.price ?? null,
    level: ctx.level,
    /**
     * O stop PUBLICADO, para o cartão poder calar um número impossível.
     *
     * `lifecycleMessage` já sabe recusar um «Stop loss» com pips positivos — mas precisa do
     * `slOriginal` para distinguir «o trailing fechou-me em lucro» (número verdadeiro, tem de
     * aparecer) de «o stop estava do lado errado da entrada» (número impossível, cala-se). O
     * tracker nunca lho passou, e por isso essa guarda esteve inerte desde que foi escrita: foi
     * assim que saiu «🛑 Stop loss · +50 pips» para o chat a 01/09.
     */
    slOriginal: linha.sl_original ?? null,
  })
  const prefixo = text.split('\n')[0]
  const { data: dup } = await admin
    .from('chat_messages')
    .select('id')
    .eq('channel_slug', linha.channel_slug)
    .eq('reply_to_id', linha.chat_message_id)
    .ilike('content', `${prefixo}%`)
    .limit(1)
    .maybeSingle()
  if (dup) return
  const { data } = await admin
    .from('chat_messages')
    .insert({
      channel_slug: linha.channel_slug,
      user_id: null,
      content: text,
      message_type: 'telegram_forward',
      notified: true,
      reply_to_id: linha.chat_message_id,
    })
    .select('id')
    .single()
  await sendTelegramChannelPush({
    slug: linha.channel_slug,
    content: text,
    chatMessageId: data?.id as string,
  }).catch(() => {})
}

/** Escreve pips e percentagem na mensagem de ENTRADA — é daqui que o cartão os lê. */
async function gravarDesfecho(linha: Linha, pips: number | null, rotulo: string) {
  const admin = getSupabaseAdmin()
  // `pips` a null = o sinal acabou mas não se soube medi-lo (sem entrada). Grava-se o fecho e o
  // rótulo; o NÚMERO fica vazio, porque um zero no lugar dele é outra medição falsa.
  const p = pips != null ? Math.round(pips * 10) / 10 : null
  const pct = p != null && linha.entry && linha.entry > 0
    ? Math.round(((p * pipSizeForSymbol(linha.symbol)) / linha.entry) * 100 * 100) / 100
    : null
  /**
   * O NÚMERO vai sempre, em qualquer canal — quem decide se fica é a escada (`desfecho-unico`).
   *
   * Aqui havia um `if (!daMestre)`: nos canais publicados pela mestre o tracker calava-se e
   * deixava o campo livre. Só que quem o vinha ocupar não era a mestre — era o leitor de texto,
   * de 5 em 5 minutos. O silêncio do lado do preço era a porta por onde entrava o número
   * anunciado, e ficavam dois: o do chat e o desta linha.
   *
   * Agora escreve-se sempre e a escada arbitra: se a mestre (grau 3) já mediu o fecho real, esta
   * escrita é recusada e a da mestre fica; se ainda não mediu, vale a cotação (grau 2) em vez do
   * texto (grau 1). O que continua a respeitar a decisão de 18/09 são os CARTÕES — `anunciar()`
   * mantém-se calado nos canais da mestre, que é de onde vinham os duplicados no chat. O `outcome`
   * não é um cartão: é o número na mensagem de entrada, e esse tem de existir uma vez só.
   */
  await gravarDesfechoUnico(linha.chat_message_id, 'tracker', { label: rotulo, pips: p, pct })
  await admin
    .from('mtmcopy_signal_tracking')
    .update({
      status: 'closed',
      result_pips: p,
      result_pct: pct,
      outcome_label: rotulo,
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', linha.id)
}

/**
 * Abre o sinal na conta-espelho e entrega-o ao motor de preço.
 *
 * A trade é real (conta demo, dinheiro de brincar) porque só assim as métricas são honestas:
 * slippage, spread, parciais que enchem ou não. O motor a 1 segundo trata do resto pelo perfil
 * `trailing` — break-even proporcional ao risco, stop a seguir o preço, TP final como rede —
 * e anuncia o desfecho no cartão através do `chat_message_id`.
 *
 * Nunca segura o tracker: se a ordem falhar, o sinal continua a ser seguido por cotação.
 */
async function abrirNaContaEspelho(l: Linha, price: number): Promise<void> {
  const admin = getSupabaseAdmin()
  try {
    // O backlog silencioso NÃO abre trades: seria abrir agora, a preço de agora, dezenas de
    // sinais de horas atrás. Esses seguem-se só por cotação, para a métrica.
    if (!l.announce) return
    // Rede de segurança: uma trade por sinal, aconteça o que acontecer acima.
    const { data: jaAberta } = await admin
      .from('mtmcopy_premium_active')
      .select('id')
      .eq('chat_message_id', l.chat_message_id)
      .limit(1)
      .maybeSingle()
    if (jaAberta) return
    const mh = isMarketOpen(l.symbol)
    if (!mh.open) return
    const alvoFinal = l.tps.length ? l.tps[l.tps.length - 1] : null
    // Stop alargado ao mínimo da fonte: o MTM Scanner escreve stops de 2 pips, dentro do próprio
    // spread do par — a trade nascia praticamente no stop. Ver source-risk-rules.
    const slUsado = slComMinimo(l.source_key, l.symbol, l.direction, l.entry ?? price, l.sl) ?? l.sl
    // Comentário legível no MT5: dá para ver de que fonte veio cada trade sem abrir o site.
    const comment = `T2T-${(l.source_key ?? l.channel_slug).slice(0, 20)}`
    const [r] = await placeOrdersSequential(CONTA_ESPELHO_T2T, [
      {
        accountId: CONTA_ESPELHO_T2T,
        symbol: l.symbol,
        direction: l.direction,
        volume: LOTE_ESPELHO,
        orderType: 'market',
        stopLoss: slUsado,
        takeProfit: alvoFinal,
        comment,
      },
    ])
    if (!r?.success) {
      console.warn(`[signal-tracker] ${l.symbol}: espelho não abriu — ${r?.error ?? 'sem resposta'}`)
      return
    }
    const [tp1, tp2, tp3] = l.tps
    await admin.from('mtmcopy_premium_active').insert({
      account_id: CONTA_ESPELHO_T2T,
      symbol: l.symbol,
      direction: l.direction,
      entry: l.entry ?? price,
      sl: slUsado,
      tp1: tp1 ?? null,
      tp2: tp2 ?? null,
      tp3: tp3 ?? null,
      exit_pct_tp1: 33,
      exit_pct_tp2: 33,
      exit_pct_tp3: 34,
      original_lot: LOTE_ESPELHO,
      small_account: false,
      exits_done: 0,
      trailing_started: false,
      status: 'open',
      profile: 'trailing',
      source_key: l.source_key,
      chat_message_id: l.chat_message_id,
    })
  } catch (e) {
    console.warn('[signal-tracker] espelho falhou:', e instanceof Error ? e.message : String(e))
  }
}


/**
 * Os pips que a trade já EMBOLSOU nas parciais, quando o resto fecha no break-even.
 *
 * As saídas são 50% no primeiro alvo, 25% no segundo e 25% no terceiro (regra confirmada pelo
 * Ricardo a 09/09). Um sinal que levou o alvo 1 e voltou à entrada não deu zero: deu metade do
 * primeiro alvo. Dizer zero seria tão falso como a perda inteira que aqui se registava antes.
 *
 * Devolve null quando não há entrada nem alvos para medir — «não se soube» é honesto.
 */
const PESOS_SAIDA = [0.5, 0.25, 0.25] as const

function pipsEmbolsados(l: { entry: number | null; tps: number[]; exits_done: number; direction: string }, pip: number): number | null {
  if (l.entry == null || !(l.entry > 0) || !(pip > 0) || !l.tps?.length) return null
  const compra = l.direction === 'buy'
  let total = 0
  for (let i = 0; i < Math.min(l.exits_done, PESOS_SAIDA.length); i++) {
    const alvo = l.tps[i]
    if (alvo == null) continue
    const p = (compra ? alvo - l.entry : l.entry - alvo) / pip
    if (Number.isFinite(p) && p > 0) total += p * PESOS_SAIDA[i]
  }
  return Math.round(total * 10) / 10
}

export async function runSignalTracker(): Promise<ResultadoTracker> {
  const switches = (await getExecSwitches()) as unknown as Record<string, unknown>
  if (switches.signal_tracker === false) {
    return { ran: false, admitidos: 0, seguidos: 0, eventos: [] }
  }
  const admin = getSupabaseAdmin()
  const admitidos = await admitirNovos()

  const { data: linhas } = await admin
    .from('mtmcopy_signal_tracking')
    .select('*')
    .neq('status', 'closed')
    .order('created_at', { ascending: true })
    .limit(300)
  if (!linhas?.length) return { ran: true, admitidos, seguidos: 0, eventos: [] }

  const eventos: string[] = []
  // Uma cotação por SÍMBOLO, não por linha: vários sinais do mesmo par partilham o preço.
  const precos = new Map<string, number | null>()
  for (const l of linhas as Linha[]) {
    if (precos.has(l.symbol)) continue
    // Fim de semana e o par não é cripto: a cotação é a de sexta e não há nada a decidir com ela.
    // Sem preço a linha é saltada nesta passagem, como numa leitura falhada (nada se conclui).
    if (podeSaltarLeitura([l.symbol])) {
      precos.set(l.symbol, null)
      continue
    }
    precos.set(l.symbol, await referencePrice(l.symbol))
  }

  for (const l of linhas as Linha[]) {
    // Um setup que expirou descarta-se mesmo SEM cotação: a validade conta-se no relógio, não no
    // preço (sem isto, um símbolo sem preço ficava pendente para sempre — LLLGOLD desde 02/10).
    if (l.status === 'pending') {
      const idadeH = (Date.now() - Date.parse(l.created_at)) / 3600_000
      const validadeH = horasAteDesistir(l.source_key, HORAS_ATE_DESISTIR)
      if (idadeH >= validadeH) {
        // Descartado não tem resultado: a entrada nunca encheu. Sem preço, o cartão sai sem números.
        // Muito atrasado (o tracker esteve parado) → fecha em silêncio, sem despejar cartões velhos.
        if (descarteSilencioso(idadeH, validadeH)) l.announce = false
        await anunciar(l, 'discarded', { price: null })
        await gravarDesfecho(l, 0, 'Ideia descartada')
        eventos.push(`descartado ${l.symbol}`)
        continue
      }
    }
    const price = precos.get(l.symbol) ?? null
    if (price == null || !(price > 0)) continue
    const pip = pipSizeForSymbol(l.symbol)
    const compra = l.direction === 'buy'

    // ── PENDENTE: à espera de a entrada encher ────────────────────────────────
    if (l.status === 'pending') {
      // (a validade já foi vista acima, antes da cotação: um setup morto nunca chega aqui)
      // Tipo da entrada: decidido na admissão; nas linhas sem ele, na PRIMEIRA cotação vista (exige
      // um cruzamento depois disso — nunca se dá por cheia uma entrada que o preço já tinha passado).
      let tipo = l.tipo_entrada ?? null
      if (tipo == null) {
        tipo = tipoDaEntrada({ direcao: l.direction, entrada: l.entry, preco: price })
        if (tipo) await gravarTolerante(l.id, { tipo_entrada: tipo, preco_admissao: price })
        if (tipo !== 'mercado') continue
      }
      const encheu = entradaEncheu({ direcao: l.direction, entrada: l.entry, tipo, preco: price })
      if (encheu) {
        // TRANSIÇÃO ATÓMICA. O tracker corre de 5 em 5 segundos e uma passagem demora mais do que
        // isso, por isso duas sobrepõem-se: sem o `eq('status','pending')` ambas viam a linha por
        // encher e ABRIAM a mesma trade duas vezes na conta-espelho — aconteceu no USDCAD das
        // 16:57, duas posições idênticas com 5 segundos de intervalo. Quem não muda a linha, sai.
        const { data: ganhou } = await admin
          .from('mtmcopy_signal_tracking')
          .update({ status: 'active', entry_hit_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', l.id)
          .eq('status', 'pending')
          .select('id')
        if (!ganhou?.length) continue
        await abrirNaContaEspelho(l, price)
        // Conta MTM Funded «Todos os sinais» (092): mesmo sinal, 0,01, fonte no comentário. Nunca lança.
        await import('@/lib/mtmfunded/estrategias-sinais/todos-os-sinais').then((m) => m.abrirNaContaTodosOsSinais(l)).catch(() => undefined)
        await anunciar(l, 'entry_hit', { price })
        eventos.push(`entrada ${l.symbol} ${l.channel_slug}`)
        continue
      }
      continue
    }

    // ── ATIVO: alvos e stop ────────────────────────────────────────────────────
    const lucroPips = (compra ? price - (l.entry ?? price) : (l.entry ?? price) - price) / pip
    // RESULTADO FLUTUANTE: quem faz as contas é o motor, que já tem a cotação na mão. O cartão
    // lê o número pronto — cada app a ir buscar preços por sua conta seria o mesmo trabalho
    // repetido N vezes, e o egress a pagá-lo.
    const ref = l.entry ?? price
    const patch: Record<string, unknown> = {
      live_pips: Math.round(lucroPips * 10) / 10,
      live_pct: ref > 0 ? Math.round(((lucroPips * pip) / ref) * 100 * 100) / 100 : null,
      live_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    let subiuPico = false
    if (lucroPips > l.peak_pips) {
      patch.peak_pips = lucroPips
      l.peak_pips = lucroPips
      subiuPico = true
    }
    /**
     * GRAVAR O CAMINHO, não só o pico (migração 150).
     *
     * Com `peak_pips` sozinho, simular trailing é `max(resultado, pico − distância)` — uma conta
     * que nunca piora quando se aperta a distância, e por isso responde sempre «o mais apertado
     * possível». Não é um resultado, é um artefacto de não se saber por onde o preço andou. Com
     * o percurso, a pergunta passa a ter resposta: sabe-se se o stop a seguir o preço teria sido
     * tocado ANTES do alvo seguinte ou depois.
     */
    const percursoAtual = Array.isArray(l.percurso) ? l.percurso : []
    const agoraS = Math.round(Date.now() / 1000)
    if (percursoAtual.length < MAX_AMOSTRAS && mereceAmostra(percursoAtual, agoraS, lucroPips)) {
      const amostra: Amostra = {
        t: agoraS,
        p: price,
        pips: Math.round(lucroPips * 10) / 10,
        pico: Math.round(l.peak_pips * 10) / 10,
      }
      const novoPercurso = [...percursoAtual, amostra]
      patch.percurso = novoPercurso
      l.percurso = novoPercurso
    }
    // Só se grava quando o número que o cartão mostra mudou (ou de minuto a minuto): o preço anda
    // ao tick, mas arredondado a 0,1 pip fica muitas passagens igual. Antes era uma escrita por
    // linha activa em cada passagem (85 488 em 46 h, medido 15–17/09), a maior parte a repetir o valor.
    const liveAtMs = l.live_at ? Date.parse(l.live_at) : NaN
    const igual = !subiuPico && l.live_pips === patch.live_pips && l.live_pct === patch.live_pct
      && Number.isFinite(liveAtMs) && Date.now() - liveAtMs < 60_000
    // Uma amostra nova também é razão para escrever: o caminho é o que se está a gravar.
    if (!igual || patch.percurso) await gravarTolerante(l.id, patch)

    const bateuSl = l.sl != null && (compra ? price <= l.sl : price >= l.sl)
    if (bateuSl) {
      /**
       * SEM ENTRADA não há resultado que se possa medir.
       *
       * Isto era `l.entry ?? 0`, e com a entrada por preencher a conta virava `stop ÷ pip` — o
       * PREÇO INTEIRO lido como pips. Ficaram gravados quatro «Stop loss +13617 pips» em pares
       * de forex do James, onde 13617 é só o 1,3617 do stop. Números assim entram nas médias da
       * estratégia e nas contas de quem soma os pips do mês.
       *
       * Fecha-se o sinal na mesma — ele acabou — mas sem número. «Não se soube» é honesto; um
       * valor inventado não é.
       */
      const temEntrada = l.entry != null && l.entry > 0
      const perda = temEntrada
        ? ((compra ? (l.sl as number) - (l.entry as number) : (l.entry as number) - (l.sl as number)) / pip)
        : null
      // O cartão mede pela ENTRADA até ao preço que passamos: no stop é o SL, não a cotação do
      // instante — senão anunciava «+21 pips» numa trade que fechou em perda.
      /**
       * O stop desta linha passa a subir para a entrada no primeiro alvo (ver mais abaixo).
       * Tocá-lo depois disso não é perder — é a proteção a funcionar, com as parciais já feitas.
       *
       * O que se regista então é o que foi EMBOLSADO nas parciais, não zero: quem levou 50% no
       * alvo 1 e viu o resto voltar à entrada ganhou metade do primeiro alvo. Zero seria tão
       * falso como a perda inteira que aqui estava antes.
       */
      const noBreakEven =
        l.entry != null && l.entry > 0 && l.sl != null && Math.abs(l.sl - l.entry) < pip * 0.5
      if (noBreakEven) {
        const ganho = pipsEmbolsados(l, pip)
        await gravarTolerante(l.id, { saidas: comSaida(l, 'break-even', 0) })
        await anunciar(l, 'stop_protegido', { price: l.sl })
        await gravarDesfecho(l, ganho, 'Parciais + break-even')
        eventos.push(`break-even ${l.symbol}${ganho != null ? ` +${Math.round(ganho)}p` : ''}`)
        continue
      }
      await gravarTolerante(l.id, { saidas: comSaida(l, 'stop', perda) })
      await anunciar(l, 'stop_loss', { price: l.sl })
      await gravarDesfecho(l, perda, 'Stop loss')
      eventos.push(`stop ${l.symbol}`)
      continue
    }

    const proximo = l.exits_done + 1
    const alvo = l.tps[proximo - 1]
    if (alvo == null) continue
    const bateuTp = compra ? price >= alvo : price <= alvo
    if (!bateuTp) continue

    const ultimo = proximo >= l.tps.length
    // Mesmo princípio do stop: sem entrada não se mede. Aqui o `?? alvo` dava zero pips, que é
    // menos escandaloso do que o do stop mas igualmente falso — uma trade que ganhou entrava
    // nas estatísticas como se não tivesse dado nada.
    const pips = l.entry != null && l.entry > 0
      ? (compra ? alvo - l.entry : l.entry - alvo) / pip
      : null
    // O recuo desde o pico NO MOMENTO de cada alvo é o campo que torna o trailing decidível:
    // diz se um stop a perseguir o preço teria sido tocado antes de o alvo chegar.
    await gravarTolerante(l.id, { saidas: comSaida(l, ultimo ? 'alvo-final' : `alvo-${proximo}`, pips) })
    await anunciar(l, ultimo ? 'target_final' : 'partial', { price: alvo, level: proximo })
    if (ultimo) {
      await gravarDesfecho(l, pips, 'Alvo final')
      eventos.push(`alvo final ${l.symbol}${pips != null ? ` +${Math.round(pips)}p` : ''}`)
    } else {
      /**
       * NO PRIMEIRO ALVO O STOP VAI PARA A ENTRADA — e diz-se.
       *
       * Era isto que faltava. O PrimeVerse mandou 270 parciais em 14 dias e ZERO mensagens de
       * break-even: o cliente nunca soube em que momento o risco dele deixou de existir. E o
       * nosso lado também não, o que é pior — o `sl` desta linha ficava no stop original, e
       * qualquer recuo até lá era medido e anunciado como perda inteira. Foi assim que 155
       * sinais ficaram gravados a −11.102 pips quando tinham dado +6.016.
       *
       * Mover o stop AQUI resolve as duas coisas de uma vez: o cliente é avisado, e a linha
       * passa a saber onde o stop está mesmo. O resto do ficheiro mede contra `l.sl`.
       */
      const moveuParaBE = proximo === 1 && l.entry != null && l.entry > 0
      await admin
        .from('mtmcopy_signal_tracking')
        .update({
          exits_done: proximo,
          ...(moveuParaBE ? { sl: l.entry } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', l.id)
      /**
       * O stop move-se, mas NÃO se anuncia à parte.
       *
       * A mensagem do alvo já diz «o resto corre com o stop protegido» — uma segunda mensagem a
       * dizer «stop movido para a entrada» dois segundos depois é a mesma informação outra vez.
       * No Sensei sairam as duas ao mesmo minuto e o chat ficou a repetir-se (decisão do Ricardo,
       * 09/09). O que faltava nunca foi o aviso: era o stop mexer-se mesmo.
       */
      if (moveuParaBE) l.sl = l.entry
      eventos.push(`alvo ${proximo} ${l.symbol}${pips != null ? ` +${Math.round(pips)}p` : ''}`)
    }
  }

  return { ran: true, admitidos, seguidos: linhas.length, eventos }
}
