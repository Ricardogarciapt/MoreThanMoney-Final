/**
 * Sincronização global MTMcopier: Supabase ↔ MetaAPI ↔ CopyFactory ↔ rotas provider.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { connectionCopyMethod } from './copy-limits'
import { syncConnectionCopyFactory } from './connection-sync'
import {
  isTelegramChannelErrorMessage,
  repairStrategyConnectionIfNeeded,
} from './connection-sanitize'
import { ensureMtmProviderStrategyScaling, getSubscriberConfiguration } from './copyfactory'
import { getAccountSnapshot, isMetaApiConfigured } from './metaapi'
import { syncChannelProvidersFromRoutes, normalizeProviderRoutes } from './provider-routes'
import {
  getSignalSourcesConfig,
  saveSignalSourcesConfig,
} from './signal-sources-config'
import type { MTMcopierConnection } from './types'

export interface ConnectionSyncResult {
  connection_id: string
  user_id: string
  email: string | null
  copy_method: string
  ok: boolean
  actions: string[]
  error?: string
}

export interface SyncWarning {
  connection_id: string
  user_id: string
  kind: string
  detail: string
}

const PROVISIONING_BASE =
  process.env.METAAPI_PROVISIONING_URL ??
  'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

/**
 * Lê todos os accountIds existentes no MetaAPI numa só chamada.
 * Devolve `null` se a listagem falhar ou vier vazia — assim NUNCA se despromove
 * uma conta por engano quando a API está indisponível (evita falsos disconnects).
 */
async function fetchExistingMetaApiAccountIds(): Promise<Set<string> | null> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return null
  try {
    const res = await fetch(`${PROVISIONING_BASE}/users/current/accounts?limit=1000`, {
      headers: { 'auth-token': token, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as unknown
    const items = (Array.isArray(data) ? data : ((data as { items?: unknown[] })?.items ?? [])) as Array<{
      _id?: string
      id?: string
    }>
    if (!items.length) return null
    const ids = new Set<string>()
    for (const a of items) {
      const id = a._id ?? a.id
      if (id) ids.add(id)
    }
    return ids.size ? ids : null
  } catch {
    return null
  }
}

export interface SystemSyncResult {
  ok: boolean
  metaapi_configured: boolean
  provider: {
    routes_repaired: boolean
    routes_count: number
    scaling: Array<{ strategy_id: string; account_id: string; ok: boolean; error?: string }>
  }
  connections: ConnectionSyncResult[]
  warnings: SyncWarning[]
  summary: {
    total: number
    ok: number
    failed: number
  }
}

export async function runMtmcopySystemSync(opts?: {
  forceCopyFactory?: boolean
  userId?: string
  connectionId?: string
}): Promise<SystemSyncResult> {
  const supabase = getSupabaseAdmin()
  const metaapiConfigured = isMetaApiConfigured()
  const force = opts?.forceCopyFactory !== false

  const providerResult = {
    routes_repaired: false,
    routes_count: 0,
    scaling: [] as SystemSyncResult['provider']['scaling'],
  }

  try {
    const config = await getSignalSourcesConfig()
    const repairedRoutes = normalizeProviderRoutes(config)
    providerResult.routes_count = repairedRoutes.length

    const channels =
      config.enabled_channels?.length > 0
        ? config.enabled_channels
        : (['premium-signals', 'trade-ideas'] as const)

    const routesJson = JSON.stringify(config.provider_routes ?? [])
    const repairedJson = JSON.stringify(repairedRoutes)
    const needsSave = routesJson !== repairedJson || !config.provider_routes?.length

    if (needsSave) {
      await saveSignalSourcesConfig({
        ...config,
        enabled_channels: [...channels],
        provider_routes: repairedRoutes,
        channel_providers: syncChannelProvidersFromRoutes(repairedRoutes),
        provider_strategy_id:
          config.provider_strategy_id ??
          repairedRoutes.find((r) => r.strategy_id)?.strategy_id ??
          null,
        provider_account_id:
          config.provider_account_id ??
          repairedRoutes.find((r) => r.account_id)?.account_id ??
          null,
      })
      providerResult.routes_repaired = true
    }

    if (metaapiConfigured) {
      for (const route of repairedRoutes) {
        if (route.enabled === false || !route.strategy_id?.trim() || !route.account_id?.trim()) {
          continue
        }
        const scaled = await ensureMtmProviderStrategyScaling({
          strategyId: route.strategy_id.trim(),
          accountId: route.account_id.trim(),
          name: route.tag ?? route.label ?? 'MTM Provider',
          description: `MTM Auto · ${route.sender_channel ?? 'provider'}`,
          copyTakeProfit: route.sender_channel !== 'premium-signals',
        })
        providerResult.scaling.push({
          strategy_id: route.strategy_id.trim(),
          account_id: route.account_id.trim(),
          ok: scaled.ok,
          error: scaled.error,
        })
      }
    }
  } catch (err) {
    console.error('[system-sync] provider:', err)
  }

  let connQuery = supabase
    .from('mtmcopy_connections')
    .select('*')
    .neq('mt5_status', 'disconnected')

  if (opts?.connectionId) connQuery = connQuery.eq('id', opts.connectionId)
  else if (opts?.userId) connQuery = connQuery.eq('user_id', opts.userId)

  const { data: connections } = await connQuery.order('updated_at', { ascending: false })

  const userIds = [...new Set((connections ?? []).map((c) => c.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, username')
    .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  // Listagem única de contas MetaAPI existentes (para detetar contas removidas sem N chamadas).
  const existingAccountIds = metaapiConfigured ? await fetchExistingMetaApiAccountIds() : null

  const connectionResults: ConnectionSyncResult[] = []
  const warnings: SyncWarning[] = []

  for (const raw of connections ?? []) {
    const conn = raw as MTMcopierConnection
    const profile = profileMap.get(conn.user_id)
    const userLabel =
      profile?.full_name || profile?.username || profile?.email || `MTM-${conn.user_id.slice(0, 8)}`
    const method = connectionCopyMethod(conn)
    const actions: string[] = []
    let ok = true
    let error: string | undefined

    try {
      if (method === 'strategy') {
        const patch: Record<string, unknown> = {
          telegram_channel: null,
          telegram_status: 'connected',
          updated_at: new Date().toISOString(),
        }
        if (isTelegramChannelErrorMessage(conn.last_error)) {
          patch.last_error = null
          actions.push('cleared_telegram_error')
        }

        const shouldResync =
          force &&
          conn.metaapi_account_id &&
          conn.mt5_status === 'connected' &&
          conn.is_active

        if (shouldResync) {
          const sync = await syncConnectionCopyFactory(conn, userLabel)
          if (sync.ok) {
            patch.copyfactory_subscribed = true
            patch.last_error = null
            actions.push('copyfactory_resync')
          } else {
            ok = false
            error = sync.error
            patch.copyfactory_subscribed = false
            patch.last_error = sync.error ?? 'Falha CopyFactory'
            actions.push('copyfactory_failed')
          }
        } else if (conn.is_active && !conn.copyfactory_subscribed && conn.metaapi_account_id && conn.mt5_status === 'connected') {
          await repairStrategyConnectionIfNeeded(supabase, conn, userLabel, { forceResync: true })
          actions.push('strategy_repair')
        } else if (!conn.is_active && conn.copyfactory_subscribed) {
          // Pausada mas ainda subscrita → auto-cura (remove CopyFactory), conta fica p/ estatísticas.
          await repairStrategyConnectionIfNeeded(supabase, conn, userLabel)
          actions.push('strategy_paused_unsub')
        }

        if (Object.keys(patch).length > 1) {
          await supabase.from('mtmcopy_connections').update(patch).eq('id', conn.id)
        }
      } else if (method === 'master_slave' && conn.account_role !== 'master') {
        if (force && conn.metaapi_account_id && conn.mt5_status === 'connected' && conn.is_active) {
          const sync = await syncConnectionCopyFactory(conn, userLabel)
          if (sync.ok) {
            await supabase
              .from('mtmcopy_connections')
              .update({
                copyfactory_subscribed: true,
                last_error: null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', conn.id)
            actions.push('master_slave_resync')
          } else {
            ok = false
            error = sync.error
            actions.push('master_slave_failed')
          }
        }
      }

      if (
        metaapiConfigured &&
        conn.metaapi_account_id &&
        conn.mt5_status === 'connected'
      ) {
        const snap = await getAccountSnapshot(conn.metaapi_account_id)
        const updates: Record<string, unknown> = {}

        if (conn.baseline_balance == null && snap?.balance != null) {
          updates.baseline_balance = snap.balance
          actions.push('baseline_set')
        }

        if (method === 'strategy' && conn.copyfactory_subscribed && force) {
          const cf = await getSubscriberConfiguration(conn.metaapi_account_id)
          const subs = (cf.data?.subscriptions as Array<{ strategyId?: string }>) ?? []
          const expected = conn.copyfactory_strategy_pick?.trim()
          const hasExpected = !expected || subs.some((s) => s.strategyId === expected)
          if (cf.ok && !hasExpected && expected) {
            const sync = await syncConnectionCopyFactory(conn, userLabel)
            if (sync.ok) actions.push('cf_strategy_verified')
            else {
              ok = false
              error = sync.error
            }
          }
        }

        if (Object.keys(updates).length) {
          updates.updated_at = new Date().toISOString()
          await supabase.from('mtmcopy_connections').update(updates).eq('id', conn.id)
        }
      }

      // --- Reconciliação de estado (aditiva, conservadora): BD ↔ realidade ---
      const recPatch: Record<string, unknown> = {}

      // (a) Linha-fantasma: marcada como ligada mas sem conta MetaAPI associada.
      if (!conn.metaapi_account_id && conn.mt5_status === 'connected') {
        recPatch.mt5_status = 'pending'
        recPatch.is_active = false
        if (!conn.last_error) {
          recPatch.last_error = 'Ligação incompleta — sem conta MT5 associada.'
        }
        actions.push('ghost_normalized')
      }

      // (b) Conta removida no MetaAPI → despromover (só quando a listagem é fiável).
      if (
        conn.metaapi_account_id &&
        existingAccountIds &&
        !existingAccountIds.has(conn.metaapi_account_id)
      ) {
        recPatch.mt5_status = 'disconnected'
        recPatch.is_active = false
        recPatch.copyfactory_subscribed = false
        recPatch.last_error = 'Conta removida no MetaApi.'
        actions.push('account_gone')
      }

      // (c) Reconciliar copyfactory_subscribed com o CopyFactory VIVO — nos dois sentidos,
      //     independentemente de is_active (foi o que deixou contas subscritas marcadas como não).
      if (
        conn.copyfactory_strategy_pick &&
        conn.metaapi_account_id &&
        (!existingAccountIds || existingAccountIds.has(conn.metaapi_account_id)) &&
        recPatch.mt5_status == null
      ) {
        const cf = await getSubscriberConfiguration(conn.metaapi_account_id)
        if (cf.ok) {
          const subs =
            (cf.data?.subscriptions as Array<{
              strategyId?: string
              tradeSizeScaling?: { mode?: string; tradeVolume?: number }
            }>) ?? []
          const pick = conn.copyfactory_strategy_pick.trim()
          const live = subs.find((s) => s.strategyId === pick)
          const actuallySubscribed = Boolean(live)
          if (actuallySubscribed !== Boolean(conn.copyfactory_subscribed)) {
            recPatch.copyfactory_subscribed = actuallySubscribed
            actions.push(actuallySubscribed ? 'cf_flag_synced_true' : 'cf_flag_synced_false')
          }
          // Aviso (report-only) de divergência de lote BD vs CopyFactory vivo — não altera trading.
          const scaling = live?.tradeSizeScaling
          if (scaling?.mode === 'fixedVolume' && conn.lot_mode === 'fixed') {
            if (Number(conn.lot_value) !== Number(scaling.tradeVolume)) {
              warnings.push({
                connection_id: conn.id,
                user_id: conn.user_id,
                kind: 'lot_value_mismatch',
                detail: `BD fixo ${conn.lot_value} vs CopyFactory ${scaling.tradeVolume}`,
              })
            }
          } else if (scaling?.mode === 'fixedVolume' && conn.lot_mode !== 'fixed') {
            warnings.push({
              connection_id: conn.id,
              user_id: conn.user_id,
              kind: 'lot_mode_mismatch',
              detail: `BD ${conn.lot_mode} ${conn.lot_value} vs CopyFactory fixo ${scaling.tradeVolume}`,
            })
          }
        }
      }

      if (Object.keys(recPatch).length) {
        recPatch.updated_at = new Date().toISOString()
        await supabase.from('mtmcopy_connections').update(recPatch).eq('id', conn.id)
      }
    } catch (err) {
      ok = false
      error = err instanceof Error ? err.message : 'Erro de sincronização'
      actions.push('exception')
    }

    connectionResults.push({
      connection_id: conn.id,
      user_id: conn.user_id,
      email: profile?.email ?? null,
      copy_method: method,
      ok,
      actions,
      error,
    })
  }

  const okCount = connectionResults.filter((r) => r.ok).length

  return {
    ok: okCount === connectionResults.length && providerResult.scaling.every((s) => s.ok),
    metaapi_configured: metaapiConfigured,
    provider: providerResult,
    connections: connectionResults,
    warnings,
    summary: {
      total: connectionResults.length,
      ok: okCount,
      failed: connectionResults.length - okCount,
    },
  }
}
