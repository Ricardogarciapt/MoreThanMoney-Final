import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/stripe-client'

export type MtmCouponType = 'discount_pct' | 'free_months' | 'free_subscription'
export type StripeDuration = 'once' | 'repeating' | 'forever'

export interface MtmCouponRow {
  code: string
  type: MtmCouponType
  discount_value: number
  max_uses?: number | null
  valid_until?: string | null
  description?: string | null
  stripe_duration?: StripeDuration | null
  stripe_duration_months?: number | null
}

export interface StripeCouponSyncResult {
  stripe_coupon_id: string
  stripe_promotion_code_id: string
}

/** Cria cupão + promotion code no Stripe, sincronizado com a tabela coupons. */
export async function createStripeCouponSync(row: MtmCouponRow): Promise<StripeCouponSyncResult> {
  const stripe = getStripeClient()
  const code = row.code.trim().toUpperCase()

  const couponParams: Stripe.CouponCreateParams = {
    name: code,
    metadata: {
      mtm_code: code,
      mtm_type: row.type,
    },
  }

  // Determine duration: explicit override takes precedence, otherwise derive from type
  const duration: StripeDuration = row.stripe_duration ||
    (row.type === 'free_subscription' ? 'forever' :
     row.type === 'free_months' ? 'repeating' : 'once')

  if (row.type === 'discount_pct') {
    const pct = Math.min(100, Math.max(1, Math.round(Number(row.discount_value) || 0)))
    couponParams.percent_off = pct
  } else {
    couponParams.percent_off = 100
  }

  couponParams.duration = duration
  if (duration === 'repeating') {
    const months = row.stripe_duration_months ??
      (row.type === 'free_months' ? Math.max(1, Math.min(24, Math.round(Number(row.discount_value) || 1))) : 1)
    couponParams.duration_in_months = months
  }

  const stripeCoupon = await stripe.coupons.create(couponParams)

  const promoParams: Stripe.PromotionCodeCreateParams = {
    coupon: stripeCoupon.id,
    code,
    active: true,
    metadata: {
      mtm_code: code,
      mtm_type: row.type,
    },
  }

  if (row.max_uses != null && row.max_uses > 0) {
    promoParams.max_redemptions = row.max_uses
  }

  if (row.valid_until) {
    const expires = Math.floor(new Date(row.valid_until).getTime() / 1000)
    if (expires > Math.floor(Date.now() / 1000)) {
      promoParams.expires_at = expires
    }
  }

  const promotionCode = await stripe.promotionCodes.create(promoParams)

  return {
    stripe_coupon_id: stripeCoupon.id,
    stripe_promotion_code_id: promotionCode.id,
  }
}

/** Desactiva promotion code no Stripe (não apaga histórico). */
export async function deactivateStripePromotionCode(promotionCodeId: string | null | undefined) {
  if (!promotionCodeId) return
  const stripe = getStripeClient()
  await stripe.promotionCodes.update(promotionCodeId, { active: false })
}

/** Reativa promotion code no Stripe. */
export async function activateStripePromotionCode(promotionCodeId: string | null | undefined) {
  if (!promotionCodeId) return
  const stripe = getStripeClient()
  await stripe.promotionCodes.update(promotionCodeId, { active: true })
}
