import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { signPromotionalOffer, resolveAppleOfferForCoupon } from '@/lib/apple-iap'

const supabase = getSupabaseAdmin()

// POST /api/apple/iap/sign-offer
// Valida cupão e assina a oferta promocional Apple para desconto no IAP.
export async function POST(req: NextRequest) {
  try {
    const { couponCode, productId, applicationUsername = '' } = await req.json()

    if (!couponCode || !productId) {
      return NextResponse.json({ error: 'couponCode e productId obrigatórios' }, { status: 400 })
    }

    const code = couponCode.trim().toUpperCase()

    // 1. Verificar se o cupão existe e é válido na nossa tabela
    const { data: coupon } = await supabase
      .from('coupons')
      .select('id, code, type, discount_value, plan_override, max_uses, used_count, valid_from, valid_until, is_active, apple_offer_id, apple_offer_products')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle()

    if (!coupon) {
      return NextResponse.json({ valid: false, error: 'Cupão inválido ou expirado' }, { status: 200 })
    }

    // Verificar validade temporal
    const now = new Date()
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      return NextResponse.json({ valid: false, error: 'Cupão ainda não activo' })
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      return NextResponse.json({ valid: false, error: 'Cupão expirado' })
    }
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      return NextResponse.json({ valid: false, error: 'Cupão esgotado' })
    }

    // 2. Obter oferta Apple correspondente (sincronizado com a tabela coupons)
    const offerConfig = resolveAppleOfferForCoupon(coupon)
    if (!offerConfig) {
      // Cupão válido no nosso sistema mas sem oferta Apple configurada
      return NextResponse.json({
        valid:           true,
        hasAppleOffer:   false,
        couponType:      coupon.type,
        discountValue:   coupon.discount_value,
      })
    }

    if (!offerConfig.applicableProducts.includes(productId)) {
      return NextResponse.json({ valid: false, error: 'Cupão não aplicável a este produto' })
    }

    // 3. Assinar a oferta promocional
    const nonce     = crypto.randomUUID()
    const timestamp = Date.now()

    const signed = signPromotionalOffer({
      productId,
      offerIdentifier:     offerConfig.offerIdentifier,
      applicationUsername: applicationUsername,
      nonce,
      timestamp,
    })

    if (!signed) {
      // Chave de assinatura não configurada — retornar válido sem oferta Apple
      console.warn('[SIGN-OFFER] Chave APPLE_IAP_KEY não configurada, a retornar sem assinatura')
      return NextResponse.json({
        valid:           true,
        hasAppleOffer:   false,
        couponType:      coupon.type,
        discountValue:   coupon.discount_value,
      })
    }

    return NextResponse.json({
      valid:           true,
      hasAppleOffer:   true,
      offerIdentifier: offerConfig.offerIdentifier,
      keyIdentifier:   signed.keyIdentifier,
      nonce:           signed.nonce,
      signature:       signed.signature,
      timestamp:       signed.timestamp,
      couponType:      coupon.type,
      discountValue:   coupon.discount_value,
    })
  } catch (err) {
    console.error('[SIGN-OFFER] Erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
