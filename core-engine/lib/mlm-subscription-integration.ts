import type { SupabaseClient } from '@supabase/supabase-js'
import { planAmountCentsEur, productToSubscriptionPlan } from '@/lib/apple-iap'
import { processMlmRenewalCommissions } from '@/lib/mlm-renewal-commission'
import { placeBuyerInMlmTree } from '@/lib/mlm-tree'

type MlmSupabase = SupabaseClient

const DEFAULT_DIRECT_COMMISSION_PCT = 50

export type MlmSignupParams = {
  userId: string
  sponsorUsername?: string | null
  planId: string
  amountCents: number
  currency?: string
  /** Chave de idempotência (ex: apple_purchase_tx123) */
  paymentReference: string
  platform: 'stripe' | 'apple' | 'app_store'
}

export type MlmRenewalParams = {
  userId: string
  sponsorUsername: string | null
  planId: string
  amountCents: number
  currency?: string
  paymentReference: string
}

export type MlmTreeSyncResult = {
  scanned: number
  placed: number
  skipped: number
  errors: string[]
}

function normalizePlanId(plan: string, productId?: string): string {
  if (productId) {
    const mapped = productToSubscriptionPlan(productId)
    return mapped.plan
  }
  if (plan === 'app_member' || plan === 'premium') {
    return plan === 'premium' ? 'premium_monthly' : 'app_member_monthly'
  }
  return plan
}

/** Coloca membro na árvore binária se tem sponsor mas ainda não tem nó. */
export async function ensureSubscriberInMlmTree(
  supabase: MlmSupabase,
  userId: string,
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('mlm_sponsor_username')
    .eq('id', userId)
    .maybeSingle()

  const sponsorUsername = profile?.mlm_sponsor_username?.trim()
  if (!sponsorUsername) return false

  const { data: existingNode } = await supabase
    .from('mlm_nodes')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (existingNode) return true

  const { data: sponsor } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', sponsorUsername)
    .maybeSingle()

  if (!sponsor?.id || sponsor.id === userId) return false

  await placeBuyerInMlmTree(supabase, userId, sponsor.id, 0, { skipPendingIncrement: true })
  return true
}

/** Primeira subscrição (checkout / Apple SUBSCRIBED): comissão directa + árvore. */
export async function processMlmSubscriptionSignup(
  supabase: MlmSupabase,
  params: MlmSignupParams,
): Promise<void> {
  let sponsorUsername = params.sponsorUsername?.trim() || ''

  if (!sponsorUsername) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('mlm_sponsor_username')
      .eq('id', params.userId)
      .maybeSingle()
    sponsorUsername = profile?.mlm_sponsor_username?.trim() || ''
  }

  if (!sponsorUsername) return

  const { data: mlmSettings } = await supabase
    .from('mlm_settings')
    .select('is_active, direct_commission_pct')
    .eq('id', 1)
    .single()

  if (!mlmSettings?.is_active) return

  const { data: existing } = await supabase
    .from('mlm_commissions')
    .select('id')
    .eq('stripe_invoice_id', params.paymentReference)
    .eq('type', 'direct_referral')
    .maybeSingle()

  if (existing) {
    await ensureSubscriberInMlmTree(supabase, params.userId)
    return
  }

  const { data: sponsor } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', sponsorUsername)
    .maybeSingle()

  if (!sponsor?.id || sponsor.id === params.userId) return

  const commissionPct =
    (Number(mlmSettings.direct_commission_pct) || DEFAULT_DIRECT_COMMISSION_PCT) / 100
  const commissionAmount = parseFloat(((params.amountCents / 100) * commissionPct).toFixed(2))

  await supabase
    .from('profiles')
    .update({ mlm_sponsor_username: sponsorUsername })
    .eq('id', params.userId)
    .then(undefined, () => {})

  await supabase.from('mlm_commissions').insert({
    beneficiary_id: sponsor.id,
    from_user_id: params.userId,
    type: 'direct_referral',
    amount: commissionAmount,
    currency: (params.currency || 'EUR').toUpperCase(),
    source_plan: params.planId,
    stripe_invoice_id: params.paymentReference,
    source_amount_cents: params.amountCents,
    status: 'pending',
    payout_status: 'pending',
    notes: `Subscrição ${params.platform}`,
  })

  await placeBuyerInMlmTree(supabase, params.userId, sponsor.id, commissionAmount)
}

/** Renovação (Stripe / Apple): garantir árvore + residuais. */
export async function processMlmSubscriptionRenewal(
  supabase: MlmSupabase,
  params: MlmRenewalParams,
): Promise<void> {
  await ensureSubscriberInMlmTree(supabase, params.userId)

  await processMlmRenewalCommissions(supabase, {
    renewingUserId: params.userId,
    sponsorUsername: params.sponsorUsername,
    paymentReference: params.paymentReference,
    amountPaidCents: params.amountCents,
    currency: params.currency || 'EUR',
    planId: params.planId,
  })
}

/** Apple: derivar plano e valor a partir do productId. */
export function appleMlmContext(productId: string, planFallback?: string) {
  const mapped = productToSubscriptionPlan(productId)
  const planId = mapped.plan || normalizePlanId(planFallback || 'app_member_monthly', productId)
  return {
    planId,
    amountCents: planAmountCentsEur(productId) || planAmountCentsEur(planId),
    currency: 'EUR' as const,
  }
}

export function applePaymentReference(kind: 'purchase' | 'renewal', transactionId: string): string {
  return `apple_${kind}_${transactionId}`
}

/** Sincroniza subscrições activas com sponsor para a árvore MLM. */
export async function syncActiveSubscribersToMlmTree(
  supabase: MlmSupabase,
  options?: { userIds?: string[]; limit?: number },
): Promise<MlmTreeSyncResult> {
  const result: MlmTreeSyncResult = { scanned: 0, placed: 0, skipped: 0, errors: [] }
  const limit = options?.limit ?? 500

  let query = supabase
    .from('profiles')
    .select(
      'id, mlm_sponsor_username, subscription_status, is_active, subscription_plan, apple_original_transaction_id, stripe_customer_id',
    )
    .not('mlm_sponsor_username', 'is', null)
    .eq('is_active', true)
    .in('subscription_status', ['active', 'grace_period'])
    .or(
      'subscription_plan.not.is.null,apple_original_transaction_id.not.is.null,stripe_customer_id.not.is.null',
    )
    .limit(limit)

  if (options?.userIds?.length) {
    query = query.in('id', options.userIds)
  }

  const { data: profiles, error } = await query

  if (error) {
    result.errors.push(error.message)
    return result
  }

  const { data: nodes } = await supabase.from('mlm_nodes').select('user_id')
  const inTree = new Set((nodes || []).map((n) => n.user_id))

  for (const profile of profiles || []) {
    result.scanned += 1

    if (!profile.mlm_sponsor_username?.trim()) {
      result.skipped += 1
      continue
    }

    if (inTree.has(profile.id)) {
      result.skipped += 1
      continue
    }

    try {
      const placed = await ensureSubscriberInMlmTree(supabase, profile.id)
      if (placed) {
        result.placed += 1
        inTree.add(profile.id)
      } else {
        result.skipped += 1
      }
    } catch (err) {
      result.errors.push(
        `${profile.id}: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
      )
    }
  }

  return result
}
