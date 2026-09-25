import { NextRequest } from "next/server"
import { agentError, agentOk, requireAgentAccess } from "@/lib/agent-site-api"
import { modeloClaude } from '@/lib/modelo-claude'

/**
 * POST /api/agent/v1/agents  { agent, message, context? }
 * Expõe os agentes MTM do site (coach de membros, portefólio/DCA) para agentes
 * externos (AIOS) via AGENT_SITE_API_KEY — sem exigir sessão de membro.
 */

const PERSONAS: Record<string, string> = {
  coach: `És o assistente oficial MoreThanMoney (MTM) — educação, trading, copytrading e crescimento de negócio com acompanhamento. Ajudas membros no onboarding, Fast Start, hábitos diários, ranks e próximos passos claros. Educação, NUNCA conselho financeiro personalizado nem promessas de lucro. Responde em português de Portugal, claro e prático, 2 a 4 frases.`,
  portfolio: `És o analista de portefólio e DCA do MTM. Analisas alocação, custo médio (DCA) e risco de forma educativa (visão geral; sem conselho financeiro personalizado nem promessas de lucro). Responde em português de Portugal, direto e técnico, 2 a 4 frases.`,
}

async function callAnthropic(system: string, userMessage: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null
  const model = modeloClaude()
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 700, system, messages: [{ role: "user", content: userMessage }] }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  return data.content?.find((b) => b.type === "text")?.text?.trim() || null
}

export async function GET(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth
  return agentOk({ agents: Object.keys(PERSONAS) })
}

export async function POST(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth
  try {
    const body = await request.json()
    const agent = String(body.agent || "coach").toLowerCase()
    const message = typeof body.message === "string" ? body.message.trim() : ""
    if (!message) return agentError("Campo message é obrigatório.")
    const persona = PERSONAS[agent]
    if (!persona) {
      return agentError("Agente desconhecido: " + agent + ". Disponíveis: " + Object.keys(PERSONAS).join(", "))
    }
    const ctx = typeof body.context === "string" ? body.context : JSON.stringify(body.context || {})
    const userMsg = message + (ctx && ctx !== "{}" ? "\n\nContexto: " + ctx : "")
    const reply = await callAnthropic(persona, userMsg)
    return agentOk({ agent, message: reply || "Sem resposta disponível de momento.", actor: auth.actor })
  } catch (e) {
    return agentError(e instanceof Error ? e.message : "Erro no agente", 500)
  }
}
