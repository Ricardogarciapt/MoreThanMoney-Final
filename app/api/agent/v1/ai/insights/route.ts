import { NextRequest, NextResponse } from "next/server"
import { requireAgentAccess } from "@/lib/agent-site-api"

/** GET /api/agent/v1/ai/insights — proxy para métricas de IA (com auth de agente) */
export async function GET(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  const origin = request.nextUrl.origin
  const range = request.nextUrl.searchParams.get("range") || "7days"
  const res = await fetch(`${origin}/api/admin/ai-insights?range=${encodeURIComponent(range)}`, {
    headers: { cookie: request.headers.get("cookie") || "" },
  })

  const body = await res.json()
  return NextResponse.json(
    { ok: res.ok, data: body, actor: auth.actor },
    { status: res.status }
  )
}
