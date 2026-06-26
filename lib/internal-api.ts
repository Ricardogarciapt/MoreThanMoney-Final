import type { NextRequest } from "next/server"

/**
 * Token partilhado para chamadas servidor-a-servidor entre rotas internas.
 * Constante no bundle do servidor (repo privado) — NUNCA usar em código client-side
 * (seria exposto ao browser). Para chamadas client legítimas usar a sessão admin.
 */
export const INTERNAL_API_TOKEN = "mtm_internal_3f9a1c8e6b2d4f70a5c1e9d8b7a6f4c2"

export function internalApiHeaders(): Record<string, string> {
  return { "x-internal-token": INTERNAL_API_TOKEN }
}

export function isInternalApiRequest(request: NextRequest | Request): boolean {
  const token = (request as Request).headers.get("x-internal-token")
  return !!token && token === INTERNAL_API_TOKEN
}
