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

let copyConnectionsCache: { data: MTMcopierConnection[]; at: number } | null = null
const COPY_CONNECTIONS_CACHE_MS = 8_000

/** Ligações ligadas ao MT5 (activas ou pausadas) — para matching de fonte de sinais */
export async function getCopyConnections(): Promise<MTMcopierConnection[]> {
  if (copyConnectionsCache && Date.now() - copyConnectionsCache.at < COPY_CONNECTIONS_CACHE_MS) {
    return copyConnectionsCache.data
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('mtmcopy_connections')
    .select('*')
    .neq('mt5_status', 'disconnected')

  if (error) {
    console.error('[mtmcopy] erro ao obter ligações:', error.message)
    return copyConnectionsCache?.data ?? []
  }
  const rows = (data ?? []) as MTMcopierConnection[]
  copyConnectionsCache = { data: rows, at: Date.now() }
  return rows
}

export function invalidateCopyConnectionsCache() {
  copyConnectionsCache = null
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

/**
 * Duplicado do PROVIDER (conta mestre). Só considera EXECUÇÕES anteriores do provider
 * (connection_id IS NULL = conta sistema/mestre, status='executed'). NÃO conta as pernas
 * irmãs dos SUBSCRITORES do mesmo sinal (received / execuções com connection_id) que se
 * registam quase em simultâneo — senão o provider salta-se a si próprio numa corrida
 * (bug: um subscritor loga tg:<id> primeiro e o provider vê-o como "duplicado").
 */
export async function hasRecentProviderDuplicate(
  rawMessage: string,
  telegramMessageId?: number,
): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const { data: byRaw } = await supabase
    .from('mtmcopy_signal_log')
    .select('id')
    .is('connection_id', null)
    .eq('status', 'executed')
    .eq('raw_message', rawMessage)
    .gte('created_at', since)
    .limit(1)
  if (byRaw?.length) return true

  if (telegramMessageId != null) {
    const { data: byTg } = await supabase
      .from('mtmcopy_signal_log')
      .select('id')
      .is('connection_id', null)
      .eq('status', 'executed')
      .ilike('detail', `%tg:${telegramMessageId}%`)
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

/** TP1 do último sinal executado na conta provider (para SL Exit 1 após broker fechar leg1). */
export async function getLatestProviderSignalTp(
  metaapiAccountId: string,
  symbol: string,
  tpIndex: 1 | 2 | 3 = 1,
): Promise<number | null> {
  const supabase = getSupabaseAdmin()
  const { data: conn } = await supabase
    .from('mtmcopy_connections')
    .select('id')
    .eq('metaapi_account_id', metaapiAccountId)
    .limit(1)
    .maybeSingle()

  if (!conn?.id) return null

  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const { data: rows } = await supabase
    .from('mtmcopy_signal_log')
    .select('tp, raw_message')
    .eq('connection_id', conn.id)
    .eq('status', 'executed')
    .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(15)

  for (const row of rows ?? []) {
    const raw = row.raw_message ?? ''
    if (sym && !raw.toUpperCase().includes(sym) && !raw.toUpperCase().includes('XAU')) continue

    if (tpIndex === 1 && row.tp != null && row.tp > 0) return row.tp

    const tpMatch = raw.match(
      new RegExp(`\\bTP${tpIndex}\\s*[:=]?\\s*([0-9]+(?:\\.[0-9]+)?)`, 'i'),
    )
    if (tpMatch) {
      const n = parseFloat(tpMatch[1])
      if (Number.isFinite(n) && n > 0) return n
    }

    const tps = [...raw.matchAll(/\bTP\s*([0-9]+(?:\.[0-9]+)?)/gi)]
      .map((m) => parseFloat(m[1]))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (tps.length >= tpIndex) return tps[tpIndex - 1]!
  }

  return null
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
