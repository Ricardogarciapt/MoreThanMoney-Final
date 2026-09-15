import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export interface MtmcopySubscriptionStatus {
  active: boolean
  reason: 'admin' | 'paid' | 'none'
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

  // Acesso legado: só com um período PAGO e DATADO. Um addon sem data (o webhook antigo gravava
  // null) já não conta, e um checkout "completed" sem data também não — era assim que quem tinha
  // pago uma vez em Junho continuava com acesso para sempre. As datas acertam-se com o Stripe em
  // scripts/fase1-mtmcopy-expiracoes.ts.
  if (profile?.mtmcopy_subscription_active) {
    const expires = profile.mtmcopy_subscription_expires_at
    if (expires && new Date(expires) > new Date()) {
      return { active: true, reason: 'paid', expiresAt: expires }
    }
  }

  return { active: false, reason: 'none' }
}

export async function activateMtmcopySubscription(userId: string, expiresAt?: string | null) {
  const supabase = getSupabaseAdmin()
  await supabase
    .from('profiles')
    .update({
      mtmcopy_subscription_active: true,
      // Nunca null: sem data, o acesso legado não vale nada (ver getMtmcopySubscription).
      mtmcopy_subscription_expires_at: expiresAt ?? new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .then(undefined, () => {})
}
