/**
 * Deteta se um pedido vem da app iOS nativa (MTM System / shell MTMNativeApp).
 * Usado para BLOQUEAR checkout Stripe na app iOS — a App Store exige In-App Purchase
 * (Apple Guideline 3.1.1). No site/Android o checkout Stripe continua disponível.
 */
export function isIosAppRequest(req: Request): boolean {
  const ua = (req.headers.get('user-agent') || '').toLowerCase()
  // `MTMAuto-iOS` = a app MTM Auto (separador WebTrader): a mesma regra da Apple, a mesma recusa do Stripe.
  return (ua.includes('mtmnativeapp') || ua.includes('mtmauto-ios')) && /iphone|ipad|ipod/.test(ua)
}

export const IOS_IAP_REQUIRED = {
  error: 'As subscrições na app iOS são feitas via App Store (Definições → Subscrição).',
  code: 'ios_iap_required',
} as const
