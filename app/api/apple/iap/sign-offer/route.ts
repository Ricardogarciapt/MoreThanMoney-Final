import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { avaliarCupao, MENSAGEM_RECUSA } from '@/lib/cupoes-codigo'
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

    // 1. Cupão válido na nossa tabela (normalização, datas e usos reais — lib/cupoes-codigo.ts).
    const r = await avaliarCupao(supabase, couponCode)
    if (!r.ok) {
      return NextResponse.json({ valid: false, error: MENSAGEM_RECUSA[r.motivo] }, { status: r.motivo === 'erro' ? 500 : 200 })
    }
    const coupon = r.cupao
    if (coupon.marketplace_produto_id || coupon.marketplace_educator_id || coupon.plan_override === 'mtmfunded') {
      return NextResponse.json({ valid: false, error: 'Cupão não aplicável a este produto' })
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
