import { type NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { connectionCopyMethod, prefersDirectExecution } from '@/lib/mtmcopy/copy-limits'
import { removeConnectionCopyFactory } from '@/lib/mtmcopy/connection-sync'
import type { MTMcopierConnection } from '@/lib/mtmcopy/types'

const supabaseAdmin = getSupabaseAdmin()

/**
 * Remove subscrições CopyFactory obsoletas em contas de grupos/estratégia MTM
 * (execução directa via parser + MetaAPI).
 */
export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''

  let query = supabaseAdmin
    .from('mtmcopy_connections')
    .select('*')
    .neq('mt5_status', 'disconnected')
    .eq('copyfactory_subscribed', true)

  if (userId) query = query.eq('user_id', userId)

  const { data: rows, error } = await query
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const repaired: string[] = []
  const skipped: string[] = []

  for (const row of (rows ?? []) as MTMcopierConnection[]) {
    if (!prefersDirectExecution(row)) {
      skipped.push(row.id)
      continue
    }
    if (row.metaapi_account_id) {
      await removeConnectionCopyFactory(row.metaapi_account_id)
    }
    await supabaseAdmin
      .from('mtmcopy_connections')
      .update({
        copyfactory_subscribed: false,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    repaired.push(`${row.id} (${connectionCopyMethod(row)})`)
  }

  return NextResponse.json({
    success: true,
    repaired_count: repaired.length,
    repaired,
    skipped_count: skipped.length,
    message:
      repaired.length > 0
        ? `${repaired.length} conta(s) migrada(s) para execução directa MetaAPI`
        : 'Nenhuma conta com CopyFactory obsoleto encontrada',
  })
}
