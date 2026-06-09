import { NextRequest } from "next/server"
import {
  AGENT_API_MANIFEST,
  agentOk,
  requireAgentAccess,
} from "@/lib/agent-site-api"

/** GET /api/agent/v1 — manifesto da API (Claude / agentes externos) */
export async function GET(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  return agentOk({
    ...AGENT_API_MANIFEST,
    authenticatedAs: auth.actor,
    keyId: auth.keyId,
  })
}
