import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSupabaseAdmin } from '@/lib/admin-api-helpers'
import { syncActiveSubscribersToMlmTree } from '@/lib/mlm-subscription-integration'

/** Admin: coloca subscrições activas com sponsor na árvore MLM. */
export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const limit = typeof body.limit === 'number' ? Math.min(2000, body.limit) : 500
  const userIds = Array.isArray(body.user_ids) ? body.user_ids : undefined

  const supabase = getSupabaseAdmin()
  const result = await syncActiveSubscribersToMlmTree(supabase, { limit, userIds })

  return NextResponse.json({ success: true, ...result })
}
