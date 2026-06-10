import type { MtmcopyChannelKey } from './channel-context'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { ParsedSignal } from './signal-parser'
import type { OrderResult } from './metaapi'
import type { MtmChannelProvider } from './provider-accounts'
import type { SignalLogStatus } from './types'
import { logMtmcopySignal } from './db'

let cachedSystemUserId: string | null = null

/** Utilizador sistema para logs de provider (admin). */
export async function getMtmSystemUserId(): Promise<string> {
  if (cachedSystemUserId) return cachedSystemUserId

  const envId = process.env.MTMCOPY_SYSTEM_USER_ID?.trim()
  if (envId) {
    cachedSystemUserId = envId
    return envId
  }

  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'admin')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  cachedSystemUserId = data?.id ?? '00000000-0000-0000-0000-000000000000'
  return cachedSystemUserId
}

export async function logProviderSignalEvent(opts: {
  channel: MtmcopyChannelKey
  provider?: MtmChannelProvider | null
  signal?: ParsedSignal | null
  symbol?: string | null
  raw: string
  telegramMessageId?: number
  status: SignalLogStatus
  detail: string
  lot?: number | null
  result?: OrderResult
}) {
  const userId = await getMtmSystemUserId()
  const tgRef = opts.telegramMessageId != null ? `tg:${opts.telegramMessageId}` : ''
  const channelLabel = opts.channel === 'unknown' ? 'desconhecido' : opts.channel
  const providerTag = opts.provider?.tag ?? 'MTM Provider'

  await logMtmcopySignal({
    user_id: userId,
    connection_id: null,
    channel_key: opts.channel,
    telegram_message_id: opts.telegramMessageId ?? null,
    symbol: opts.symbol ?? opts.signal?.symbol ?? null,
    direction: opts.signal?.direction ?? null,
    entry: opts.signal?.entry ?? null,
    sl: opts.signal?.sl ?? null,
    tp: opts.signal?.tp?.[0] ?? null,
    lot: opts.lot ?? null,
    status: opts.status,
    detail: `[${channelLabel}] ${providerTag} · ${opts.detail} ${tgRef}`.trim(),
    raw_message: opts.raw,
  })
}

export function formatExecutionDetail(
  result: OrderResult,
  orderLabel: string,
  lot: number,
): string {
  if (result.success) {
    return `${orderLabel} · #${result.orderId ?? '?'} · ${result.brokerSymbol ?? ''} · lot ${lot}`.trim()
  }
  return result.error ?? 'Erro na execução'
}
