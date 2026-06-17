/**
 * Migração de acesso — packs Stripe/Skool/IQONIC.
 * Estado guardado em profiles.profile_data (JSONB).
 */

import type { UserProfile } from '@/lib/role-redirect'
import { buildSubscriptionExpiry } from '@/lib/member-subscription'
import { memberCategoryForPlan, normalizeSubscriptionPlan } from '@/lib/stripe-prices'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export type AccessPaymentChannel = 'stripe' | 'skool' | 'iqonic'
export type AccessValidationStatus = 'pending' | 'approved' | 'rejected' | null

export interface AccessMigrationState {
  access_revalidation_required: boolean
  access_payment_channel: AccessPaymentChannel | null
  iqonic_member_id: string | null
  iqonic_proof_url: string | null
  access_validation_status: AccessValidationStatus
  access_validation_requested_at: string | null
  app_activation_coupon_code: string | null
  access_migration_completed_at: string | null
}

const DEFAULT_STATE: AccessMigrationState = {
  access_revalidation_required: false,
  access_payment_channel: null,
  iqonic_member_id: null,
  iqonic_proof_url: null,
  access_validation_status: null,
  access_validation_requested_at: null,
  app_activation_coupon_code: null,
  access_migration_completed_at: null,
}

export function readProfileData(profile: { profile_data?: unknown } | null | undefined): Record<string, unknown> {
  if (!profile?.profile_data || typeof profile.profile_data !== 'object') return {}
  return profile.profile_data as Record<string, unknown>
}

export function readAccessMigration(profile: { profile_data?: unknown } | null | undefined): AccessMigrationState {
  const pd = readProfileData(profile)
  return {
    access_revalidation_required: pd.access_revalidation_required === true,
    access_payment_channel:
      pd.access_payment_channel === 'stripe' ||
      pd.access_payment_channel === 'skool' ||
      pd.access_payment_channel === 'iqonic'
        ? pd.access_payment_channel
        : null,
    iqonic_member_id: typeof pd.iqonic_member_id === 'string' ? pd.iqonic_member_id : null,
    iqonic_proof_url: typeof pd.iqonic_proof_url === 'string' ? pd.iqonic_proof_url : null,
    access_validation_status:
      pd.access_validation_status === 'pending' ||
      pd.access_validation_status === 'approved' ||
      pd.access_validation_status === 'rejected'
        ? pd.access_validation_status
        : null,
    access_validation_requested_at:
      typeof pd.access_validation_requested_at === 'string' ? pd.access_validation_requested_at : null,
    app_activation_coupon_code:
      typeof pd.app_activation_coupon_code === 'string' ? pd.app_activation_coupon_code : null,
    access_migration_completed_at:
      typeof pd.access_migration_completed_at === 'string' ? pd.access_migration_completed_at : null,
  }
}

export function mergeAccessMigration(
  profile: { profile_data?: unknown },
  patch: Partial<AccessMigrationState>,
): Record<string, unknown> {
  const current = readProfileData(profile)
  const prev = readAccessMigration(profile)
  return {
    ...current,
    ...prev,
    ...patch,
  }
}

/** Admin e educadores LMS ficam isentos da migração forçada. */
export function isAccessMigrationExempt(
  profile: Pick<UserProfile, 'user_type' | 'email' | 'is_active'> | null | undefined,
  educatorEmails?: Set<string>,
): boolean {
  if (!profile) return false
  if (profile.user_type === 'admin') return true
  const email = profile.email?.trim().toLowerCase()
  if (email && educatorEmails?.has(email)) return true
  return false
}

export function isIqonicValidationPending(profile: { profile_data?: unknown } | null | undefined): boolean {
  const m = readAccessMigration(profile)
  return m.access_payment_channel === 'iqonic' && m.access_validation_status === 'pending'
}

/** Utilizador deve passar pelo fluxo /access-migration antes de aceder à app. */
export function needsAccessRevalidation(
  profile: (UserProfile & { profile_data?: unknown; email?: string }) | null | undefined,
  educatorEmails?: Set<string>,
): boolean {
  if (!profile || isAccessMigrationExempt(profile, educatorEmails)) return false
  const m = readAccessMigration(profile)
  if (m.access_migration_completed_at) return false
  if (isIqonicValidationPending(profile)) return true
  return m.access_revalidation_required === true
}

export function accessMigrationRedirectPath(): string {
  return '/access-migration'
}

export function generateAppActivationCouponCode(userId: string): string {
  const slug = userId.replace(/-/g, '').slice(0, 8).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `MTM-APP-${slug}-${rand}`
}

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
    subscription_platform: opts.channel === 'skool' ? 'skool' : 'stripe',
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

  await supabase.from('profiles').update(patch).eq('id', opts.userId)

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
  iqonicCta: 'Sou membro IQONIC',
  iqonicProof:
    'Envia um print da tua subscrição IQONIC activa e o teu ID IQONIC. A validação manual será feita nas próximas horas — só poderás entrar após aprovação no gestor de utilizadores.',
  iqonicPending:
    'Pedido enviado. A tua validação será feita nas próximas horas. Receberás acesso assim que um administrador aprovar no painel /admin.',
  couponNote:
    'Após o pagamento Stripe recebes um código individual para activar a app sem seres cobrado uma segunda vez.',
} as const
