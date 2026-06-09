import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSupabaseAdmin } from '@/lib/admin-api-helpers'

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'all'

  let query = supabase
    .from('mlm_commissions')
    .select(`
      *,
      beneficiary:profiles!mlm_commissions_beneficiary_id_fkey(username, full_name),
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

      if (c.beneficiary_id) {
        const { data: b } = await supabase.from('profiles').select('username, full_name').eq('id', c.beneficiary_id).single()
        beneficiary_username = b?.username ?? null
        beneficiary_name = b?.full_name ?? null
      }
      if (c.from_user_id) {
        const { data: f } = await supabase.from('profiles').select('username').eq('id', c.from_user_id).single()
        from_username = f?.username ?? null
      }

      commissions.push({ ...c, beneficiary_username, beneficiary_name, from_username })
    }

    return NextResponse.json({ commissions })
  }

  const commissions = (data || []).map((row: any) => ({
    ...row,
    beneficiary_username: row.beneficiary?.username ?? null,
    beneficiary_name: row.beneficiary?.full_name ?? null,
    from_username: row.from_user?.username ?? null,
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

    return NextResponse.json({ success: true, action: 'approved', count: ids.length })
  }

  if (action === 'pay') {
    // Fetch commissions to be paid
    const { data: commissions, error: fetchError } = await supabase
      .from('mlm_commissions')
      .select('id, beneficiary_id, amount')
      .in('id', ids)
      .eq('status', 'approved')

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Mark as paid
    const { error: updateError } = await supabase
      .from('mlm_commissions')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .in('id', ids)
      .eq('status', 'approved')

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Update totals per beneficiary
    const totalsMap = new Map<string, number>()
    for (const c of (commissions || [])) {
      const prev = totalsMap.get(c.beneficiary_id) ?? 0
      totalsMap.set(c.beneficiary_id, prev + (c.amount ?? 0))
    }

    for (const [beneficiaryId, total] of totalsMap.entries()) {
      // Update mlm_nodes.total_earned
      const { data: node } = await supabase
        .from('mlm_nodes')
        .select('id, total_earned, pending_commissions')
        .eq('user_id', beneficiaryId)
        .single()

      if (node) {
        await supabase
          .from('mlm_nodes')
          .update({
            total_earned: (node.total_earned ?? 0) + total,
            pending_commissions: Math.max(0, (node.pending_commissions ?? 0) - total),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', beneficiaryId)
      }

      // Update profiles.mlm_total_earned
      const { data: profile } = await supabase
        .from('profiles')
        .select('mlm_total_earned')
        .eq('id', beneficiaryId)
        .single()

      if (profile) {
        await supabase
          .from('profiles')
          .update({ mlm_total_earned: (profile.mlm_total_earned ?? 0) + total })
          .eq('id', beneficiaryId)
      }
    }

    return NextResponse.json({ success: true, action: 'paid', count: ids.length })
  }

  return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 })
}
