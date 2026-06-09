import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
const supabaseAdmin = getSupabaseAdmin()

/**
 * POST /api/auth/complete-registration
 *
 * Chamado pela página /success após pagamento Stripe confirmado.
 * Cria a conta Supabase + perfil usando os dados do registo guardados no client.
 *
 * Body: {
 *   sessionId:   string   — Stripe checkout session ID para verificar pagamento
 *   email:       string
 *   password:    string
 *   full_name:   string
 *   username:    string
 *   phone?:      string
 *   whatsapp?:   string
 *   plan:        string   — 'app_member' | 'premium'
 *   billing:     string   — 'monthly' | 'annual'
 * }
 *
 * Returns: { success, userId, alreadyExists }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, email, password, full_name, username, phone, whatsapp, plan, billing } = body

    if (!sessionId || !email || !password || !full_name || !username) {
      return NextResponse.json(
        { error: 'Dados incompletos. sessionId, email, password, full_name e username são obrigatórios.' },
        { status: 400 }
      )
    }

    // 1. Verificar que o pagamento Stripe foi concluído
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Sessão de pagamento não encontrada' }, { status: 404 })
    }
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return NextResponse.json(
        { error: `Pagamento não confirmado. Estado: ${session.payment_status}` },
        { status: 402 }
      )
    }

    // 2. Verificar se conta já existe (idempotência — chamada dupla)
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      console.log(`ℹ️ [COMPLETE-REG] Conta já existe para ${email}`)
      return NextResponse.json({ success: true, userId: existing.id, alreadyExists: true })
    }

    // 3. Criar utilizador Supabase Auth (admin API — não requer confirmação de email)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // confirmar imediatamente (já pagou, sabemos que o email é válido)
      user_metadata: { full_name, username },
    })

    if (authError) {
      if (authError.message.includes('already registered')) {
        // Outro caminho criou a conta entretanto
        const { data: existingUser } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle()
        return NextResponse.json({ success: true, userId: existingUser?.id, alreadyExists: true })
      }
      console.error('❌ [COMPLETE-REG] Erro ao criar utilizador:', authError)
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    const userId = authData.user.id
    const category = plan === 'premium' ? 'premium' : 'standard'

    // 4. Criar perfil
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email,
        full_name,
        username,
        phone: phone || null,
        whatsapp: whatsapp || null,
        user_type: 'member',
        member_category: category,
        is_active: true,
        subscription_plan: plan || 'app_member',
        subscription_billing_cycle: billing || 'monthly',
        subscription_platform: 'stripe',
        stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (profileError) {
      console.error('❌ [COMPLETE-REG] Erro ao criar perfil:', profileError)
      // Conta foi criada no auth mas perfil falhou — log para debug mas não falhar
    }

    // 5. Ligar subscription Stripe ao perfil (via stripe_customer_id)
    if (session.subscription) {
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id
      await supabaseAdmin
        .from('profiles')
        .update({ stripe_subscription_id: subscriptionId })
        .eq('id', userId)
        .catch(() => {/* coluna pode não existir */})
    }

    console.log(`✅ [COMPLETE-REG] Conta criada para ${email} (user: ${userId})`)

    return NextResponse.json({
      success: true,
      userId,
      alreadyExists: false,
    })

  } catch (error: any) {
    console.error('❌ [COMPLETE-REG] Erro inesperado:', error)
    return NextResponse.json(
      { error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
