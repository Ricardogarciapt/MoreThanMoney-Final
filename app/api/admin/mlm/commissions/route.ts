import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSupabaseAdmin } from '@/lib/admin-api-helpers'
import { getStripeClient } from '@/lib/stripe-client'
import { payApprovedCommissions } from '@/lib/mlm-commission-payout'

const supabase = getSupabaseAdmin()
const stripe = getStripeClient()

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
    for (const c of raw || []) {
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

  if (action === 'approve') {
    const { error } = await supabase
      .from('mlm_commissions')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .in('id', ids)
      .eq('status', 'pending')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    try {
      const payout = await payApprovedCommissions(supabase, stripe, ids)
      return NextResponse.json({
        success: true,
        action: 'approved',
        count: ids.length,
        auto_payout: true,
        transferred: payout.transferred,
        manual: payout.manual,
        failed: payout.failed,
        payout_count: payout.count,
        results: payout.results,
      })
    } catch (payoutErr: unknown) {
      const message = payoutErr instanceof Error ? payoutErr.message : 'Erro no pagamento automático'
      return NextResponse.json({
        success: true,
        action: 'approved',
        count: ids.length,
        auto_payout: false,
        payout_error: message,
      })
    }
  }

  if (action === 'pay') {
    try {
      const payout = await payApprovedCommissions(supabase, stripe, ids)
      return NextResponse.json({
        success: true,
        action: 'paid',
        count: payout.count,
        transferred: payout.transferred,
        manual: payout.manual,
        failed: payout.failed,
        results: payout.results,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao pagar comissões'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 })
}
