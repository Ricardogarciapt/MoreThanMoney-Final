import { NextRequest } from "next/server"
import type { ContentConfig } from "@/lib/content-config"
import {
  agentError,
  agentOk,
  loadContentConfig,
  requireAgentAccess,
  saveContentConfig,
} from "@/lib/agent-site-api"

export async function GET(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth
  return agentOk(await loadContentConfig())
}

export async function PUT(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  try {
    const body = (await request.json()) as ContentConfig
    if (!body.videos || !body.links || !body.images) {
      return agentError("Configuração inválida: videos, links e images são obrigatórios.")
    }
    await saveContentConfig(body)
    return agentOk({ success: true, message: "Content config atualizada." })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao guardar"
    return agentError(msg, 500)
  }
}
