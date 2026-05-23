import { NextRequest } from "next/server"
import {
  agentError,
  agentOk,
  loadAdminSettings,
  patchAdminSettings,
  requireAgentAccess,
} from "@/lib/agent-site-api"

export async function GET(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth
  const settings = await loadAdminSettings()
  return agentOk(settings, { actor: auth.actor })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  try {
    const body = (await request.json()) as Record<string, unknown>
    const result = await patchAdminSettings(body)
    return agentOk(
      { ...body, savedCount: result.savedCount },
      { errors: result.errors.length ? result.errors : undefined }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao guardar definições"
    return agentError(msg, 500)
  }
}
