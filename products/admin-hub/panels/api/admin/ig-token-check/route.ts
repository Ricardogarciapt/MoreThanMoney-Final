/**
 * Diagnóstico READ-ONLY dos tokens Instagram (sem efeitos secundários).
 * GET /api/admin/ig-token-check  (Bearer CRON_SECRET)
 * Verifica se INSTAGRAM_TOKEN (marca) e INSTAGRAM_TOKEN_RICARDO (pessoal) acedem
 * às respetivas contas IG via Graph API. Não publica nada.
 */
import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"

const GRAPH = "https://graph.facebook.com/v21.0"

const ACCOUNTS = [
  { id: "17841474872672009", expected: "morethanmoney.pt", tokenEnv: "INSTAGRAM_TOKEN" },
  { id: "17841405656956716", expected: "ricardogarciapt", tokenEnv: "INSTAGRAM_TOKEN_RICARDO" },
] as const

async function checkAccount(acc: (typeof ACCOUNTS)[number]) {
  const token = process.env[acc.tokenEnv]?.trim() || process.env.INSTAGRAM_TOKEN?.trim()
  if (!token) {
    return { account: acc.expected, tokenEnv: acc.tokenEnv, ok: false, reason: "token em falta (env não definida)" }
  }
  const usingFallback = !process.env[acc.tokenEnv]?.trim()
  try {
    const res = await fetch(
      `${GRAPH}/${acc.id}?fields=username,name&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.error) {
      return {
        account: acc.expected,
        tokenEnv: usingFallback ? `${acc.tokenEnv} (fallback INSTAGRAM_TOKEN)` : acc.tokenEnv,
        ok: false,
        reason: data?.error?.message || `HTTP ${res.status}`,
        code: data?.error?.code ?? null,
      }
    }
    return {
      account: acc.expected,
      tokenEnv: usingFallback ? `${acc.tokenEnv} (fallback INSTAGRAM_TOKEN)` : acc.tokenEnv,
      ok: data?.username === acc.expected,
      username: data?.username ?? null,
      name: data?.name ?? null,
      usingFallback,
    }
  } catch (e) {
    return { account: acc.expected, tokenEnv: acc.tokenEnv, ok: false, reason: e instanceof Error ? e.message : "erro" }
  }
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const results = await Promise.all(ACCOUNTS.map(checkAccount))
  return NextResponse.json({ ok: results.every((r) => r.ok), results })
}
