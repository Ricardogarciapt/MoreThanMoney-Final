import { NextRequest } from "next/server"
import { agentOk, buildSiteContextSnapshot, requireAgentAccess } from "@/lib/agent-site-api"

/** GET /api/agent/v1/context — snapshot para contexto de agentes IA */
export async function GET(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  const snapshot = await buildSiteContextSnapshot()
  return agentOk(snapshot, { actor: auth.actor })
}
