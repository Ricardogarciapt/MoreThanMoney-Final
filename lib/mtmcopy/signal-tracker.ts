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
async function gravarDesfecho(linha: Linha, pips: number, rotulo: string) {
  const admin = getSupabaseAdmin()
  const pct = linha.entry && linha.entry > 0
    ? Math.round(((pips * pipSizeForSymbol(linha.symbol)) / linha.entry) * 100 * 100) / 100
    : null
  await admin
    .from('chat_messages')
    .update({ outcome: { label: rotulo, pips: Math.round(pips * 10) / 10, pct } })
    .eq('id', linha.chat_message_id)
  await admin
    .from('mtmcopy_signal_tracking')
    .update({
      status: 'closed',
      result_pips: Math.round(pips * 10) / 10,
      result_pct: pct,
      outcome_label: rotulo,
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', linha.id)
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
        await admin
          .from('mtmcopy_signal_tracking')
          .update({ status: 'active', entry_hit_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', l.id)
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
    if (lucroPips > l.peak_pips) {
      await admin
        .from('mtmcopy_signal_tracking')
        .update({ peak_pips: lucroPips, updated_at: new Date().toISOString() })
        .eq('id', l.id)
      l.peak_pips = lucroPips
    }

    const bateuSl = l.sl != null && (compra ? price <= l.sl : price >= l.sl)
    if (bateuSl) {
      const perda = ((compra ? (l.sl as number) - (l.entry ?? 0) : (l.entry ?? 0) - (l.sl as number)) / pip)
      // O cartão mede pela ENTRADA até ao preço que passamos: no stop é o SL, não a cotação do
      // instante — senão anunciava «+21 pips» numa trade que fechou em perda.
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
    const pips = (compra ? alvo - (l.entry ?? alvo) : (l.entry ?? alvo) - alvo) / pip
    await anunciar(l, ultimo ? 'target_final' : 'partial', { price: alvo, level: proximo })
    if (ultimo) {
      await gravarDesfecho(l, pips, 'Alvo final')
      eventos.push(`alvo final ${l.symbol} +${Math.round(pips)}p`)
    } else {
      await admin
        .from('mtmcopy_signal_tracking')
        .update({ exits_done: proximo, updated_at: new Date().toISOString() })
        .eq('id', l.id)
      eventos.push(`alvo ${proximo} ${l.symbol} +${Math.round(pips)}p`)
    }
  }

  return { ran: true, admitidos, seguidos: linhas.length, eventos }
}
