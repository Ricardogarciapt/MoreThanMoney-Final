import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { MTMcopierConnection, SignalLogStatus } from './types'

export async function getActiveConnections(): Promise<MTMcopierConnection[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('mtmcopy_connections')
    .select('*')
    .eq('is_active', true)

  if (error) {
    console.error('[mtmcopy] erro ao obter ligações:', error.message)
    return []
  }
  return (data ?? []) as MTMcopierConnection[]
}

/** Ligações ligadas ao MT5 (activas ou pausadas) — para matching de fonte de sinais */
export async function getCopyConnections(): Promise<MTMcopierConnection[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('mtmcopy_connections')
    .select('*')
    .neq('mt5_status', 'disconnected')

  if (error) {
    console.error('[mtmcopy] erro ao obter ligações:', error.message)
    return []
  }
  return (data ?? []) as MTMcopierConnection[]
}

export async function hasRecentDuplicate(
  connectionId: string,
  rawMessage: string,
  telegramMessageId?: number,
): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const { data: byRaw } = await supabase
    .from('mtmcopy_signal_log')
    .select('id')
    .eq('connection_id', connectionId)
    .eq('raw_message', rawMessage)
    .gte('created_at', since)
    .limit(1)

  if (byRaw?.length) return true

  if (telegramMessageId != null) {
    const marker = `tg:${telegramMessageId}`
    const { data: byTg } = await supabase
      .from('mtmcopy_signal_log')
      .select('id')
      .eq('connection_id', connectionId)
      .ilike('detail', `%${marker}%`)
      .gte('created_at', since)
      .limit(1)
    if (byTg?.length) return true
  }

  return false
}

/** Evita executar o mesmo sinal Telegram duas vezes (contas provider MTM). */
export async function hasRecentDuplicateGlobal(
  rawMessage: string,
  telegramMessageId?: number,
): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const { data: byRaw } = await supabase
    .from('mtmcopy_signal_log')
    .select('id')
    .eq('raw_message', rawMessage)
    .gte('created_at', since)
    .limit(1)

  if (byRaw?.length) return true

  if (telegramMessageId != null) {
    const marker = `tg:${telegramMessageId}`
    const { data: byTg } = await supabase
      .from('mtmcopy_signal_log')
      .select('id')
      .ilike('detail', `%${marker}%`)
      .gte('created_at', since)
      .limit(1)
    if (byTg?.length) return true
  }

  return false
}

export async function countExecutedToday(connectionId: string): Promise<number> {
  const supabase = getSupabaseAdmin()
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('mtmcopy_signal_log')
    .select('id', { count: 'exact', head: true })
    .eq('connection_id', connectionId)
    .eq('status', 'executed')
    .gte('created_at', start.toISOString())

  return count ?? 0
}

export async function markConnectionStatus(
  connectionId: string,
  patch: Partial<Pick<MTMcopierConnection, 'telegram_status' | 'mt5_status' | 'last_error' | 'last_signal_at'>>,
) {
  const supabase = getSupabaseAdmin()
  await supabase
    .from('mtmcopy_connections')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', connectionId)
}

export async function logMtmcopySignal(entry: {
  user_id: string
  connection_id?: string | null
  channel_key?: string | null
  telegram_message_id?: number | null
  symbol?: string | null
  direction?: 'buy' | 'sell' | null
  entry?: number | null
  sl?: number | null
  tp?: number | null
  lot?: number | null
  status: SignalLogStatus
  detail?: string | null
  raw_message?: string | null
}) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('mtmcopy_signal_log').insert(entry)
  if (error) console.error('[mtmcopy] erro ao registar sinal:', error.message)
}
