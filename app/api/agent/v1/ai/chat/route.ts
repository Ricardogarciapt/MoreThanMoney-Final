import { NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import {
  agentError,
  agentOk,
  requireAgentAccess,
  runSiteAgentChat,
} from "@/lib/agent-site-api"

/**
 * POST /api/agent/v1/ai/chat
 * Chat para agentes de gestão (Claude) com contexto do site — não requer sessão de membro.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  try {
    const body = await request.json()
    const message = typeof body.message === "string" ? body.message.trim() : ""
    if (!message) return agentError("Campo message é obrigatório.")

    const extraContext =
      typeof body.context === "string" ? body.context : JSON.stringify(body.context || {})

    const { reply, source } = await runSiteAgentChat(message, extraContext)

    try {
      const supabase = getSupabaseAdmin()
      await supabase.from("ai_events").insert({
        user_id: auth.userId ?? null,
        ai_feature: "agent_site_api",
        success: true,
        response_time: 0,
        metadata: { actor: auth.actor, keyId: auth.keyId, source },
      })
    } catch {
      /* tabela opcional */
    }

    return agentOk({
      message: reply,
      source,
      actor: auth.actor,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro no chat do agente"
    return agentError(msg, 500)
  }
}
