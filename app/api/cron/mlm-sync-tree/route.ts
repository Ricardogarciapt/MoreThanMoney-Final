import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { syncActiveSubscribersToMlmTree } from '@/lib/mlm-subscription-integration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Coloca subscrições activas com sponsor na árvore MLM (backfill). */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = limitParam ? Math.min(2000, Math.max(1, Number(limitParam))) : 500

  const result = await syncActiveSubscribersToMlmTree(supabase, { limit })

  return NextResponse.json({ success: true, ...result })
}
