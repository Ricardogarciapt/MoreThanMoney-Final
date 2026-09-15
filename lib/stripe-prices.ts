import { sanitizeEnv } from '@/lib/env-sanitize'

const PRICE_ENV_KEYS: Record<string, string> = {
  app_member_monthly: 'STRIPE_PRICE_APP_MEMBER_MONTHLY',
  app_member_annual: 'STRIPE_PRICE_APP_MEMBER_ANNUAL',
  premium_monthly: 'STRIPE_PRICE_PREMIUM_MONTHLY',
  premium_annual: 'STRIPE_PRICE_PREMIUM_ANNUAL',
  goldkiller_lifetime: 'STRIPE_PRICE_GOLDKILLER_LIFETIME',
  aurumflow_lifetime: 'STRIPE_PRICE_AURUMFLOW_LIFETIME',
  mtm_scanner_monthly: 'STRIPE_PRICE_MTM_SCANNER_MONTHLY',
  mtm_scanner_lifetime: 'STRIPE_PRICE_MTM_SCANNER_LIFETIME',
  scanners_monthly: 'STRIPE_PRICE_SCANNERS_MONTHLY',
  scanners_semestral: 'STRIPE_PRICE_SCANNERS_SEMESTRAL',
  scanners_lifetime: 'STRIPE_PRICE_SCANNERS_LIFETIME',
  mtmcopy_addon_monthly: 'STRIPE_PRICE_MTMCOPY_ADDON_MONTHLY',
  // Licença do MTM Sensei EA (MetaTrader 5) — uma conta MT5 por licença.
  sensei_ea_annual: 'STRIPE_PRICE_SENSEI_EA_ANNUAL',
  sensei_ea_lifetime: 'STRIPE_PRICE_SENSEI_EA_LIFETIME',
  sensei_scalp_annual: 'STRIPE_PRICE_SENSEI_SCALP_ANNUAL',
  sensei_scalp_lifetime: 'STRIPE_PRICE_SENSEI_SCALP_LIFETIME',
  // Elite / Fundador anual (€597) — acesso Premium + estatuto VIP + perks Elite
  // (isenção de fees, PAMM, negócios digitais, acompanhamento direto).
  elite_annual: 'STRIPE_PRICE_ELITE_ANNUAL',
}

/**
 * Planos que já não se vendem. O preço continua no Stripe (as subscrições antigas renovam e o
 * webhook precisa de o reconhecer), mas nenhum checkout novo o pode abrir.
 *
 * MTM Copy (fase 1 da consolidação): descontinuado. Quem já pagava mantém o acesso — com os
 * mesmos direitos de um subscritor do MTM Auto — até a subscrição acabar.
 */
export const PLANOS_DESCONTINUADOS: Record<string, { error: string; code: string; redirect: string }> = {
  mtmcopy_addon_monthly: {
    error:
      'O MTM Copy foi descontinuado e já não aceita novas subscrições. A cópia automática vive agora no MTM Auto — em morethanmoney.pt/mtmauto.',
    code: 'plano_descontinuado',
    redirect: '/mtmauto',
  },
}

/** Devolve a recusa (para responder com 410) se o plano já não se vende; null caso contrário. */
export function recusaPlanoDescontinuado(planId: unknown) {
  return typeof planId === 'string' ? PLANOS_DESCONTINUADOS[planId] ?? null : null
}

export function getStripePriceId(planId: string): string {
  const envKey = PRICE_ENV_KEYS[planId]
  if (!envKey) return ''
  return sanitizeEnv(process.env[envKey])
}

export function requireStripePriceId(planId: string): string {
  const priceId = getStripePriceId(planId)
  if (!priceId) {
    throw new Error(`Plano "${planId}" não encontrado ou preço não configurado`)
  }
  return priceId
}

/** Mapeia price_id Stripe → planId interno (ex: app_member_monthly). */
export function getPlanIdFromPriceId(priceId: string): string | null {
  const clean = priceId.trim()
  for (const [planId, envKey] of Object.entries(PRICE_ENV_KEYS)) {
    if (sanitizeEnv(process.env[envKey]) === clean) return planId
  }
  return null
}

/** Normaliza planId para subscription_plan no perfil (app_member | premium). */
export function normalizeSubscriptionPlan(planId: string): string {
  // Elite/Fundador dá acesso Premium completo (a distinção Elite vive em member_category='vip').
  if (planId.startsWith('elite')) return 'premium'
  if (planId.startsWith('premium')) return 'premium'
  if (planId.startsWith('app_member')) return 'app_member'
  return planId
}

/** member_category conforme plano. */
export function memberCategoryForPlan(planId: string): string {
  if (planId.startsWith('elite')) return 'vip'
  return planId.startsWith('premium') ? 'premium' : 'standard'
}
