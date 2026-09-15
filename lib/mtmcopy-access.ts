import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmcopySubscription } from '@/lib/mtmcopy/subscription'

export interface MtmcopyAccessResult {
  hasAccess: boolean
  subscribed: boolean
  canActivate: boolean
  reason?: 'admin' | 'paid' | 'mtmauto' | 'connection' | 'none'
  connectionId?: string
}

/** Verifica acesso à área MTMcopier (configuração + métricas). */
export async function checkMtmcopyAccess(
  userId: string,
  userType?: string | null,
): Promise<MtmcopyAccessResult> {
  const sub = await getMtmcopySubscription(userId, userType)
  const supabase = getSupabaseAdmin()

  const { data } = await supabase
    .from('mtmcopy_connections')
    .select('id')
    .eq('user_id', userId)
    .neq('mt5_status', 'disconnected')
    .limit(1)
    .maybeSingle()

  const hasConnection = Boolean(data?.id)

  return {
    hasAccess: sub.active || hasConnection,
    subscribed: sub.active,
    canActivate: sub.active,
    reason: sub.active ? sub.reason : hasConnection ? 'connection' : 'none',
    connectionId: data?.id,
  }
}
