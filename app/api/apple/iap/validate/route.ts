import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { decodeJWSPayload, productToSubscriptionPlan, APPLE_BUNDLE_ID } from '@/lib/apple-iap'
import {
  appleMlmContext,
  applePaymentReference,
  processMlmSubscriptionSignup,
} from '@/lib/mlm-subscription-integration'
import { sendNewMemberWelcomeIfEligible } from '@/lib/new-member-welcome'

const supabase = getSupabaseAdmin()

// POST /api/apple/iap/validate
// Recebe o JWS token de StoreKit 2, activa a subscrição em Supabase e regista o cupão se aplicável.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      jwsToken,
      userId,          // UUID do utilizador no Supabase (se já autenticado)
      email,           // email para criar conta (se novo utilizador)
      couponCode,      // código de cupão aplicado (opcional)
      sponsorUsername, // patrocinador MLM (ref=username)
      environment,     // 'production' | 'sandbox'
    } = body

    if (!jwsToken) {
      return NextResponse.json({ error: 'jwsToken obrigatório' }, { status: 400 })
    }

    // Decode the StoreKit 2 JWS payload
    const txPayload = decodeJWSPayload(jwsToken)
    if (!txPayload) {
      return NextResponse.json({ error: 'JWS token inválido' }, { status: 400 })
    }

    const productId            = txPayload.productId as string
    const transactionId        = String(txPayload.transactionId ?? txPayload.transaction_id ?? '')
    const originalTransactionId = String(txPayload.originalTransactionId ?? txPayload.original_transaction_id ?? transactionId)
    const expiresDateMs        = (txPayload.expiresDate as number) ?? (txPayload.expires_date_ms as number) ?? 0
    const bundleId             = txPayload.bundleId as string ?? txPayload.bundle_id as string

    if (bundleId && bundleId !== APPLE_BUNDLE_ID) {
      return NextResponse.json({ error: 'Bundle ID inválido' }, { status: 400 })
    }

    const { plan, category, billing } = productToSubscriptionPlan(productId)
    const expiresAt = expiresDateMs ? new Date(expiresDateMs).toISOString() : null

    // Verificar se transacção já foi processada (idempotência)
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, subscription_status')
      .eq('apple_original_transaction_id', originalTransactionId)
      .maybeSingle()

    let resolvedUserId = userId || existing?.id

    if (!resolvedUserId) {
      const authHeader = req.headers.get('authorization') || ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()
      if (token) {
        const { data: userData } = await supabase.auth.getUser(token)
        if (userData?.user?.id) resolvedUserId = userData.user.id
      }
    }

    if (!resolvedUserId) {
      // Tentar encontrar por email
      if (email) {
        const { data: byEmail } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email.toLowerCase())
          .maybeSingle()
        resolvedUserId = byEmail?.id
      }
    }

    if (!resolvedUserId) {
      return NextResponse.json({
        error: 'Utilizador não encontrado. Cria conta primeiro.',
        requiresRegistration: true,
        transactionId,
        originalTransactionId,
        productId,
        plan,
        category,
        billing,
        expiresAt,
      }, { status: 404 })
    }

    const sponsor = (sponsorUsername as string | undefined)?.trim()

    // Activar subscrição no Supabase
    const updatePayload: Record<string, unknown> = {
      subscription_plan:          plan,
      member_category:            category,
      subscription_billing_cycle: billing,
      subscription_status:        'active',
      subscription_platform:      'app_store',
      subscription_expires_at:    expiresAt,
      next_billing_at:            expiresAt,
      user_type:                  'member',
      is_active:                  true,
      apple_original_transaction_id: originalTransactionId,
      apple_product_id:           productId,
      updated_at:                 new Date().toISOString(),
    }

    if (sponsor) {
      updatePayload.mlm_sponsor_username = sponsor
    }

    // Registar cupão se fornecido
    const couponUpper = (couponCode || '').trim().toUpperCase()
    if (couponUpper) {
      updatePayload.coupon_code = couponUpper
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', resolvedUserId)

    if (updateError) {
      console.error('[APPLE-IAP] Erro ao activar subscrição:', updateError)
      return NextResponse.json({ error: 'Erro ao activar subscrição' }, { status: 500 })
    }

    // Registar uso de cupão na tabela coupon_usages
    if (couponUpper) {
      try {
        const { data: coupon } = await supabase
          .from('coupons')
          .select('id')
          .eq('code', couponUpper)
          .eq('is_active', true)
          .maybeSingle()

        if (coupon) {
          await supabase.from('coupon_usages').upsert(
            { coupon_id: coupon.id, user_id: resolvedUserId, context: 'apple_iap' },
            { onConflict: 'coupon_id,user_id' }
          )
          await supabase.rpc('increment_coupon_usage', { coupon_id: coupon.id }).then(() => {})
          // Fallback manual se RPC não existir
          await supabase
            .from('coupons')
            .update({ used_count: supabase.rpc as unknown as number })
            .eq('id', coupon.id)
            .then(() => {}) // fire-and-forget
        }
      } catch (couponErr) {
        console.error('[APPLE-IAP] Erro ao registar cupão:', couponErr)
      }
    }

    // MLM: comissão directa + árvore (primeira compra / restore idempotente)
    try {
      const mlmCtx = appleMlmContext(productId, plan)
      await processMlmSubscriptionSignup(supabase, {
        userId: resolvedUserId,
        sponsorUsername: sponsor,
        planId: mlmCtx.planId,
        amountCents: mlmCtx.amountCents,
        currency: mlmCtx.currency,
        paymentReference: applePaymentReference('purchase', transactionId || originalTransactionId),
        platform: 'apple',
      })
    } catch (mlmErr) {
      console.error('[APPLE-IAP] Erro MLM signup:', mlmErr)
    }

    const wasAlreadyActive = existing?.subscription_status === 'active'
    if (!wasAlreadyActive) {
      const mlmCtx = appleMlmContext(productId, plan)
      void sendNewMemberWelcomeIfEligible({
        userId: resolvedUserId,
        source: 'app_store',
        planId: mlmCtx.planId,
        sponsorUsername: sponsor,
        notifyTeam: true,
        eventId: `apple_validate_${originalTransactionId}`,
      })
    }

    console.log(`✅ [APPLE-IAP] Subscrição activada: user=${resolvedUserId} plan=${plan} tx=${transactionId}`)

    return NextResponse.json({
      success:     true,
      userId:      resolvedUserId,
      plan,
      category,
      billing,
      expiresAt,
      transactionId,
      originalTransactionId,
    })
  } catch (err) {
    console.error('[APPLE-IAP] Erro:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
