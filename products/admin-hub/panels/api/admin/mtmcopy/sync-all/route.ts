import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { runMtmcopySystemSync } from '@/lib/mtmcopy/system-sync'

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const {
    force = true,
    user_id,
    connection_id,
  } = body as {
    force?: boolean
    user_id?: string
    connection_id?: string
  }

  const result = await runMtmcopySystemSync({
    forceCopyFactory: force,
    userId: user_id,
    connectionId: connection_id,
  })

  return NextResponse.json({
    success: result.ok,
    ...result,
  })
}

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dry_run') === '1'

  if (dryRun) {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
    const supabase = getSupabaseAdmin()
    const [{ count: connCount }, { data: errors }] = await Promise.all([
      supabase
        .from('mtmcopy_connections')
        .select('id', { count: 'exact', head: true })
        .neq('mt5_status', 'disconnected'),
      supabase
        .from('mtmcopy_connections')
        .select('id, user_id, last_error, copyfactory_subscribed, mt5_status, is_active')
        .neq('mt5_status', 'disconnected')
        .or('last_error.not.is.null,copyfactory_subscribed.eq.false'),
    ])
    return NextResponse.json({
      connections_total: connCount ?? 0,
      needs_attention: errors ?? [],
    })
  }

  return NextResponse.json({
    message: 'POST para sincronizar. Body opcional: { force, user_id, connection_id }',
  })
}
