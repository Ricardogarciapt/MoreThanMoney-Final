import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendNewMemberWelcomeIfEligible } from '@/lib/new-member-welcome'

/**
 * POST /api/partnership/redeem
 *
 * Resgate de um CÓDIGO DE PARCERIA (influencer/UGC). Ao contrário dos cupões de
 * desconto (que só ajustam o preço no checkout), um código com type='partnership'
 * CONCEDE acesso diretamente: Premium (+ VIP opcional) durante `grant_days` dias,
 * sem passar pela Apple/Stripe (é comp, não é venda). Funciona no site e na app
 * `/app-mobile` porque tudo é gravado no Supabase `profiles`.
 *
 * Body: { code: string }   (utilizador autenticado via Bearer token)
 */
export async function POST(req: NextRequest) {
  try {
    // ── 1. Autenticação ────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) {
      return NextResponse.json({ success: false, message: 'Sessão em falta. Inicia sessão e tenta novamente.' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ success: false, message: 'Sessão inválida ou expirada.' }, { status: 401 })
    }
    const userId = user.id

    // ── 2. Código ──────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const rawCode = (body as { code?: string }).code
    if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
      return NextResponse.json({ success: false, message: 'Introduz um código.' }, { status: 400 })
    }
    const code = rawCode.trim().toUpperCase()

    // ── 3. Validar o código de parceria ────────────────────────────────────
    const { data: coupon, error: fetchError } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code)
      .maybeSingle()

    if (fetchError) {
      console.error('[PARTNERSHIP/REDEEM] fetch:', fetchError)
      return NextResponse.json({ success: false, message: 'Erro ao validar o código.' }, { status: 500 })
    }
    if (!coupon) {
      return NextResponse.json({ success: false, message: 'Código inválido ou inexistente.' }, { status: 404 })
    }
    if (coupon.type !== 'partnership') {
      return NextResponse.json({ success: false, message: 'Este código não é de parceria. Usa-o no checkout.' }, { status: 400 })
    }
    if (!coupon.is_active) {
      return NextResponse.json({ success: false, message: 'Este código já não está ativo.' }, { status: 400 })
    }

    const now = new Date()
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      return NextResponse.json({ success: false, message: 'Este código ainda não está disponível.' }, { status: 400 })
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      return NextResponse.json({ success: false, message: 'Este código já expirou.' }, { status: 400 })
    }
    if (coupon.max_uses !== null && (coupon.used_count ?? 0) >= coupon.max_uses) {
      return NextResponse.json({ success: false, message: 'Este código já atingiu o limite de utilizações.' }, { status: 400 })
    }

    // Um resgate por utilizador (unique coupon_id + user_id em coupon_usages).
    const { data: existingUsage } = await supabase
      .from('coupon_usages')
      .select('id')
      .eq('coupon_id', coupon.id)
      .eq('user_id', userId)
      .maybeSingle()
    if (existingUsage) {
      return NextResponse.json({ success: false, message: 'Já resgataste este código anteriormente.' }, { status: 400 })
    }

    // ── 4. Registar utilização (antes de conceder, para respeitar o limite) ─
    const { error: usageError } = await supabase.from('coupon_usages').insert({
      coupon_id: coupon.id,
      user_id: userId,
      used_at: now.toISOString(),
      context: 'partnership',
    })
    if (usageError) {
      // A unique constraint pode disparar em corrida — trata como já-resgatado.
      console.warn('[PARTNERSHIP/REDEEM] usage insert:', usageError.message)
      return NextResponse.json({ success: false, message: 'Já resgataste este código anteriormente.' }, { status: 400 })
    }

    await supabase
      .from('coupons')
      .update({ used_count: (coupon.used_count ?? 0) + 1, updated_at: now.toISOString() })
      .eq('id', coupon.id)

    // ── 5. Conceder o acesso (Premium + VIP opcional) ──────────────────────
    const grantDays = Number(coupon.grant_days) > 0 ? Number(coupon.grant_days) : 60
    const expiresAt = new Date(now.getTime() + grantDays * 86400000).toISOString()
    const grantsVip = coupon.grants_vip === true

    // Lê o estado atual para NÃO fazer downgrade a quem já tem acesso melhor/mais longo.
    const { data: current } = await supabase
      .from('profiles')
      .select('member_category, subscription_plan, subscription_expires_at, subscription_platform')
      .eq('id', userId)
      .maybeSingle()

    const currentExpiry = current?.subscription_expires_at ? new Date(current.subscription_expires_at) : null
    const alreadyLongerPaid =
      current?.subscription_platform &&
      ['app_store', 'stripe', 'google_play'].includes(current.subscription_platform) &&
      currentExpiry && currentExpiry > new Date(expiresAt)

    if (alreadyLongerPaid) {
      // Já tem uma subscrição paga que dura mais do que a parceria → não sobrepor.
      return NextResponse.json({
        success: true,
        already_premium: true,
        message: 'Já tens acesso Premium ativo com validade superior — o código fica registado, sem alterar o teu plano.',
        subscription_expires_at: current!.subscription_expires_at,
      })
    }

    const memberCategory = grantsVip ? 'vip' : 'premium'
    // UPSERT (não UPDATE) — alguns users não têm linha em profiles (trigger de signup
    // nem sempre a cria); com update simples o resgate não concedia nada (0 linhas).
    const { error: grantError } = await supabase
      .from('profiles')
      .upsert({
        id:                         userId,
        email:                      user.email ?? undefined,
        member_category:            memberCategory,
        subscription_plan:          'premium',
        subscription_status:        'active',
        subscription_platform:      'coupon',   // CHECK só aceita app_store/skool/manual/coupon/trial (não 'partnership')
        subscription_billing_cycle: 'monthly',
        subscription_expires_at:    expiresAt,
        next_billing_at:            expiresAt,
        subscription_auto_renew:    false,   // é comp de parceria, não renova
        user_type:                  'member',
        is_active:                  true,
        coupon_code:                code,
        updated_at:                 now.toISOString(),
      }, { onConflict: 'id' })

    if (grantError) {
      console.error('[PARTNERSHIP/REDEEM] grant:', grantError)
      return NextResponse.json({ success: false, message: 'Erro ao ativar o acesso. Contacta o suporte.' }, { status: 500 })
    }

    // ── 6. Email de boas-vindas (não bloqueia a resposta) ──────────────────
    void sendNewMemberWelcomeIfEligible({
      userId,
      source: 'manual',
      planId: 'premium_monthly',
      notifyTeam: true,
      eventId: `partnership_${coupon.id}_${userId}`,
    }).catch((e) => console.warn('[PARTNERSHIP/REDEEM] welcome:', e))

    console.log(`[PARTNERSHIP/REDEEM] ${code} → user ${userId} (${memberCategory}, ${grantDays}d)`)

    return NextResponse.json({
      success: true,
      message: grantsVip
        ? `Parceria ativada! Tens Premium + VIP durante ${grantDays} dias.`
        : `Parceria ativada! Tens Premium durante ${grantDays} dias.`,
      member_category: memberCategory,
      subscription_plan: 'premium',
      subscription_expires_at: expiresAt,
      grant_days: grantDays,
      vip: grantsVip,
    })
  } catch (err: unknown) {
    console.error('[PARTNERSHIP/REDEEM] Erro:', err)
    return NextResponse.json({ success: false, message: 'Erro interno. Tenta novamente.' }, { status: 500 })
  }
}
