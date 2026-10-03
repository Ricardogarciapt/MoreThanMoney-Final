import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/** Devolve o promotion_code_id Stripe para aplicar desconto no checkout. */
export async function resolveStripePromotionCode(couponCode: string): Promise<string | null> {
  const code = couponCode.trim().toUpperCase()
  if (!code) return null

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  const { data } = await supabase
    .from('coupons')
    .select('stripe_promotion_code_id, is_active, valid_until, max_uses, used_count')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle()

  if (!data?.stripe_promotion_code_id) return null
  if (data.valid_until && new Date(data.valid_until) < new Date()) return null
  if (data.max_uses != null && data.used_count >= data.max_uses) return null

  return data.stripe_promotion_code_id
}
