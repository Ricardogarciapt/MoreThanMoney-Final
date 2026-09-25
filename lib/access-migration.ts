/**
 * Migração de acesso — packs Stripe e Skool.
 * Estado guardado em profiles.profile_data (JSONB).
 *
 * As REGRAS PURAS estão em ./access-migration-regras (sem IO) e são re-exportadas
 * aqui para não partir nenhum import. Quem só precisa das regras — em especial o
 * middleware, que corre no Edge — deve importar de lá, para não arrastar o cliente
 * service-role do Supabase.
 */

import type { UserProfile } from '@/lib/role-redirect'
import { buildSubscriptionExpiry } from '@/lib/member-subscription'
import { memberCategoryForPlan, normalizeSubscriptionPlan } from '@/lib/stripe-prices'
import { subscriptionPlatformForStripeCheckout } from '@/lib/stripe-profile-sync'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { AccessPaymentChannel } from '@/lib/access-migration-regras'
import {
  generateAppActivationCouponCode,
  mergeAccessMigration,
  readAccessMigration,
} from '@/lib/access-migration-regras'

export type {
  AccessPaymentChannel,
  AccessValidationStatus,
  AccessMigrationState,
} from '@/lib/access-migration-regras'
export {
  readProfileData,
  readAccessMigration,
  mergeAccessMigration,
  isAccessMigrationExempt,
  needsAccessRevalidation,
  accessMigrationRedirectPath,
  generateAppActivationCouponCode,
} from '@/lib/access-migration-regras'

/** Cria cupão individual (1 uso) para activação na app sem segunda cobrança. */
export async function createAppActivationCoupon(
  userId: string,
  plan: 'app_member' | 'premium',
): Promise<string> {
  const supabase = getSupabaseAdmin()
  const code = generateAppActivationCouponCode(userId)
  const { error } = await supabase.from('coupons').insert({
    code,
    type: 'free_subscription',
    discount_value: 0,
    plan_override: plan,
    max_uses: 1,
    used_count: 0,
    description: `Cupão activação app — migração packs (user ${userId.slice(0, 8)})`,
    is_active: true,
  })
  if (error) {
    console.error('[access-migration] coupon insert:', error.message)
    return code
  }
  return code
}

export interface CompleteMigrationOpts {
  userId: string
  planId: string
  channel: AccessPaymentChannel
  billingCycle?: 'monthly' | 'annual'
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  periodEnd?: string | null
}

/** Sincroniza perfil após pagamento Stripe ou aprovação admin. */
export async function completeAccessMigration(opts: CompleteMigrationOpts): Promise<{
  couponCode: string | null
}> {
  const supabase = getSupabaseAdmin()
  const plan = normalizeSubscriptionPlan(opts.planId)
  const memberCategory = memberCategoryForPlan(opts.planId)
  const billingCycle =
    opts.billingCycle ?? (opts.planId.includes('annual') ? 'annual' : 'monthly')
  const expiresAt = opts.periodEnd ?? buildSubscriptionExpiry()

  const { data: existing } = await supabase
    .from('profiles')
    .select('profile_data')
    .eq('id', opts.userId)
    .single()

  const couponCode = await createAppActivationCoupon(
    opts.userId,
    plan === 'premium' ? 'premium' : 'app_member',
  )

  const profileData = mergeAccessMigration(existing ?? {}, {
    access_revalidation_required: false,
    access_payment_channel: opts.channel,
    access_validation_status: 'approved',
    access_migration_completed_at: new Date().toISOString(),
    app_activation_coupon_code: couponCode,
  })

  const patch: Record<string, unknown> = {
    profile_data: profileData,
    is_active: true,
    user_type: 'member',
    member_category: memberCategory,
    subscription_plan: plan,
    subscription_platform:
      opts.channel === 'skool' ? 'skool' : subscriptionPlatformForStripeCheckout(),
    subscription_billing_cycle: billingCycle,
    subscription_status: 'active',
    subscription_auto_renew: true,
    subscription_expires_at: expiresAt,
    next_billing_at: expiresAt,
    last_payment_at: new Date().toISOString(),
    payment_failed_count: 0,
    updated_at: new Date().toISOString(),
  }

  if (opts.stripeCustomerId) patch.stripe_customer_id = opts.stripeCustomerId
  if (opts.stripeSubscriptionId) patch.stripe_subscription_id = opts.stripeSubscriptionId
  if (opts.channel === 'stripe') patch.checkout_source = 'stripe'

  const { error: updateError } = await supabase.from('profiles').update(patch).eq('id', opts.userId)
  if (updateError) {
    throw new Error(`Falha ao actualizar perfil pós-migração: ${updateError.message}`)
  }

  return { couponCode }
}

export const ACCESS_MIGRATION_COPY = {
  title: 'Novos packs de acesso MoreThanMoney',
  intro:
    'Actualizámos o processamento de mensalidades e packs de acesso. Para continuares a usar a plataforma com o melhor funcionamento, confirma como fazes o teu pagamento — pelo meio que estás a usar agora (web, app ou comunidade).',
  annualNote:
    'O pack anual é o compromisso com a MoreThanMoney para podermos prestar um serviço melhor — inclui 20% de desconto face ao mensal.',
  stripeCta: 'Pagar com Stripe (cartão)',
  skoolCta: 'Sou membro Skool',
  couponNote:
    'Após o pagamento Stripe recebes um código individual para activar a app sem seres cobrado uma segunda vez.',
} as const
