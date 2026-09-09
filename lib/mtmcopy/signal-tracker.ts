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
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getExecSwitches } from './exec-switches'
import { parseSignal } from './signal-parser'
import { referencePrice } from './reference-price'
import { isT2TEntrySignal, t2tSourceKey, t2tMode } from './t2t-source'
import { pipSizeForSymbol } from './trade-outcome'
import { lifecycleMessage, type SignalEvent } from './signal-lifecycle'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import { T2T_SIGNAL_CHANNELS } from './tap-to-trade-channels'
import { placeOrdersSequential, getMarketPrice } from './metaapi'
import { isMarketOpen } from './market-hours'
import { slComMinimo } from './source-risk-rules'

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
  sl: number | null
  tps: number[]
  source_key: string | null
  status: 'pending' | 'active' | 'closed'
  exits_done: number
  peak_pips: number
  created_at: string
  announce: boolean
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
    .in('channel_slug', T2T_SIGNAL_CHANNELS)
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
     */
    if ((p.direction === 'buy' && p.sl > tps[0]) || (p.direction === 'sell' && p.sl < tps[0])) {
      console.warn('[signal-tracker] stop do lado errado, não admitido:', m.id, p.symbol, p.direction, p.sl, tps[0])
      continue
    }
    novos.push({
      chat_message_id: m.id,
      channel_slug: m.channel_slug,
      source_key: t2tSourceKey(m.channel_slug, m.content),
      symbol: p.symbol,
      direction: p.direction,
      entry: p.entry ?? null,
      sl: p.sl,
      tps,
      status: 'pending',
      created_at: m.created_at,
      announce: Date.now() - Date.parse(m.created_at) <= MINUTOS_PARA_ANUNCIAR * 60_000,
    })
  }
  if (!novos.length) return 0
  const { error } = await admin.from('mtmcopy_signal_tracking').insert(novos)
  if (error) {
    console.warn('[signal-tracker] admissão falhou:', error.message)
    return 0
  }
  return novos.length
}

/** Publica o cartão em thread no sinal (idempotente pelo prefixo do próprio cartão). */
async function anunciar(linha: Linha, evento: SignalEvent, ctx: { price?: number | null; level?: number }) {
  if (!linha.announce) return
  const admin = getSupabaseAdmin()
  const { text } = lifecycleMessage(evento, {
    symbol: linha.symbol,
    direction: linha.direction,
    source: 'MTM',
    entry: linha.entry,
    price: ctx.price ?? null,
    level: ctx.level,
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
  await admin
    .from('chat_messages')
    .update({ outcome: { label: rotulo, pips: p, pct } })
    .eq('id', linha.chat_message_id)
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
    if (!precos.has(l.symbol)) precos.set(l.symbol, await referencePrice(l.symbol))
  }

  for (const l of linhas as Linha[]) {
    const price = precos.get(l.symbol) ?? null
    if (price == null || !(price > 0)) continue
    const pip = pipSizeForSymbol(l.symbol)
    const compra = l.direction === 'buy'

    // ── PENDENTE: à espera de a entrada encher ────────────────────────────────
    if (l.status === 'pending') {
      const idadeH = (Date.now() - Date.parse(l.created_at)) / 3600_000
      const encheu = l.entry == null || (compra ? price <= l.entry : price >= l.entry)
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
        await anunciar(l, 'entry_hit', { price })
        eventos.push(`entrada ${l.symbol} ${l.channel_slug}`)
        continue
      }
      if (idadeH >= HORAS_ATE_DESISTIR) {
        // Descartado não tem resultado: a entrada nunca encheu. Sem preço, o cartão sai sem números.
        await anunciar(l, 'discarded', { price: null })
        await gravarDesfecho(l, 0, 'Ideia descartada')
        eventos.push(`descartado ${l.symbol}`)
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
    if (lucroPips > l.peak_pips) {
      patch.peak_pips = lucroPips
      l.peak_pips = lucroPips
    }
    await admin.from('mtmcopy_signal_tracking').update(patch).eq('id', l.id)

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
       * Aqui o stop é SEMPRE o original: esta tabela regista o sinal como a fonte o publicou e
       * nada nela reescreve o `sl` (o break-even e o trailing vivem no motor, na posição real).
       * Por isso um toque neste stop é mesmo um stop loss, e não precisa da distinção que o
       * `stopFoiProtegido` faz do lado do webhook — onde o stop que chega já pode ter subido.
       */
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
    await anunciar(l, ultimo ? 'target_final' : 'partial', { price: alvo, level: proximo })
    if (ultimo) {
      await gravarDesfecho(l, pips, 'Alvo final')
      eventos.push(`alvo final ${l.symbol}${pips != null ? ` +${Math.round(pips)}p` : ''}`)
    } else {
      await admin
        .from('mtmcopy_signal_tracking')
        .update({ exits_done: proximo, updated_at: new Date().toISOString() })
        .eq('id', l.id)
      eventos.push(`alvo ${proximo} ${l.symbol}${pips != null ? ` +${Math.round(pips)}p` : ''}`)
    }
  }

  return { ran: true, admitidos, seguidos: linhas.length, eventos }
}
