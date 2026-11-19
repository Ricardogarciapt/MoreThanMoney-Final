/**
 * GUARDA dos cupões no registo e na app (19/11/2026).
 *
 *   npx tsx lib/cupoes-codigo.check.ts
 */
import { normalizarCodigoCupao, planoParaCupao, precisaDeStripe } from './cupoes-codigo'
import { pareceCupao, ehCupaoCampanha90d } from './stripe-checkout-premium'
import { resolveAppleOfferForCoupon, APPLE_PRODUCTS } from './apple-iap'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }

// «SHE IS FACELESS» e variantes chegam ao mesmo código.
teste('espaços', normalizarCodigoCupao(' She Is  Faceless ') === 'SHEISFACELESS')
teste('hífens ficam', normalizarCodigoCupao('mtm-app-b0e1') === 'MTM-APP-B0E1')
teste('não-string', normalizarCodigoCupao(undefined) === '')
teste('pareceCupao aceita espaços', pareceCupao('She Is Faceless'))
teste('pareceCupao recusa email', !pareceCupao('ana@gmail.com'))
teste('campanha com espaços', ehCupaoCampanha90d('90days previousxp'))

// O cupão manda no plano.
teste('membro força membro', planoParaCupao('app_member', 'premium_monthly') === 'app_member_monthly')
teste('membro mantém anual', planoParaCupao('app_member', 'premium_annual') === 'app_member_annual')
teste('premium força premium', planoParaCupao('premium', 'app_member_monthly') === 'premium_monthly')
teste('both aceita membro', planoParaCupao('both', 'app_member_monthly') === 'app_member_monthly')
teste('sem override', planoParaCupao(null, 'elite_annual') === 'elite_annual')
teste('mtmfunded fora', planoParaCupao('mtmfunded', 'premium_monthly') === null)

// Quem precisa de promotion code no Stripe.
const base = { marketplace_produto_id: null, marketplace_educator_id: null }
teste('desconto precisa', precisaDeStripe({ ...base, type: 'discount_pct', code: 'X' }))
teste('por pessoa não', !precisaDeStripe({ ...base, type: 'free_subscription', code: 'MTM-APP-1-2' }))
teste('parceria não', !precisaDeStripe({ ...base, type: 'partnership', code: 'CREATOR60' }))

// Apple: oferta explícita sem lista de produtos respeita o plano do cupão.
const membro = resolveAppleOfferForCoupon({ apple_offer_id: 'mtm_founder', apple_offer_products: null, type: 'free_subscription', discount_value: 0, plan_override: 'app_member' })
teste('apple membro só membro', !!membro && !membro.applicableProducts.includes(APPLE_PRODUCTS.premium_monthly) && membro.applicableProducts.includes(APPLE_PRODUCTS.member_monthly))
const lista = resolveAppleOfferForCoupon({ apple_offer_id: 'mtm_founder', apple_offer_products: [APPLE_PRODUCTS.premium_monthly], type: 'free_months', discount_value: 1, plan_override: 'app_member' })
teste('apple lista fora do plano → sem oferta', lista === null)

if (falhas.length) {
  console.error('FALHOU:\n - ' + falhas.join('\n - '))
  process.exit(1)
}
console.log('cupoes-codigo: tudo certo')
