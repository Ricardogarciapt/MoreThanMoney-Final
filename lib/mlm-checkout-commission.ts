import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { placeBuyerInMlmTree, upsertSponsorNode } from '@/lib/mlm-tree'

type MlmSupabase = SupabaseClient

/** Cria comissão MLM e coloca na árvore (ou só comissão se ainda não há userId). */
export async function processMlmCheckoutCommission(
  supabase: MlmSupabase,
  session: Stripe.Checkout.Session,
  userId: string | null
): Promise<void> {
  let sponsorUsername = session.metadata?.sponsor_username?.trim() || ''

  if (!sponsorUsername && userId) {
    const { data: buyerProfile } = await supabase
      .from('profiles')
      .select('mlm_sponsor_username')
      .eq('id', userId)
      .single()
    sponsorUsername = buyerProfile?.mlm_sponsor_username?.trim() || ''
  }

  if (!sponsorUsername) return

  const { data: existing } = await supabase
    .from('mlm_commissions')
    .select('id')
    .eq('stripe_session_id', session.id)
    .maybeSingle()

  if (existing) return

  const { data: mlmSettings } = await supabase
    .from('mlm_settings')
    .select('is_active, direct_commission_pct')
    .eq('id', 1)
    .single()

  if (!mlmSettings?.is_active) return

  const { data: sponsor } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('username', sponsorUsername)
    .single()

  if (!sponsor) return

  const amountTotal = session.amount_total || 0
  const commissionPct = (mlmSettings.direct_commission_pct || 20) / 100
  const commissionAmount = parseFloat(((amountTotal / 100) * commissionPct).toFixed(2))

  await supabase.from('mlm_commissions').insert({
    beneficiary_id: sponsor.id,
    from_user_id: userId,
    type: 'direct_referral',
    amount: commissionAmount,
    currency: (session.currency || 'eur').toUpperCase(),
    source_plan: session.metadata?.plan || '',
    stripe_session_id: session.id,
    status: 'pending',
    payout_status: 'pending',
  })

  if (userId) {
    await supabase
      .from('profiles')
      .update({ mlm_sponsor_username: sponsorUsername })
      .eq('id', userId)
      .then(undefined, () => {})

    await placeBuyerInMlmTree(supabase, userId, sponsor.id, commissionAmount)
  } else {
    await upsertSponsorNode(supabase, sponsor.id, commissionAmount)
  }
}

/** Após complete-registration: liga comprador à comissão e à árvore binária. */
export async function linkMlmBuyerAfterRegistration(
  supabase: MlmSupabase,
  params: { stripeSessionId: string; userId: string; sponsorUsername: string }
): Promise<void> {
  const sponsorUsername = params.sponsorUsername.trim()
  if (!sponsorUsername) return

  const { data: commission } = await supabase
    .from('mlm_commissions')
    .select('id, amount, beneficiary_id')
    .eq('stripe_session_id', params.stripeSessionId)
    .maybeSingle()

  if (commission) {
    await supabase
      .from('mlm_commissions')
      .update({ from_user_id: params.userId })
      .eq('id', commission.id)
  }

  const { data: sponsor } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', sponsorUsername)
    .single()

  if (!sponsor) return

  const amount = commission ? Number(commission.amount) : 0
  await placeBuyerInMlmTree(supabase, params.userId, sponsor.id, amount, {
    skipPendingIncrement: !!commission,
  })

  await supabase
    .from('profiles')
    .update({ mlm_sponsor_username: sponsorUsername })
    .eq('id', params.userId)
}
