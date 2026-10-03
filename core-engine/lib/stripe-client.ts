import Stripe from 'stripe'
import { sanitizeEnv } from '@/lib/env-sanitize'

/** Versão da API Stripe que este código assume. Mudar isto muda a forma das respostas. */
export const STRIPE_API_VERSION = '2024-06-20'

let stripeClient: Stripe | null = null

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const key = sanitizeEnv(process.env.STRIPE_SECRET_KEY)
    if (!key) throw new Error('STRIPE_SECRET_KEY não configurada')
    // Versão da API FIXADA de propósito: é a forma de resposta que este código lê.
    // Os tipos do SDK (v18) descrevem uma API mais recente, por isso o cast — e daí
    // existirem os acessores abaixo para os campos que mudaram de sítio nessa versão.
    stripeClient = new Stripe(key, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion })
  }
  return stripeClient
}

/**
 * Campos que a API 2024-06-20 devolve e que os tipos do SDK v18 já não declaram
 * (mudaram de sítio em versões posteriores). Ficam isolados aqui, com nome, em vez de
 * espalhados por casts anónimos — quando a versão da API subir, é só aqui que se mexe.
 */

/** Fim do período da subscrição, em segundos epoch. */
export function stripeSubscriptionPeriodEnd(sub: unknown): number {
  const s = sub as { current_period_end?: unknown; items?: { data?: { current_period_end?: unknown }[] } } | null
  const v = s?.current_period_end
  if (typeof v === 'number' && v > 0) return v
  // Nas versões novas da API o fim do período vive em cada item. Sem isto devolvia 0 e o
  // perfil ficava com expiração em 1970 (casos rubensousacaneco/lucasstark83, 17/09).
  const nosItens = (s?.items?.data ?? []).map((i) => (typeof i.current_period_end === 'number' ? i.current_period_end : 0))
  return nosItens.length ? Math.max(0, ...nosItens) : 0
}

/** Preço de uma linha de fatura. */
export function stripeInvoiceLinePrice(line: unknown): Stripe.Price | undefined {
  return (line as { price?: Stripe.Price })?.price
}
