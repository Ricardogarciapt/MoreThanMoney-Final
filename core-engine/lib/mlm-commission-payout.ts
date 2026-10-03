import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

export type PayoutResult = {
  id: string
  status: 'transferred' | 'manual' | 'failed'
  transfer_id?: string
  error?: string
}

export async function payApprovedCommissions(
  supabase: SupabaseClient,
  stripe: Stripe,
  ids: string[]
): Promise<{
  results: PayoutResult[]
  transferred: number
  manual: number
  failed: number
  count: number
}> {
  const { data: commissions, error: fetchError } = await supabase
    .from('mlm_commissions')
    .select('id, beneficiary_id, amount, currency')
    .in('id', ids)
    .eq('status', 'approved')

  if (fetchError) {
    throw new Error(fetchError.message)
  }

  const results: PayoutResult[] = []
  const totalsMap = new Map<string, number>()

  for (const commission of commissions || []) {
    const { data: beneficiary } = await supabase
      .from('profiles')
      .select('stripe_connect_account_id, stripe_connect_status')
      .eq('id', commission.beneficiary_id)
      .single()

    const hasConnect =
      beneficiary?.stripe_connect_account_id &&
      beneficiary?.stripe_connect_status === 'complete'

    if (hasConnect) {
      try {
        const amountCents = Math.round(Number(commission.amount) * 100)
        const transfer = await stripe.transfers.create({
          amount: amountCents,
          currency: (commission.currency || 'EUR').toLowerCase(),
          destination: beneficiary!.stripe_connect_account_id!,
          metadata: {
            commission_id: commission.id,
            beneficiary_id: commission.beneficiary_id,
          },
        })

        await supabase
          .from('mlm_commissions')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_transfer_id: transfer.id,
            payout_status: 'transferred',
          })
          .eq('id', commission.id)

        results.push({ id: commission.id, status: 'transferred', transfer_id: transfer.id })
      } catch (stripeErr: unknown) {
        const message = stripeErr instanceof Error ? stripeErr.message : 'Stripe transfer failed'
        await supabase
          .from('mlm_commissions')
          .update({ payout_status: 'failed' })
          .eq('id', commission.id)

        results.push({ id: commission.id, status: 'failed', error: message })
        continue
      }
    } else {
      await supabase
        .from('mlm_commissions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payout_status: 'manual',
        })
        .eq('id', commission.id)

      results.push({ id: commission.id, status: 'manual' })
    }

    const prev = totalsMap.get(commission.beneficiary_id) ?? 0
    totalsMap.set(commission.beneficiary_id, prev + Number(commission.amount ?? 0))
  }

  for (const [beneficiaryId, total] of totalsMap.entries()) {
    const { data: node } = await supabase
      .from('mlm_nodes')
      .select('id, total_earned, pending_commissions')
      .eq('user_id', beneficiaryId)
      .single()

    if (node) {
      await supabase
        .from('mlm_nodes')
        .update({
          total_earned: (Number(node.total_earned) ?? 0) + total,
          pending_commissions: Math.max(0, (Number(node.pending_commissions) ?? 0) - total),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', beneficiaryId)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('mlm_total_earned')
      .eq('id', beneficiaryId)
      .single()

    if (profile) {
      await supabase
        .from('profiles')
        .update({ mlm_total_earned: (Number(profile.mlm_total_earned) ?? 0) + total })
        .eq('id', beneficiaryId)
    }
  }

  const transferred = results.filter((r) => r.status === 'transferred').length
  const manual = results.filter((r) => r.status === 'manual').length
  const failed = results.filter((r) => r.status === 'failed').length

  return {
    results,
    transferred,
    manual,
    failed,
    count: transferred + manual,
  }
}
