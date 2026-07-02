// lib/apple-iap.ts
// Utilitários para validação de recibos Apple IAP (StoreKit 2) e assinatura de ofertas promocionais.

import crypto from 'crypto'

export const APPLE_BUNDLE_ID = 'pt.morethanmoney.app'

// Planos disponíveis no App Store Connect
export const APPLE_PRODUCTS = {
  member_monthly:   'pt.morethanmoney.app.member.monthly',
  member_annual:    'pt.morethanmoney.app.member.annual',
  premium_monthly:  'pt.morethanmoney.app.premium.monthly',
  premium_annual:   'pt.morethanmoney.app.premium.annual',
} as const

// Ofertas promocionais configuradas no App Store Connect
export const APPLE_PROMO_OFFERS = {
  founder_50pct: 'founder_50pct', // 50% off — cupão 50OFFFOUNDER
  mtm_founder:   'mtm_founder',   // 1 mês grátis — cupão MTMFOUNDER
} as const

/** Preços base em cêntimos (EUR) para comissões MLM quando a plataforma não envia valor (Apple). */
export const PLAN_AMOUNT_CENTS_EUR: Record<string, number> = {
  app_member: 3500,
  app_member_monthly: 3500,
  app_member_annual: 33600,
  premium: 6500,
  premium_monthly: 6500,
  premium_annual: 62400,
  [APPLE_PRODUCTS.member_monthly]: 3500,
  [APPLE_PRODUCTS.member_annual]: 33600,
  [APPLE_PRODUCTS.premium_monthly]: 6500,
  [APPLE_PRODUCTS.premium_annual]: 62400,
}

export function planAmountCentsEur(planOrProductId: string): number {
  return PLAN_AMOUNT_CENTS_EUR[planOrProductId] ?? 3500
}

// Mapeamento de produto → plano Supabase
export function productToSubscriptionPlan(productId: string): { plan: string; category: string; billing: string } {
  switch (productId) {
    case APPLE_PRODUCTS.member_monthly:
      return { plan: 'app_member_monthly', category: 'standard', billing: 'monthly' }
    case APPLE_PRODUCTS.member_annual:
      return { plan: 'app_member_annual', category: 'standard', billing: 'annual' }
    case APPLE_PRODUCTS.premium_monthly:
      return { plan: 'premium_monthly', category: 'premium', billing: 'monthly' }
    case APPLE_PRODUCTS.premium_annual:
      return { plan: 'premium_annual', category: 'premium', billing: 'annual' }
    default:
      return { plan: 'app_member_monthly', category: 'standard', billing: 'monthly' }
  }
}

// Decode JWS payload de StoreKit 2 (sem verificação criptográfica completa — confiamos no cliente iOS)
// Para verificação completa usa @apple/app-store-server-library
export function decodeJWSPayload(jws: string): Record<string, unknown> | null {
  try {
    const parts = jws.split('.')
    if (parts.length !== 3) return null
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8')
    return JSON.parse(payload)
  } catch {
    return null
  }
}

// Assinar oferta promocional Apple (ECDSA P-256)
// Necessita de APPLE_IAP_KEY (.p8), APPLE_IAP_KEY_ID e APPLE_IAP_ISSUER_ID nas env vars
export function signPromotionalOffer(opts: {
  productId: string
  offerIdentifier: string
  applicationUsername: string
  nonce: string
  timestamp: number
}): { signature: string; keyIdentifier: string; nonce: string; timestamp: number } | null {
  // Aceita a chave com newlines reais (multiline) ou com \n escapado (single-line em env var).
  const keyPem  = process.env.APPLE_IAP_KEY?.replace(/\\n/g, '\n')
  const keyId   = process.env.APPLE_IAP_KEY_ID

  if (!keyPem || !keyId) {
    console.error('[APPLE-IAP] APPLE_IAP_KEY ou APPLE_IAP_KEY_ID não configurados')
    return null
  }

  try {
    // O payload a assinar é:
    // bundleId + '\0' + keyId + '\0' + productId + '\0' + offerIdentifier + '\0' + appUsername + '\0' + nonce + '\0' + timestamp
    const payload = [
      APPLE_BUNDLE_ID,
      keyId,
      opts.productId,
      opts.offerIdentifier,
      opts.applicationUsername,
      opts.nonce.toLowerCase(),
      String(opts.timestamp),
    ].join('\0')

    const sign = crypto.createSign('SHA256')
    sign.update(payload)
    sign.end()

    const signature = sign.sign({
      key: keyPem,
      format: 'pem',
      type: 'pkcs8',
      dsaEncoding: 'ieee-p1363', // Apple espera formato IEEE P1363 (r || s concatenado)
    }, 'base64')

    return {
      signature,
      keyIdentifier: keyId,
      nonce: opts.nonce,
      timestamp: opts.timestamp,
    }
  } catch (err) {
    console.error('[APPLE-IAP] Erro ao assinar oferta:', err)
    return null
  }
}

// Verificar identity token do Sign in with Apple via JWKS da Apple
export async function verifyAppleIdentityToken(identityToken: string, nonce: string): Promise<{
  appleUserId: string
  email?: string
  emailVerified?: boolean
} | null> {
  try {
    const { createRemoteJWKSet, jwtVerify } = await import('jose')

    const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys')
    const jwks = createRemoteJWKSet(APPLE_JWKS_URL)

    const { payload } = await jwtVerify(identityToken, jwks, {
      issuer:   'https://appleid.apple.com',
      audience: APPLE_BUNDLE_ID,
    })

    // Verificar nonce (SHA-256 hash do nonce original)
    const nodeCrypto = await import('crypto')
    const nonceHash = nodeCrypto.default
      .createHash('sha256')
      .update(nonce)
      .digest('hex')

    if (payload.nonce !== nonceHash) {
      console.error('[SIWA] Nonce inválido')
      return null
    }

    return {
      appleUserId:   payload.sub as string,
      email:         payload.email as string | undefined,
      emailVerified: payload.email_verified === 'true' || payload.email_verified === true,
    }
  } catch (err) {
    console.error('[SIWA] Erro ao verificar identity token:', err)
    return null
  }
}
