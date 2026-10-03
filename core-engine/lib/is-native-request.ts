/**
 * Deteta se um pedido vem de uma app iOS nossa (MTM System ou MTM Auto).
 * Usado para BLOQUEAR checkout Stripe na app iOS — a App Store exige In-App Purchase
 * (Apple Guideline 3.1.1). No site/Android o checkout Stripe continua disponível.
 *
 * ── Porque delega em `ehIosNativo` ──────────────────────────────────────────────────────────
 * Até 24/09 esta função tinha regra própria: `/iphone|ipad|ipod/`. Faltava-lhe o iPad em modo
 * secretária, que se anuncia como «Macintosh» — o caso que `lib/app-nativa.ts` já conhecia e que
 * o comentário de lá descreve como tendo deixado aparecer links de compra Stripe dentro da app.
 *
 * O lado CLIENTE escondia o botão (usa `ehIosNativo`); o lado SERVIDOR deixava passar o pedido.
 * Num iPad em modo secretária dentro da app, isso abria o checkout Stripe em
 * /api/stripe/create-checkout-session, /api/stripe/create-portal-session, /api/mtmfunded/checkout
 * e /api/access-migration/checkout, e devolvia `compraPermitida: true` em /api/contas e
 * /api/webtrader/contas — pagamento externo dentro da app, que é a 3.1.1 à letra.
 *
 * Duas regras para a mesma pergunta é como isto aconteceu, por isso passa a haver uma só. A
 * paridade das três funções de detecção está presa em lib/__tests__/deteccao-ios.check.ts.
 */
import { ehIosNativo } from './app-nativa'

export function isIosAppRequest(req: Request): boolean {
  return ehIosNativo(req.headers.get('user-agent'))
}

export const IOS_IAP_REQUIRED = {
  error: 'As subscrições na app iOS são feitas via App Store (Definições → Subscrição).',
  code: 'ios_iap_required',
} as const
