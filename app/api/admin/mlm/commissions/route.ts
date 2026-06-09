import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireAdmin, getSupabaseAdmin } from '@/lib/admin-api-helpers'

const supabase = getSupabaseAdmin()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'all'

  let query = supabase
    .from('mlm_commissions')
    .select(`
      *,
      beneficiary:profiles!mlm_commissions_beneficiary_id_fkey(username, full_name, stripe_connect_account_id, stripe_connect_status),
      from_user:profiles!mlm_commissions_from_user_id_fkey(username, full_name)
    `)
    .order('created_at', { ascending: false })

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    // Fallback sem joins nomeados
    let fallbackQuery = supabase
      .from('mlm_commissions')
      .select('*')
      .order('created_at', { ascending: false })

    if (status !== 'all') {
      fallbackQuery = fallbackQuery.eq('status', status)
    }

    const { data: raw, error: rawError } = await fallbackQuery
    if (rawError) {
      return NextResponse.json({ error: rawError.message }, { status: 500 })
    }

    const commissions: any[] = []
    for (const c of (raw || [])) {
      let beneficiary_username: string | null = null
      let beneficiary_name: string | null = null
      let from_username: string | null = null
      let beneficiary_connect_id: string | null = null
      let beneficiary_connect_status: string | null = null

      if (c.beneficiary_id) {
        const { data: b } = await supabase
          .from('profiles')
          .select('username, full_name, stripe_connect_account_id, stripe_connect_status')
          .eq('id', c.beneficiary_id)
          .single()
        beneficiary_username = b?.username ?? null
        beneficiary_name = b?.full_name ?? null
        beneficiary_connect_id = b?.stripe_connect_account_id ?? null
        beneficiary_connect_status = b?.stripe_connect_status ?? null
      }
      if (c.from_user_id) {
        const { data: f } = await supabase.from('profiles').select('username').eq('id', c.from_user_id).single()
        from_username = f?.username ?? null
      }

      commissions.push({
        ...c,
        beneficiary_username,
        beneficiary_name,
        from_username,
        beneficiary_connect_id,
        beneficiary_connect_status,
      })
    }

    return NextResponse.json({ commissions })
  }

  const commissions = (data || []).map((row: any) => ({
    ...row,
    beneficiary_username: row.beneficiary?.username ?? null,
    beneficiary_name: row.beneficiary?.full_name ?? null,
    from_username: row.from_user?.username ?? null,
    beneficiary_connect_id: row.beneficiary?.stripe_connect_account_id ?? null,
    beneficiary_connect_status: row.beneficiary?.stripe_connect_status ?? null,
    beneficiary: undefined,
    from_user: undefined,
  }))

  return NextResponse.json({ commissions })
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json()
  const { action, ids } = body

  if (!action || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'action e ids são obrigatórios' }, { status: 400 })
  }

  // ── APROVAR ────────────────────────────────────────────────────────────────
  if (action === 'approve') {
    const { error } = await supabase
      .from('mlm_commissions')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .in('id', ids)
      .eq('status', 'pending')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, action: 'approved', count: ids.length })
  }

  // ── PAGAR (com Stripe Connect Transfer quando disponível) ──────────────────
  if (action === 'pay') {
    const { data: commissions, error: fetchError } = await supabase
      .from('mlm_commissions')
      .select('id, beneficiary_id, amount, currency')
      .in('id', ids)
      .eq('status', 'approved')

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const results: { id: string; status: 'transferred' | 'manual' | 'failed'; transfer_id?: string; error?: string }[] = []
    const totalsMap = new Map<string, number>()

    for (const commission of (commissions || [])) {
      // Verificar se o afiliado tem conta Stripe Connect ativa
      const { data: beneficiary } = await supabase
        .from('profiles')
        .select('stripe_connect_account_id, stripe_connect_status')
        .eq('id', commission.beneficiary_id)
        .single()

      const hasConnect =
        beneficiary?.stripe_connect_account_id &&
        beneficiary?.stripe_connect_status === 'complete'

      if (hasConnect) {
        // ── STRIPE TRANSFER ─────────────────────────────────────────────────
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
        } catch (stripeErr: any) {
          // Transfer falhou — anotar erro mas não bloquear os outros
          await supabase
            .from('mlm_commissions')
            .update({ payout_status: 'failed' })
            .eq('id', commission.id)

          results.push({ id: commission.id, status: 'failed', error: stripeErr?.message })
          continue // Não contabilizar no total
        }
      } else {
        // ── PAGAMENTO MANUAL (sem Connect) ──────────────────────────────────
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

      // Acumular totais por beneficiário (só para os pagos com sucesso)
      const prev = totalsMap.get(commission.beneficiary_id) ?? 0
      totalsMap.set(commission.beneficiary_id, prev + Number(commission.amount ?? 0))
    }

    // Atualizar mlm_nodes.total_earned e pending_commissions
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

      // Atualizar profiles.mlm_total_earned
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

    const transferred = results.filter(r => r.status === 'transferred').length
    const manual = results.filter(r => r.status === 'manual').length
    const failed = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
      success: true,
      action: 'paid',
      count: transferred + manual,
      transferred,
      manual,
      failed,
      results,
    })
  }

  return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 })
}
