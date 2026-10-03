// lib/apple-iap-verify.ts
// Verificação CRIPTOGRÁFICA de signed transactions / notificações do App Store Server
// (StoreKit 2) usando a biblioteca oficial da Apple. Substitui o antigo decodeJWSPayload,
// que apenas fazia base64 decode e NÃO validava a assinatura (falha de segurança:
// qualquer pedido forjado ativava uma subscrição).
//
// Verifica a cadeia de certificados x5c contra os certificados raiz da Apple + bundleId +
// appAppleId + ambiente. NÃO precisa da chave .p8 (essa só é necessária para CHAMAR a
// App Store Server API ou assinar ofertas promocionais).

import { SignedDataVerifier, Environment } from '@apple/app-store-server-library'
import { APPLE_ROOT_CAS_B64 } from './apple-certs'
import { APPLE_BUNDLE_ID } from './apple-iap'

const APP_APPLE_ID = 6778558643 // MTM System (id da app na App Store)

const rootCerts = APPLE_ROOT_CAS_B64.map((b64) => Buffer.from(b64, 'base64'))

// enableOnlineChecks=false → verificação offline da cadeia (sem dependência de OCSP/rede
// na função serverless). A assinatura continua a ser validada criptograficamente.
const ONLINE_CHECKS = false

const verifiers = new Map<Environment, SignedDataVerifier>()

function getVerifier(env: Environment): SignedDataVerifier {
  let v = verifiers.get(env)
  if (!v) {
    v = new SignedDataVerifier(rootCerts, ONLINE_CHECKS, env, APPLE_BUNDLE_ID, APP_APPLE_ID)
    verifiers.set(env, v)
  }
  return v
}

// As transações de produção são assinadas no ambiente Production; as de TestFlight/dev no
// Sandbox. Como não sabemos à partida, tentamos os dois e devolvemos a 1ª verificação válida.
const ENVIRONMENTS: Environment[] = [Environment.PRODUCTION, Environment.SANDBOX]

/** Verifica e descodifica uma signed transaction (StoreKit 2). Devolve null se a assinatura for inválida. */
export async function verifyAppleTransaction(jws: string): Promise<Record<string, any> | null> {
  for (const env of ENVIRONMENTS) {
    try {
      const decoded = await getVerifier(env).verifyAndDecodeTransaction(jws)
      return decoded as unknown as Record<string, any>
    } catch {
      /* tenta o próximo ambiente */
    }
  }
  console.error('[APPLE-IAP] verifyAppleTransaction: assinatura JWS inválida (prod+sandbox)')
  return null
}

/** Verifica e descodifica uma notificação App Store Server V2 assinada. Devolve null se inválida. */
export async function verifyAppleNotification(signedPayload: string): Promise<Record<string, any> | null> {
  for (const env of ENVIRONMENTS) {
    try {
      const decoded = await getVerifier(env).verifyAndDecodeNotification(signedPayload)
      return decoded as unknown as Record<string, any>
    } catch {
      /* tenta o próximo ambiente */
    }
  }
  console.error('[APPLE-IAP] verifyAppleNotification: assinatura inválida (prod+sandbox)')
  return null
}
