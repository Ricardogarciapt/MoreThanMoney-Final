import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSupabaseAdmin } from '@/lib/admin-api-helpers'

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { data, error, count } = await supabase
    .from('mlm_nodes')
    .select(`
      *,
      p:profiles!mlm_nodes_user_id_fkey(username, email, full_name, subscription_plan, is_active, subscription_status),
      sp:profiles!mlm_nodes_sponsor_id_fkey(username),
      r:mlm_ranks(name, color, icon)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (error) {
    // Fallback: query manual se as foreign keys nomeadas não existirem
    const { data: nodes, error: nodesError, count: nodesCount } = await supabase
      .from('mlm_nodes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (nodesError) {
      return NextResponse.json({ error: nodesError.message }, { status: 500 })
    }

    // Enrich com dados de profiles e ranks
    const affiliates: any[] = []
    for (const node of (nodes || [])) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('username, email, full_name, subscription_plan, is_active, subscription_status')
        .eq('id', node.user_id)
        .single()

      let sponsor_username: string | null = null
      if (node.sponsor_id) {
        const { data: sp } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', node.sponsor_id)
          .single()
        sponsor_username = sp?.username ?? null
      }

      let rank_name: string | null = null
      let rank_color: string | null = null
      let rank_icon: string | null = null
      if (node.rank_id) {
        const { data: rank } = await supabase
          .from('mlm_ranks')
          .select('name, color, icon')
          .eq('id', node.rank_id)
          .single()
        rank_name = rank?.name ?? null
        rank_color = rank?.color ?? null
        rank_icon = rank?.icon ?? null
      }

      affiliates.push({
        ...node,
        username: prof?.username,
        email: prof?.email,
        full_name: prof?.full_name,
        subscription_plan: prof?.subscription_plan,
        is_active: prof?.is_active,
        subscription_status: prof?.subscription_status,
        sponsor_username,
        rank_name,
        rank_color,
        rank_icon,
      })
    }

    return NextResponse.json({ affiliates, total: nodesCount ?? affiliates.length })
  }

  // Flatten the joined result
  const affiliates = (data || []).map((row: any) => ({
    ...row,
    username: row.p?.username,
    email: row.p?.email,
    full_name: row.p?.full_name,
    subscription_plan: row.p?.subscription_plan,
    is_active: row.p?.is_active,
    subscription_status: row.p?.subscription_status,
    sponsor_username: row.sp?.username ?? null,
    rank_name: row.r?.name ?? null,
    rank_color: row.r?.color ?? null,
    rank_icon: row.r?.icon ?? null,
    p: undefined,
    sp: undefined,
    r: undefined,
  }))

  return NextResponse.json({ affiliates, total: count ?? affiliates.length })
}
