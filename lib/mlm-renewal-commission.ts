import type { SupabaseClient } from '@supabase/supabase-js'

type MlmSupabase = SupabaseClient

const MAX_UPLINE_DEPTH = 10
const DEFAULT_DIRECT_RESIDUAL_PCT = 50

export type MlmRenewalCommissionParams = {
  renewingUserId: string
  sponsorUsername: string | null
  /** Idempotência — Stripe invoice id ou apple_renewal_tx… */
  paymentReference: string
  amountPaidCents: number
  currency: string
  planId: string
}

function calendarMonthBoundsUtc(): { start: string; end: string; label: string } {
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const monthEnd = new Date(monthStart)
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1)
  return {
    start: monthStart.toISOString(),
    end: monthEnd.toISOString(),
    label: monthStart.toISOString().slice(0, 7),
  }
}

async function incrementPendingCommissions(
  supabase: MlmSupabase,
  userId: string,
  amount: number,
): Promise<void> {
  const { data: node } = await supabase
    .from('mlm_nodes')
    .select('id, pending_commissions')
    .eq('user_id', userId)
    .maybeSingle()

  if (node) {
    await supabase
      .from('mlm_nodes')
      .update({
        pending_commissions: (Number(node.pending_commissions) || 0) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    return
  }

  await supabase
    .from('mlm_nodes')
    .insert({ user_id: userId, pending_commissions: amount })
    .then(undefined, () => {})
}

async function processDirectSponsorResidual(
  supabase: MlmSupabase,
  params: MlmRenewalCommissionParams,
  directCommissionPct: number,
): Promise<void> {
  const sponsorUsername = params.sponsorUsername?.trim()
  if (!sponsorUsername) return

  const { data: existing } = await supabase
    .from('mlm_commissions')
    .select('id')
    .eq('stripe_invoice_id', params.paymentReference)
    .eq('type', 'monthly_residual')
    .maybeSingle()

  if (existing) return

  const { data: sponsor } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', sponsorUsername)
    .single()

  if (!sponsor) return

  const commissionPct = (directCommissionPct || DEFAULT_DIRECT_RESIDUAL_PCT) / 100
  const commissionAmount = parseFloat(((params.amountPaidCents / 100) * commissionPct).toFixed(2))
  if (commissionAmount <= 0) return

  await supabase.from('mlm_commissions').insert({
    beneficiary_id: sponsor.id,
    from_user_id: params.renewingUserId,
    type: 'monthly_residual',
    amount: commissionAmount,
    currency: params.currency,
    source_plan: params.planId,
    stripe_invoice_id: params.paymentReference,
    source_amount_cents: params.amountPaidCents,
    status: 'pending',
    payout_status: 'pending',
  })

  await incrementPendingCommissions(supabase, sponsor.id, commissionAmount)
}

async function processRankMonthlyResiduals(
  supabase: MlmSupabase,
  params: MlmRenewalCommissionParams,
): Promise<void> {
  const { data: memberNode } = await supabase
    .from('mlm_nodes')
    .select('id, parent_node_id')
    .eq('user_id', params.renewingUserId)
    .maybeSingle()

  if (!memberNode?.parent_node_id) return

  const { data: allRanks } = await supabase.from('mlm_ranks').select('id, monthly_residual')

  const rankResidualMap = new Map(
    (allRanks || []).map((rank) => [rank.id as number, Number(rank.monthly_residual) || 0]),
  )

  const { start: monthStart, end: monthEnd, label: monthLabel } = calendarMonthBoundsUtc()

  let parentNodeId: string | null = memberNode.parent_node_id
  let depth = 0
  const paidThisRun = new Set<string>()

  while (parentNodeId && depth < MAX_UPLINE_DEPTH) {
    depth += 1

    const { data: ancestor } = await supabase
      .from('mlm_nodes')
      .select('id, user_id, parent_node_id, rank_id')
      .eq('id', parentNodeId)
      .maybeSingle()

    if (!ancestor) break

    const rankId = Number(ancestor.rank_id) || 0
    const residualAmount = rankResidualMap.get(rankId) ?? 0

    if (rankId > 0 && residualAmount > 0 && !paidThisRun.has(ancestor.user_id)) {
      const { data: existing } = await supabase
        .from('mlm_commissions')
        .select('id')
        .eq('beneficiary_id', ancestor.user_id)
        .eq('type', 'rank_residual')
        .gte('created_at', monthStart)
        .lt('created_at', monthEnd)
        .maybeSingle()

      if (!existing) {
        await supabase.from('mlm_commissions').insert({
          beneficiary_id: ancestor.user_id,
          from_user_id: params.renewingUserId,
          type: 'rank_residual',
          amount: residualAmount,
          currency: params.currency,
          source_plan: params.planId,
          stripe_invoice_id: params.paymentReference,
          status: 'pending',
          payout_status: 'pending',
          notes: `Residual mensal de rank (${monthLabel})`,
        })

        await incrementPendingCommissions(supabase, ancestor.user_id, residualAmount)
        paidThisRun.add(ancestor.user_id)
      }
    }

    parentNodeId = ancestor.parent_node_id
  }
}

/** Comissões MLM em renovações Stripe (residual directo + residual de rank na árvore). */
export async function processMlmRenewalCommissions(
  supabase: MlmSupabase,
  params: MlmRenewalCommissionParams,
): Promise<void> {
  const { data: mlmSettings } = await supabase
    .from('mlm_settings')
    .select('is_active, direct_commission_pct')
    .eq('id', 1)
    .single()

  if (!mlmSettings?.is_active) return

  const directPct = Number(mlmSettings.direct_commission_pct) || DEFAULT_DIRECT_RESIDUAL_PCT

  await processDirectSponsorResidual(supabase, params, directPct)
  await processRankMonthlyResiduals(supabase, params)
}
