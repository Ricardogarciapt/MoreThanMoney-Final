import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export interface MtmcopySubscriptionStatus {
  active: boolean
  reason: 'admin' | 'paid' | 'checkout' | 'none'
  expiresAt?: string | null
}

/** Admins: acesso MTMcopier sem Stripe e contas ilimitadas. */
export function isMtmcopyAdmin(userType?: string | null): boolean {
  return userType === 'admin'
}

/** VIP e membros pagam o addon MTMcopier via Stripe; VIP pode ligar até 5 contas. */

/** Verifica subscrição paga do addon MTMcopier (+20€/mês). */
export async function getMtmcopySubscription(
  userId: string,
  userType?: string | null,
): Promise<MtmcopySubscriptionStatus> {
  if (isMtmcopyAdmin(userType)) {
    return { active: true, reason: 'admin' }
  }

  const supabase = getSupabaseAdmin()

  const { data: profile } = await supabase
    .from('profiles')
    .select('mtmcopy_subscription_active, mtmcopy_subscription_expires_at')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.mtmcopy_subscription_active) {
    const expires = profile.mtmcopy_subscription_expires_at
    if (!expires || new Date(expires) > new Date()) {
      return { active: true, reason: 'paid', expiresAt: expires }
    }
  }

  const { data: checkout } = await supabase
    .from('checkout_sessions')
    .select('completed_at, plan')
    .eq('user_id', userId)
    .eq('plan', 'mtmcopy_addon_monthly')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (checkout?.completed_at) {
    return { active: true, reason: 'checkout' }
  }

  return { active: false, reason: 'none' }
}

export async function activateMtmcopySubscription(userId: string, expiresAt?: string | null) {
  const supabase = getSupabaseAdmin()
  await supabase
    .from('profiles')
    .update({
      mtmcopy_subscription_active: true,
      mtmcopy_subscription_expires_at: expiresAt ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .then(undefined, () => {})
}
