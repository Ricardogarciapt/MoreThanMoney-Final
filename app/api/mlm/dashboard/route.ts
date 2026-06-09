import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/admin-api-helpers'

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  // Bearer token auth
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: userError } = await supabase.auth.getUser(token)
  if (userError || !user) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  try {
    // 1. MLM settings
    const { data: mlmSettings } = await supabase
      .from('mlm_settings')
      .select('is_active, direct_commission_pct')
      .eq('id', 1)
      .single()

    const mlmEnabled = mlmSettings?.is_active ?? false

    if (!mlmEnabled) {
      return NextResponse.json({ mlm_enabled: false, node: null, rank: null, next_rank: null, referral_url: '', recent_commissions: [], downline: [] })
    }

    // 2. Profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, mlm_rank_id')
      .eq('id', user.id)
      .single()

    // 3. Node
    const { data: node } = await supabase
      .from('mlm_nodes')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // 4. Rank
    const rankId = node?.rank_id ?? 0
    const { data: allRanks } = await supabase
      .from('mlm_ranks')
      .select('*')
      .order('sort_order', { ascending: true })

    const ranks = allRanks ?? []
    const currentRank = ranks.find(r => r.id === rankId) ?? ranks[0] ?? null
    const nextRank = currentRank
      ? ranks.find(r => r.sort_order > (currentRank.sort_order ?? 0)) ?? null
      : null

    // 5. Referral URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.morethanmoney.pt'
    const referralUrl = profile?.username
      ? `${baseUrl}/register?ref=${profile.username}`
      : `${baseUrl}/register`

    // 6. Recent commissions
    const { data: recentCommissions } = await supabase
      .from('mlm_commissions')
      .select('*')
      .eq('beneficiary_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    // 7. Downline (direct referrals)
    const { data: downlineNodes } = await supabase
      .from('mlm_nodes')
      .select('user_id, created_at')
      .eq('sponsor_id', user.id)
      .order('created_at', { ascending: false })

    const downline: any[] = []
    for (const dn of (downlineNodes ?? [])) {
      const { data: dnProfile } = await supabase
        .from('profiles')
        .select('username, full_name, subscription_plan, is_active')
        .eq('id', dn.user_id)
        .single()

      const { data: dnNode } = await supabase
        .from('mlm_nodes')
        .select('rank_id')
        .eq('user_id', dn.user_id)
        .single()

      const dnRank = ranks.find(r => r.id === (dnNode?.rank_id ?? 0))

      downline.push({
        username: dnProfile?.username,
        full_name: dnProfile?.full_name,
        subscription_plan: dnProfile?.subscription_plan,
        is_active: dnProfile?.is_active,
        rank_name: dnRank?.name ?? 'Membro',
        joined_at: dn.created_at,
      })
    }

    return NextResponse.json({
      mlm_enabled: true,
      node,
      rank: currentRank,
      next_rank: nextRank,
      referral_url: referralUrl,
      recent_commissions: recentCommissions ?? [],
      downline,
    })

  } catch (err) {
    console.error('[MLM DASHBOARD] Erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
