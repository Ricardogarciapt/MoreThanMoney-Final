/**
 * Sincronização de perfil após pagamento Stripe.
 * subscription_platform na BD aceita: app_store | skool | manual | coupon (não "stripe").
 * O canal Stripe fica em checkout_source = 'stripe'.
 */

import { completeAccessMigration } from '@/lib/access-migration'
import { memberCategoryForPlan, normalizeSubscriptionPlan } from '@/lib/stripe-prices'

export function subscriptionPlatformForStripeCheckout(): 'manual' {
  return 'manual'
}

export interface FinalizeStripeMemberOpts {
  userId: string
  planId: string
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  periodEnd?: string | null
  billingCycle?: 'monthly' | 'annual'
}

/** Marca migração concluída e sincroniza pack após pagamento Stripe (registo ou revalidação). */
export async function finalizeStripeMemberAccess(opts: FinalizeStripeMemberOpts): Promise<void> {
  await completeAccessMigration({
    userId: opts.userId,
    planId: opts.planId,
    channel: 'stripe',
    billingCycle: opts.billingCycle ?? (opts.planId.includes('annual') ? 'annual' : 'monthly'),
    stripeCustomerId: opts.stripeCustomerId,
    stripeSubscriptionId: opts.stripeSubscriptionId,
    periodEnd: opts.periodEnd,
  })
}

export function planMetaFromPlanId(planId: string) {
  return {
    subscriptionPlan: normalizeSubscriptionPlan(planId),
    memberCategory: memberCategoryForPlan(planId),
    billingCycle: planId.includes('annual') ? ('annual' as const) : ('monthly' as const),
  }
}
