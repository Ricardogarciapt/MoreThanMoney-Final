import Stripe from 'stripe'
import { sanitizeEnv } from '@/lib/env-sanitize'

let stripeClient: Stripe | null = null

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const key = sanitizeEnv(process.env.STRIPE_SECRET_KEY)
    if (!key) throw new Error('STRIPE_SECRET_KEY não configurada')
    stripeClient = new Stripe(key, { apiVersion: '2024-06-20' })
  }
  return stripeClient
}
