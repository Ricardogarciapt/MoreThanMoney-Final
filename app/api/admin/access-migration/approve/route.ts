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

  /**
   * Aprovação manual: quem pagou fora do Stripe e o admin validou à mão.
   *
   * O canal era 'iqonic' — que NÃO é um canal válido. `readAccessMigration` só aceita 'stripe' ou
   * 'skool', por isso o valor era escrito e depois lido como nulo: o registo de por onde a pessoa
   * pagou perdia-se em silêncio. 'skool' é o canal de pagamento-fora-do-Stripe que temos, e é o
   * que isto sempre foi na prática.
   */
  const { couponCode } = await completeAccessMigration({
    userId,
    planId,
    channel: 'skool',
    billingCycle: 'monthly',
    periodEnd: buildSubscriptionExpiry(),
  })

  await supabase
    .from('profiles')
    .update({
      user_type: 'member',
      // A categoria segue o plano aprovado. Era fixa em 'iq' — uma categoria que já não existe em
      // perfil nenhum e que não dá acesso a nada.
      member_category: profile.subscription_plan === 'premium' ? 'premium' : 'member',
      subscription_platform: 'manual',
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  return NextResponse.json({
    success: true,
    status: 'approved',
    coupon_code: couponCode,
    message: 'Acesso aprovado. Pode voltar a fazer login.',
  })
}
