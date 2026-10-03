import { type NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { syncConnectionCopyFactory } from '@/lib/mtmcopy/connection-sync'
import { ensureCopyTraderStrategy } from '@/lib/mtmcopy/copyfactory'
import type { MTMcopierConnection } from '@/lib/mtmcopy/types'

const supabase = getSupabaseAdmin()

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const { master_account_id, slave_account_id, mt5_login } = body as {
    master_account_id?: string
    slave_account_id?: string
    mt5_login?: string
  }

  let master: MTMcopierConnection | null = null
  let slaves: MTMcopierConnection[] = []

  if (master_account_id) {
    const { data } = await supabase
      .from('mtmcopy_connections')
      .select('*')
      .eq('metaapi_account_id', master_account_id.trim())
      .eq('account_role', 'master')
      .maybeSingle()
    master = (data as MTMcopierConnection) ?? null
  }

  if (!master && mt5_login) {
    const login = String(mt5_login).replace(/\D/g, '')
    const { data } = await supabase
      .from('mtmcopy_connections')
      .select('*')
      .or(`mt5_login.eq.${login},mt5_login_last4.eq.${login.slice(-4)}`)
      .neq('mt5_status', 'disconnected')
    const rows = (data ?? []) as MTMcopierConnection[]
    master = rows.find((c) => c.account_role === 'master') ?? null
    if (!master) {
      slaves = rows.filter((c) => (c.account_role ?? 'slave') === 'slave')
    }
  }

  if (master) {
    const { data: userSlaves } = await supabase
      .from('mtmcopy_connections')
      .select('*')
      .eq('user_id', master.user_id)
      .eq('account_role', 'slave')
      .neq('mt5_status', 'disconnected')
    slaves = (userSlaves ?? []) as MTMcopierConnection[]
    if (slave_account_id) {
      slaves = slaves.filter((s) => s.metaapi_account_id === slave_account_id.trim())
    }
  }

  if (!master?.copyfactory_strategy_id || !master.metaapi_account_id) {
    return NextResponse.json(
      { ok: false, error: 'Conta mestre não encontrada ou sem estratégia CopyFactory' },
      { status: 404 },
    )
  }

  const strat = await ensureCopyTraderStrategy({
    strategyId: master.copyfactory_strategy_id,
    accountId: master.metaapi_account_id,
    name: `MTMcopier · mestre ****${master.mt5_login_last4 ?? '?'}`,
    description: 'Copy trader · limit, stop e market (reparo admin)',
  })

  if (!strat.ok) {
    return NextResponse.json({ ok: false, error: strat.error }, { status: 422 })
  }

  const { data: allConns } = await supabase
    .from('mtmcopy_connections')
    .select('*')
    .eq('user_id', master.user_id)
    .neq('mt5_status', 'disconnected')

  const results: Array<{ id: string; login?: string; ok: boolean; error?: string }> = []

  for (const slave of slaves) {
    if (!slave.metaapi_account_id || !slave.copyfactory_subscribed) {
      results.push({
        id: slave.id,
        login: slave.mt5_login_last4 ?? undefined,
        ok: false,
        error: 'Slave sem MetaAPI ou CopyFactory inactivo',
      })
      continue
    }
    const sync = await syncConnectionCopyFactory(
      slave,
      `MTMcopier · ****${slave.mt5_login_last4 ?? '?'}`,
      (allConns ?? []) as MTMcopierConnection[],
    )
    results.push({
      id: slave.id,
      login: slave.mt5_login_last4 ?? undefined,
      ok: sync.ok,
      error: sync.error,
    })
  }

  return NextResponse.json({
    ok: true,
    master: {
      account_id: master.metaapi_account_id,
      strategy_id: master.copyfactory_strategy_id,
      login_last4: master.mt5_login_last4,
    },
    slaves_repaired: results.filter((r) => r.ok).length,
    slaves_total: results.length,
    details: results,
    message:
      'Estratégia mestre actualizada (skipPendingOrders=false). Slaves re-subscritos com limit/stop.',
  })
}
