import type { NextRequest } from "next/server"

/**
 * Token partilhado para chamadas servidor-a-servidor entre rotas internas.
 * Preferir SEMPRE a variável de ambiente `INTERNAL_API_TOKEN` (Vercel / .env.local);
 * o fallback existe só para não partir se a env não estiver definida. NUNCA usar em
 * código client-side (seria exposto ao browser). Para chamadas client legítimas usar
 * a sessão admin. Rodar o valor = mudar a env (não é preciso mexer no código).
 */
export const INTERNAL_API_TOKEN =
  process.env.INTERNAL_API_TOKEN?.trim() ||
  "mtm_internal_b4b9f7ef38f91cbf0d27c7790f644f17e6cd20cda5756367"

export function internalApiHeaders(): Record<string, string> {
  return { "x-internal-token": INTERNAL_API_TOKEN }
}

export function isInternalApiRequest(request: NextRequest | Request): boolean {
  const token = (request as Request).headers.get("x-internal-token")
  return !!token && !!INTERNAL_API_TOKEN && token === INTERNAL_API_TOKEN
}
