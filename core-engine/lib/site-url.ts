import { sanitizeEnv } from '@/lib/env-sanitize'

const DEFAULT_ORIGIN = 'https://www.morethanmoney.pt'

/** Origem do site sem aspas/newlines acidentais nas env vars da Vercel. */
export function getSiteOrigin(): string {
  const cleaned = sanitizeEnv(process.env.NEXT_PUBLIC_SITE_URL, DEFAULT_ORIGIN)
  try {
    return new URL(cleaned).origin
  } catch {
    return DEFAULT_ORIGIN
  }
}

/** URL de retorno do Stripe Checkout (success/cancel). */
export function buildStripeReturnUrl(
  path: string,
  params: Record<string, string> = {},
  options?: { includeSessionPlaceholder?: boolean }
): string {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, getSiteOrigin())
  if (options?.includeSessionPlaceholder !== false) {
    url.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}')
  }
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}
