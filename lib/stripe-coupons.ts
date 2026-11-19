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

// ── Sincronização cupão ↔ Stripe (19/11/2026) ────────────────────────────────────────────────
//
// A tabela `coupons` é a fonte da verdade; o Stripe tem de a espelhar. Até aqui só a criação e o
// ligar/desligar iam ao Stripe: editar a data de fim, o desconto ou os usos no painel ficava só
// na base, e ativar um cupão criado sem Stripe (50OFFFOUNDER) deixava-o a «dar 50 %» no ecrã e
// a cobrar o preço normal. Esta função põe o Stripe igual à linha, e o cron diário passa-a por
// todos os cupões.

export type LinhaParaSync = MtmCouponRow & {
  id: string
  is_active: boolean
  valid_from: string | null
  plan_override: string | null
  stripe_coupon_id: string | null
  stripe_promotion_code_id: string | null
  marketplace_produto_id?: string | null
  marketplace_educator_id?: string | null
}

export type AcaoSync = 'ok' | 'criado' | 'recriado' | 'desativado' | 'desligar_na_base' | 'ignorado' | 'erro'

function termosEsperados(row: MtmCouponRow) {
  const duration: StripeDuration =
    row.stripe_duration ||
    (row.type === 'free_subscription' ? 'forever' : row.type === 'free_months' ? 'repeating' : 'once')
  const percent_off =
    row.type === 'discount_pct' ? Math.min(100, Math.max(1, Math.round(Number(row.discount_value) || 0))) : 100
  const duration_in_months =
    duration === 'repeating'
      ? row.stripe_duration_months ??
        (row.type === 'free_months' ? Math.max(1, Math.min(24, Math.round(Number(row.discount_value) || 1))) : 1)
      : null
  return { duration, percent_off, duration_in_months }
}

/**
 * Põe o Stripe igual à linha do cupão. `vivo` = a linha diz que se pode usar agora (ativo, dentro
 * das datas e com usos); quem chama decide-o porque precisa de contar `coupon_usages`.
 */
export async function sincronizarCupaoComStripe(
  row: LinhaParaSync,
  vivo: boolean,
  /** `painel`: o admin acabou de mudar a linha — a linha manda. `cron`: um código desligado à mão no
   *  Stripe (ou já gasto lá) desliga também a linha, em vez de ser religado às escondidas. */
  origem: 'painel' | 'cron' = 'cron',
): Promise<{ acao: AcaoSync; stripe_coupon_id?: string; stripe_promotion_code_id?: string; detalhe?: string }> {
  const stripe = getStripeClient()
  try {
    // Morto na base → o promotion code não pode ficar ativo no Stripe.
    if (!vivo) {
      if (!row.stripe_promotion_code_id) return { acao: 'ignorado' }
      const promo = await stripe.promotionCodes.retrieve(row.stripe_promotion_code_id)
      if (!promo.active) return { acao: 'ok' }
      await stripe.promotionCodes.update(promo.id, { active: false })
      return { acao: 'desativado' }
    }

    // Vivo sem Stripe → criar.
    if (!row.stripe_promotion_code_id || !row.stripe_coupon_id) {
      const r = await createStripeCouponSync(row)
      return { acao: 'criado', ...r }
    }

    const promo = await stripe.promotionCodes.retrieve(row.stripe_promotion_code_id)
    // Gasto no Stripe (ex.: LILLYMTM, 1 de 1) conta como gasto, mesmo que a base não o saiba.
    const gastoNoStripe = promo.max_redemptions != null && promo.times_redeemed >= promo.max_redemptions
    if (gastoNoStripe) {
      if (promo.active) await stripe.promotionCodes.update(promo.id, { active: false })
      return { acao: 'desligar_na_base', detalhe: 'usos esgotados no Stripe' }
    }
    if (!promo.active && origem === 'cron') {
      return { acao: 'desligar_na_base', detalhe: 'desligado no Stripe' }
    }
    // API fixada em 2024-06-20 (lib/stripe-client.ts): o cupão vem em `promo.coupon`.
    const coupon = promo.coupon?.id ? await stripe.coupons.retrieve(promo.coupon.id).catch(() => null) : null
    const esperado = termosEsperados(row)

    const couponCerto =
      !!coupon &&
      coupon.valid !== false &&
      coupon.percent_off === esperado.percent_off &&
      coupon.duration === esperado.duration &&
      // Os meses de um `repeating` não ficam guardados na base: só se comparam quando vêm do painel.
      (esperado.duration !== 'repeating' || row.stripe_duration_months == null ||
        coupon.duration_in_months === row.stripe_duration_months)

    const expiraEsperado = row.valid_until ? Math.floor(new Date(row.valid_until).getTime() / 1000) : null
    const promoCerto =
      (promo.expires_at ?? null) === expiraEsperado &&
      (promo.max_redemptions ?? null) === (row.max_uses != null && row.max_uses > 0 ? row.max_uses : null)

    if (!couponCerto && origem === 'cron' && coupon && coupon.valid === false) {
      return { acao: 'desligar_na_base', detalhe: 'cupão apagado/expirado no Stripe' }
    }
    if (couponCerto && promoCerto) {
      if (!promo.active) {
        await stripe.promotionCodes.update(promo.id, { active: true })
        return { acao: 'recriado', detalhe: 'promo reativado' }
      }
      return { acao: 'ok' }
    }

    // Termos mudaram: o Stripe não deixa editar desconto, duração, limite nem fim de um código —
    // desliga-se o antigo (o histórico fica) e cria-se outro com o mesmo código.
    if (promo.active) await stripe.promotionCodes.update(promo.id, { active: false })
    if (couponCerto && coupon) {
      const code = row.code.trim().toUpperCase()
      const params: Stripe.PromotionCodeCreateParams = {
        coupon: coupon.id,
        code,
        active: true,
        metadata: { mtm_code: code, mtm_type: row.type },
      }
      if (row.max_uses != null && row.max_uses > 0) params.max_redemptions = row.max_uses
      if (expiraEsperado && expiraEsperado > Math.floor(Date.now() / 1000)) params.expires_at = expiraEsperado
      const novo = await stripe.promotionCodes.create(params)
      return { acao: 'recriado', stripe_coupon_id: coupon.id, stripe_promotion_code_id: novo.id, detalhe: 'limites/fim' }
    }
    const r = await createStripeCouponSync(row)
    return { acao: 'recriado', ...r, detalhe: 'desconto/duração' }
  } catch (e) {
    return { acao: 'erro', detalhe: e instanceof Error ? e.message : String(e) }
  }
}
