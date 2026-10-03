import { NextRequest } from "next/server"

/** Valida Authorization: Bearer CRON_SECRET (Vercel Cron / GitHub Actions). */
export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    if (process.env.NODE_ENV === "development") return true
    console.error("[CRON] CRON_SECRET não definido — todos os crons devolvem 401 em produção")
    return false
  }
  const auth = request.headers.get("authorization")
  if (auth === `Bearer ${secret}`) return true
  // Vercel envia este header nos cron jobs invocados pelo dashboard
  if (request.headers.get("x-vercel-cron") === "1" && auth === `Bearer ${secret}`) return true
  return false
}
