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

export async function saveSenseiTradeIdea(
  supabase: SupabaseClient,
  alert: SenseiParsedAlert,
  signalId?: string,
): Promise<{ id: string; tradeNumber: number | null } | null> {
  const symbol = alert.symbol
  if (!symbol) return null

  const tf = alert.timeframe ?? null

  let expireQ = supabase
    .from('sensei_trade_ideas')
    .update({ status: 'expired' })
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
 * Ideia ativa/pendente mais recente para um follow-up (TP/BE/SL).
 * Liga o acompanhamento à entrada correspondente (entry, número, message_id).
 */
export async function findActiveSenseiIdeaForFollowup(
  supabase: SupabaseClient,
  symbol: string,
  timeframe?: string | null,
  direction?: 'buy' | 'sell' | null,
): Promise<SenseiTradeIdea | null> {
  let q = supabase
    .from('sensei_trade_ideas')
    .select(IDEA_COLUMNS)
    .eq('symbol', symbol)
    .in('status', ['activated', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)

  if (timeframe) q = q.eq('timeframe', timeframe)
  if (direction) q = q.eq('direction', direction)

  const { data, error } = await q.maybeSingle()
  if (error || !data) return null
  return mapIdeaRow(data as Record<string, unknown>)
}

export async function findPendingSenseiIdea(
  supabase: SupabaseClient,
  symbol: string,
  timeframe?: string | null,
): Promise<SenseiTradeIdea | null> {
  let q = supabase
    .from('sensei_trade_ideas')
    .select(IDEA_COLUMNS)
    .eq('symbol', symbol)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)

  if (timeframe) q = q.eq('timeframe', timeframe)

  const { data, error } = await q.maybeSingle()
  if (error || !data) return null

  return mapIdeaRow(data as Record<string, unknown>)
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
