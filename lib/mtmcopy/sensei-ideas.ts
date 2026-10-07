import type { SupabaseClient } from '@supabase/supabase-js'
import type { SenseiParsedAlert } from './signal-parser'

export interface SenseiTradeIdea {
  id: string
  symbol: string
  timeframe: string | null
  direction: 'buy' | 'sell' | null
  entry: number | null
  sl: number | null
  tp: number[]
  raw_message: string | null
  /** Número sequencial da trade (para «acompanhamento de trade #X»). */
  tradeNumber: number | null
  /** message_id do Telegram da mensagem de entrada (para responder em thread). */
  telegramMessageId: number | null
  /** id da mensagem no chat do site (para thread). */
  chatMessageId: string | null
}

const IDEA_COLUMNS =
  'id, symbol, timeframe, direction, entry, sl, tp, raw_message, trade_number, telegram_message_id, chat_message_id'

function mapIdeaRow(data: Record<string, unknown>): SenseiTradeIdea {
  return {
    id: data.id as string,
    symbol: data.symbol as string,
    timeframe: (data.timeframe as string | null) ?? null,
    direction: (data.direction as 'buy' | 'sell' | null) ?? null,
    entry: data.entry != null ? Number(data.entry) : null,
    sl: data.sl != null ? Number(data.sl) : null,
    tp: tpFromDb(data.tp),
    raw_message: (data.raw_message as string | null) ?? null,
    tradeNumber: data.trade_number != null ? Number(data.trade_number) : null,
    telegramMessageId: data.telegram_message_id != null ? Number(data.telegram_message_id) : null,
    chatMessageId: (data.chat_message_id as string | null) ?? null,
  }
}

function tpFromDb(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
}

/**
 * ISOLAMENTO POR ESTRATÉGIA (199, 07/10): `sensei_trade_ideas` recebe ideias de VÁRIOS scanners
 * (Sensei, GoldKiller, MTM Scanner). Cada ideia leva a `estrategia` e todas as leituras/expirações
 * filtram por ela — uma ideia do GoldKiller nunca expira, activa nem empresta SL/TP a uma do Sensei.
 * Sem estratégia não se grava nem se procura nada (lib/sinais/identidade.ts).
 */
export async function saveSenseiTradeIdea(
  supabase: SupabaseClient,
  alert: SenseiParsedAlert,
  signalId: string | undefined,
  estrategia: string | null,
): Promise<{ id: string; tradeNumber: number | null } | null> {
  const symbol = alert.symbol
  if (!symbol || !estrategia) return null

  const tf = alert.timeframe ?? null

  let expireQ = supabase
    .from('sensei_trade_ideas')
    .update({ status: 'expired' })
    .eq('estrategia', estrategia)
    .eq('symbol', symbol)
    .eq('status', 'pending')
  expireQ = tf ? expireQ.eq('timeframe', tf) : expireQ.is('timeframe', null)
  await expireQ

  const { data, error } = await supabase
    .from('sensei_trade_ideas')
    .insert({
      symbol,
      timeframe: tf,
      direction: alert.direction,
      entry: alert.entry,
      sl: alert.sl,
      tp: alert.tp,
      status: 'pending',
      estrategia,
      source_signal_id: signalId ?? null,
      raw_message: alert.raw,
      raw_payload: { alert_type: 'idea', timeframe: tf, exchange: alert.exchange },
    })
    .select('id, trade_number')
    .single()

  if (error) {
    console.error('[sensei-ideas] save error:', error)
    return null
  }
  return {
    id: data.id as string,
    tradeNumber: data.trade_number != null ? Number(data.trade_number) : null,
  }
}

/** Guarda os message_id (Telegram + chat) na ideia, para os follow-ups responderem em thread. */
export async function attachSenseiIdeaMessages(
  supabase: SupabaseClient,
  ideaId: string,
  opts: { telegramMessageId?: number | null; chatMessageId?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (opts.telegramMessageId != null) patch.telegram_message_id = opts.telegramMessageId
  if (opts.chatMessageId != null) patch.chat_message_id = opts.chatMessageId
  if (!Object.keys(patch).length) return
  await supabase.from('sensei_trade_ideas').update(patch).eq('id', ideaId)
}

/**
 * A ideia de uma ENTRADA, pelo id do registo do webhook (`tradingview_signals.id`): é o
 * `source_signal_id` (entrada que criou a ideia) ou o `trigger_signal_id` (entrada que a activou).
 * Substitui a procura pelo ticker + preço + «a mais recente» (199, 07/10): o seguimento chega aqui
 * já ligado à SUA entrada (lib/sinais/identidade.ts › ligarSeguimento). Mesma estratégia ou nada.
 */
export async function ideiaDaEntrada(
  supabase: SupabaseClient,
  entradaId: string | null | undefined,
  estrategia: string | null,
): Promise<SenseiTradeIdea | null> {
  if (!entradaId || !estrategia) return null
  const { data, error } = await supabase
    .from('sensei_trade_ideas')
    .select(IDEA_COLUMNS)
    .eq('estrategia', estrategia)
    .or(`source_signal_id.eq.${entradaId},trigger_signal_id.eq.${entradaId}`)
    .limit(2)
  if (error || !data?.length) return null
  // Duas ideias para a mesma entrada não deviam existir; se existirem é ambíguo e não se escolhe.
  if (data.length > 1) return null
  return mapIdeaRow(data[0] as Record<string, unknown>)
}

/**
 * Cria (ou devolve) uma ideia ATIVADA para um ENTRY/entry_trigger sem ideia prévia,
 * chaveada pelo preço de entrada — para os follow-ups se associarem e responderem em thread.
 */
export async function createActivatedSenseiIdea(
  supabase: SupabaseClient,
  alert: SenseiParsedAlert,
  signalId: string | undefined,
  estrategia: string | null,
): Promise<SenseiTradeIdea | null> {
  if (!alert.symbol || !estrategia) return null
  const { data, error } = await supabase
    .from('sensei_trade_ideas')
    .insert({
      symbol: alert.symbol,
      timeframe: alert.timeframe ?? null,
      direction: alert.direction,
      entry: alert.entry,
      sl: alert.sl,
      tp: alert.tp,
      status: 'activated',
      estrategia,
      activated_at: new Date().toISOString(),
      source_signal_id: signalId ?? null,
      trigger_signal_id: signalId ?? null,
      raw_message: alert.raw,
      raw_payload: { alert_type: 'entry_trigger', timeframe: alert.timeframe ?? null, exchange: alert.exchange },
    })
    .select(IDEA_COLUMNS)
    .single()
  if (error || !data) {
    console.error('[sensei-ideas] createActivated error:', error)
    return null
  }
  return mapIdeaRow(data as Record<string, unknown>)
}

/**
 * Ideia pendente que uma activação (`entry_trigger`) completa — SÓ da mesma estratégia. Duas
 * pendentes da mesma estratégia e símbolo não deviam coexistir (a nova expira a anterior); se
 * coexistirem, é ambíguo e não se funde nenhuma.
 */
export async function findPendingSenseiIdea(
  supabase: SupabaseClient,
  symbol: string,
  timeframe: string | null | undefined,
  estrategia: string | null,
): Promise<SenseiTradeIdea | null> {
  if (!estrategia) return null
  let q = supabase
    .from('sensei_trade_ideas')
    .select(IDEA_COLUMNS)
    .eq('estrategia', estrategia)
    .eq('symbol', symbol)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(2)

  if (timeframe) q = q.eq('timeframe', timeframe)

  const { data, error } = await q
  if (error || !data?.length || data.length > 1) return null

  return mapIdeaRow(data[0] as Record<string, unknown>)
}

export async function activateSenseiTradeIdea(
  supabase: SupabaseClient,
  ideaId: string,
  triggerSignalId?: string,
): Promise<void> {
  await supabase
    .from('sensei_trade_ideas')
    .update({
      status: 'activated',
      activated_at: new Date().toISOString(),
      trigger_signal_id: triggerSignalId ?? null,
    })
    .eq('id', ideaId)
    .eq('status', 'pending')
}

/** Funde Entry Alert (activação) com ideia pendente (Entry Buy/Sell). */
export function mergeSenseiTriggerWithIdea(
  trigger: SenseiParsedAlert,
  idea: SenseiTradeIdea | null,
): SenseiParsedAlert {
  if (!idea) return trigger

  return {
    ...trigger,
    symbol: trigger.symbol ?? idea.symbol,
    direction: trigger.direction ?? idea.direction,
    entry: trigger.entry ?? idea.entry,
    sl: trigger.sl ?? idea.sl,
    tp: trigger.tp.length > 0 ? trigger.tp : idea.tp,
    timeframe: trigger.timeframe ?? idea.timeframe,
    orderType: (trigger.entry ?? idea.entry) != null ? 'limit' : trigger.orderType,
    alertType: 'entry_trigger',
    raw: [idea.raw_message, trigger.raw].filter(Boolean).join('\n---\n'),
  }
}
