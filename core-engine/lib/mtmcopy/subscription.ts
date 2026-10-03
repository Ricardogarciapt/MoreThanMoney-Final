import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { direitoMtmAuto } from '@/lib/entitlements'

export interface MtmcopySubscriptionStatus {
  active: boolean
  /** 'paid' = MTM Copy legado pago e datado · 'mtmauto' = direito ao MTM Auto por outra via (Premium, VIP, subscrição MTM Auto). */
  reason: 'admin' | 'paid' | 'mtmauto' | 'none'
  expiresAt?: string | null
}

/** Admins: acesso MTMcopier sem Stripe e contas ilimitadas. */
export function isMtmcopyAdmin(userType?: string | null): boolean {
  return userType === 'admin'
}

/**
 * Pode usar o MTM Copy (API das apps instaladas, provisionamento, cópia)?
 *
 * Fase 1: o MTM Copy foi descontinuado e o direito é o do MTM Auto — a regra única
 * `direitoMtmAuto` (função SQL direito_mtm_auto). Quem paga o MTM Copy legado tem exactamente os
 * direitos de um subscritor do MTM Auto, e vice-versa. O legado só conta com um período PAGO e
 * DATADO: o addon sem data e os checkout_sessions "completed" sem data já não dão acesso (era
 * assim que quem pagou uma vez continuava com acesso para sempre). As datas acertam-se com o
 * Stripe em scripts/fase1-mtmcopy-expiracoes.ts.
 */
export async function getMtmcopySubscription(
  userId: string,
  userType?: string | null,
): Promise<MtmcopySubscriptionStatus> {
  if (isMtmcopyAdmin(userType)) {
    return { active: true, reason: 'admin' }
  }

  const direito = await direitoMtmAuto(userId)
  if (!direito.tem) return { active: false, reason: 'none' }
  if (direito.motivo === 'admin') return { active: true, reason: 'admin' }
  if (direito.motivo === 'legado_mtmcopy') {
    const { data: profile } = await getSupabaseAdmin()
      .from('profiles')
      .select('mtmcopy_subscription_expires_at')
      .eq('id', userId)
      .maybeSingle()
    return { active: true, reason: 'paid', expiresAt: profile?.mtmcopy_subscription_expires_at ?? null }
  }
  return { active: true, reason: 'mtmauto' }
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
