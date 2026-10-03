import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin, isValidUUID } from '@/lib/admin-api-helpers'
import { completeAccessMigration, mergeAccessMigration } from '@/lib/access-migration'
import { buildSubscriptionExpiry } from '@/lib/member-subscription'
import { sendNewMemberWelcomeIfEligible } from '@/lib/new-member-welcome'

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
   * O canal era '' — que NÃO é um canal válido. `readAccessMigration` só aceita 'stripe' ou
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

  /**
   * O MEMBRO APROVADO À MÃO ENTRAVA EM SILÊNCIO.
   *
   * Esta é a porta de quem pagou fora do Stripe: o admin valida e a pessoa passa a membro. Só que
   * daqui não saía email nenhum — nem as boas-vindas para ela, nem o aviso para o admin e para os
   * uplines da rede dela. Medido a 27/09: o membro aprovado a 08/09 não tem
   * `welcome_email_sent_at` nenhum, e não há aviso nenhum na caixa de entrada desse dia. Quem paga
   * fora do Stripe recebia menos do que quem paga por lá, sem razão nenhuma para isso.
   *
   * `notifyTeam: true` é o que separa as duas coisas: sem ele o membro seria recebido e mais
   * ninguém saberia que ele entrou.
   *
   * Não se espera pelo envio (`void`) nem se deixa uma falha de email derrubar a aprovação: o
   * acesso já está dado e gravado, e uma caixa de correio em baixo não pode desfazer isso. A
   * repetição está travada dentro de `sendNewMemberWelcomeIfEligible` pelo `welcome_email_sent_at`.
   */
  void sendNewMemberWelcomeIfEligible({
    userId,
    source: 'admin',
    planId,
    notifyTeam: true,
  }).catch((e) => console.error('[access-migration/approve] boas-vindas falharam:', e))

  return NextResponse.json({
    success: true,
    status: 'approved',
    coupon_code: couponCode,
    message: 'Acesso aprovado. Pode voltar a fazer login.',
  })
}
