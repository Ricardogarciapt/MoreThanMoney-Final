import { NextRequest } from "next/server"

/** Valida Authorization: Bearer CRON_SECRET (Vercel Cron / GitHub Actions). */
export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV === "development"
  return request.headers.get("authorization") === `Bearer ${secret}`
}
