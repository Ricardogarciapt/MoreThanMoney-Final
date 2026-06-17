import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin, isValidUUID } from '@/lib/admin-api-helpers'
import { completeAccessMigration, mergeAccessMigration } from '@/lib/access-migration'
import { buildSubscriptionExpiry } from '@/lib/member-subscription'

const supabase = getSupabaseAdmin()

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const userId = String(body.user_id ?? '').trim()
  const action = body.action as 'approve' | 'reject'

  if (!isValidUUID(userId)) {
    return NextResponse.json({ error: 'user_id inválido' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Utilizador não encontrado' }, { status: 404 })
  }

  if (action === 'reject') {
    const profileData = mergeAccessMigration(profile, {
      access_validation_status: 'rejected',
    })
    await supabase
      .from('profiles')
      .update({
        profile_data: profileData,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    return NextResponse.json({ success: true, status: 'rejected' })
  }

  const planId =
    profile.subscription_plan === 'premium' ? 'premium_monthly' : 'app_member_monthly'

  const { couponCode } = await completeAccessMigration({
    userId,
    planId,
    channel: 'iqonic',
    billingCycle: 'monthly',
    periodEnd: buildSubscriptionExpiry(),
  })

  await supabase
    .from('profiles')
    .update({
      user_type: 'member',
      member_category: 'iq',
      subscription_platform: 'manual',
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  return NextResponse.json({
    success: true,
    status: 'approved',
    coupon_code: couponCode,
    message: 'Membro IQONIC aprovado. Pode voltar a fazer login.',
  })
}
