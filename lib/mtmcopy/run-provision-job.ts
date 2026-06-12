import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { MtmcopyCopyMethod } from '@/lib/mtmcopy/copy-methods'
import { provisionMasterAccount, provisionSlaveAccount } from '@/lib/mtmcopy/metaapi-provision'
import { getMtmcopySubscription } from '@/lib/mtmcopy/subscription'
import type { MTMcopierConnection, MtmcopyAccountRole, MtmcopySenderMode } from '@/lib/mtmcopy/types'
import { getMasterConnection, resolveStrategyIdsForConnectionAsync } from '@/lib/mtmcopy/user-copy-context'

const supabaseAdmin = getSupabaseAdmin()

export interface RunProvisionJobInput {
  userId: string
  connectionId: string
  connection: MTMcopierConnection
  accountRole: MtmcopyAccountRole
  senderMode: MtmcopySenderMode
  copyMethod: MtmcopyCopyMethod
  login: string
  password: string
  server: string
  platform: 'mt4' | 'mt5'
  label: string
  userType?: string | null
  lotMultiplier: number
  reverseSignals?: boolean
  symbolsWhitelist?: string[] | null
  copySl?: boolean
  copyTp?: boolean
  copyfactoryStrategyPick?: string | null
  normalizedGroups: Array<'premium' | 'trade_ideas'>
}

/** Provisionamento MetaAPI + CopyFactory — tem de correr em await (não after). */
export async function runProvisionJob(input: RunProvisionJobInput): Promise<MTMcopierConnection> {
  const {
    userId,
    connectionId,
    connection,
    accountRole,
    senderMode,
    copyMethod,
    login,
    password,
    server,
    platform,
    label,
    userType,
    lotMultiplier,
    reverseSignals,
    symbolsWhitelist,
    copySl,
    copyTp,
    copyfactoryStrategyPick,
    normalizedGroups,
  } = input

  const userLabel = `MTMcopier · ${label}`

  const { data: freshConnections } = await supabaseAdmin
    .from('mtmcopy_connections')
    .select('*')
    .eq('user_id', userId)
    .neq('mt5_status', 'disconnected')

  const masterConn = getMasterConnection((freshConnections ?? []) as MTMcopierConnection[])

  const strategyIdsForSlave =
    accountRole === 'slave'
      ? await resolveStrategyIdsForConnectionAsync(
          {
            account_role: accountRole,
            sender_mode: senderMode,
            copy_method: copyMethod,
            copyfactory_strategy_pick: copyfactoryStrategyPick ?? null,
            telegram_group: normalizedGroups[0] ?? null,
            telegram_groups: normalizedGroups,
            copyfactory_strategy_id: connection.copyfactory_strategy_id,
          },
          masterConn,
        )
      : []

  const result =
    accountRole === 'master'
      ? await provisionMasterAccount({
          login,
          password,
          server,
          platform,
          userId,
          userLabel,
        })
        : await provisionSlaveAccount({
            login,
            password,
            server,
            platform,
            userId,
            userLabel,
            lotMultiplier,
            reverse: reverseSignals ?? connection.reverse_signals,
            symbolWhitelist: symbolsWhitelist ?? connection.symbols_whitelist,
            senderMode,
            copyMethod,
            strategyId: masterConn?.copyfactory_strategy_id ?? null,
            strategyIds: strategyIdsForSlave.length ? strategyIdsForSlave : undefined,
            copySl: copySl ?? connection.copy_sl ?? true,
            copyTp: copyTp ?? connection.copy_tp ?? true,
            skipPendingOrders: copyMethod === 'master_slave' ? false : undefined,
          })

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (result.success && result.accountId) {
    patch.metaapi_account_id = result.accountId
    patch.mt5_status = 'connected'
    const subNow = await getMtmcopySubscription(userId, userType)
    patch.is_active = subNow.active
    patch.last_error = null

    if (accountRole === 'master' && result.strategyId) {
      patch.copyfactory_strategy_id = result.strategyId
      patch.copyfactory_subscribed = false
      patch.telegram_status = 'connected'
    } else {
      patch.copyfactory_subscribed = result.copyfactorySubscribed ?? false
      patch.telegram_status = connection.telegram_channel ? connection.telegram_status : 'connected'
    }

    if (senderMode === 'master_account' && accountRole === 'slave') {
      await supabaseAdmin
        .from('mtmcopy_connections')
        .update({ sender_mode: 'master_account' })
        .eq('user_id', userId)
        .eq('account_role', 'master')
    }
  } else {
    patch.mt5_status = 'error'
    patch.last_error = result.error ?? 'Falha ao ligar conta via MetaAPI'
    if (result.accountId) patch.metaapi_account_id = result.accountId
    if (result.strategyId) patch.copyfactory_strategy_id = result.strategyId
  }

  const { data: updated } = await supabaseAdmin
    .from('mtmcopy_connections')
    .update(patch)
    .eq('id', connectionId)
    .select()
    .single()

  if (senderMode === 'master_account' && accountRole === 'master' && result.strategyId) {
    await supabaseAdmin
      .from('mtmcopy_connections')
      .update({ sender_mode: 'master_account' })
      .eq('user_id', userId)
      .neq('mt5_status', 'disconnected')
  }

  return (updated ?? { ...connection, ...patch }) as MTMcopierConnection
}
