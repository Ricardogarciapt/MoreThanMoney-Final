import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSupabaseAdmin } from '@/lib/admin-api-helpers'

const supabase = getSupabaseAdmin()

function readSkoolPending(profileData: unknown): boolean {
  if (!profileData || typeof profileData !== 'object') return false
  return (profileData as Record<string, unknown>).skool_access_pending === true
}

/** Rede unificada: mlm_nodes + perfis referidos (Stripe/Skool) + dados de pagamento */
export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') // affiliates | referred | sponsors

  const [nodesRes, profilesRes, commissionsRes] = await Promise.all([
    supabase
      .from('mlm_nodes')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select(
        'id, username, email, full_name, subscription_plan, subscription_platform, subscription_status, subscription_expires_at, member_category, is_active, mlm_sponsor_username, stripe_customer_id, stripe_subscription_id, stripe_connect_account_id, stripe_connect_status, profile_data, created_at, coupon_code',
      )
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase.from('mlm_commissions').select('beneficiary_id, from_user_id, amount, status, stripe_session_id'),
  ])

  if (nodesRes.error) {
    return NextResponse.json({ error: nodesRes.error.message }, { status: 500 })
  }
  if (profilesRes.error) {
    return NextResponse.json({ error: profilesRes.error.message }, { status: 500 })
  }

  const nodes = nodesRes.data || []
  const profiles = profilesRes.data || []
  const profileById = new Map(profiles.map((p) => [p.id, p]))

  const rankIds = [...new Set(nodes.map((n) => n.rank_id).filter(Boolean))]
  const rankMap = new Map<number, { name: string; color: string; icon: string }>()
  if (rankIds.length) {
    const { data: ranks } = await supabase
      .from('mlm_ranks')
      .select('id, name, color, icon')
      .in('id', rankIds)
    for (const r of ranks || []) {
      rankMap.set(r.id, { name: r.name, color: r.color, icon: r.icon })
    }
  }

  const nodeByUserId = new Map(nodes.map((n) => [n.user_id, n]))

  const affiliates = nodes.map((node) => {
    const prof = profileById.get(node.user_id)
    const sponsorProf = node.sponsor_id ? profileById.get(node.sponsor_id) : null
    const rank = node.rank_id ? rankMap.get(node.rank_id) : null
    const pd = prof?.profile_data

    return {
      id: node.id,
      user_id: node.user_id,
      username: prof?.username ?? null,
      email: prof?.email ?? null,
      full_name: prof?.full_name ?? null,
      subscription_plan: prof?.subscription_plan ?? null,
      subscription_platform: prof?.subscription_platform ?? null,
      subscription_status: prof?.subscription_status ?? null,
      subscription_expires_at: prof?.subscription_expires_at ?? null,
      member_category: prof?.member_category ?? null,
      is_active: prof?.is_active ?? false,
      mlm_sponsor_username: prof?.mlm_sponsor_username ?? null,
      sponsor_username: sponsorProf?.username ?? prof?.mlm_sponsor_username ?? null,
      stripe_customer_id: prof?.stripe_customer_id ?? null,
      stripe_subscription_id: prof?.stripe_subscription_id ?? null,
      stripe_connect_account_id: prof?.stripe_connect_account_id ?? null,
      stripe_connect_status: prof?.stripe_connect_status ?? null,
      skool_access_pending: readSkoolPending(pd),
      coupon_code: prof?.coupon_code ?? null,
      rank_name: rank?.name ?? null,
      rank_color: rank?.color ?? null,
      rank_icon: rank?.icon ?? null,
      left_count: node.left_count ?? 0,
      right_count: node.right_count ?? 0,
      total_earned: node.total_earned ?? 0,
      pending_commissions: node.pending_commissions ?? 0,
      created_at: node.created_at ?? prof?.created_at,
      in_mlm_tree: true,
    }
  })

  // Perfis referidos (Stripe/registo) ainda sem nó MLM
  const referredOnly = profiles
    .filter((p) => p.mlm_sponsor_username && !nodeByUserId.has(p.id))
    .map((p) => ({
      id: `profile_${p.id}`,
      user_id: p.id,
      username: p.username,
      email: p.email,
      full_name: p.full_name,
      subscription_plan: p.subscription_plan,
      subscription_platform: p.subscription_platform,
      subscription_status: p.subscription_status,
      subscription_expires_at: p.subscription_expires_at,
      member_category: p.member_category,
      is_active: p.is_active,
      mlm_sponsor_username: p.mlm_sponsor_username,
      sponsor_username: p.mlm_sponsor_username,
      stripe_customer_id: p.stripe_customer_id,
      stripe_subscription_id: p.stripe_subscription_id,
      stripe_connect_account_id: p.stripe_connect_account_id,
      stripe_connect_status: p.stripe_connect_status,
      skool_access_pending: readSkoolPending(p.profile_data),
      coupon_code: p.coupon_code,
      rank_name: null,
      rank_color: null,
      rank_icon: null,
      left_count: 0,
      right_count: 0,
      total_earned: 0,
      pending_commissions: 0,
      created_at: p.created_at,
      in_mlm_tree: false,
    }))

  let combined = [...affiliates, ...referredOnly]

  if (view === 'affiliates') {
    combined = affiliates
  } else if (view === 'referred') {
    combined = referredOnly
  } else if (view === 'sponsors') {
    const sponsorUsernames = new Set(
      profiles.filter((p) => p.mlm_sponsor_username).map((p) => p.mlm_sponsor_username!.toLowerCase()),
    )
    combined = combined.filter((a) => sponsorUsernames.has((a.username || '').toLowerCase()))
  }

  const stripeActive = combined.filter(
    (a) => a.subscription_status === 'active' || a.subscription_status === 'trialing',
  ).length
  const skoolPending = combined.filter((a) => a.skool_access_pending).length
  const stripePlatform = combined.filter((a) => a.subscription_platform === 'stripe').length
  const referredCount = referredOnly.length

  const commissions = commissionsRes.data || []
  const pendingCommissionsTotal = commissions
    .filter((c) => c.status === 'pending')
    .reduce((s, c) => s + Number(c.amount || 0), 0)

  return NextResponse.json({
    affiliates: combined,
    total: combined.length,
    stats: {
      total_in_tree: affiliates.length,
      referred_pending_tree: referredCount,
      stripe_active: stripeActive,
      stripe_platform: stripePlatform,
      skool_pending: skoolPending,
      pending_commissions_total: pendingCommissionsTotal,
    },
  })
}
