import { NextResponse } from "next/server"

/** GET público — verifica se a API de agentes está configurada (sem expor segredos) */
export async function GET() {
  return NextResponse.json({
    ok: true,
    version: "v1",
    agentApiConfigured: Boolean(process.env.AGENT_SITE_API_KEY?.trim()),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://www.morethanmoney.pt",
    docsPath: "/api/agent/v1",
  })
}
