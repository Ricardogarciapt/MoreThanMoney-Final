/**
 * API de gestão do site MoreThanMoney — agentes externos (Claude, n8n, Cursor).
 * Auth: Bearer AGENT_SITE_API_KEY ou ADMIN_TOKEN; alternativa: sessão admin (cookie).
 */

import { NextRequest, NextResponse } from "next/server"
import { verifyAdminAccess, checkRateLimit, validateRequiredFields } from "@/lib/admin-api-helpers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { defaultContentConfig, type ContentConfig } from "@/lib/content-config"
import { buildLocalMtmCoachReply } from "@/lib/mtm-ai-coach-fallback"

export type AgentAuth = {
  actor: "agent" | "admin"
  keyId: string
  userId?: string
  email?: string
}

const DEFAULT_SETTINGS = {
  site_name: "MoreThanMoney",
  site_description: "Plataforma de Trading e Educação Financeira",
  maintenance_mode: false,
  registration_enabled: true,
  auto_approve_users: false,
  email_notifications: true,
  default_user_role: "member",
}

export const AGENT_API_VERSION = "v1"

export const AGENT_API_MANIFEST = {
  version: AGENT_API_VERSION,
  name: "MoreThanMoney Site Management API",
  description:
    "API para agentes IA (Claude, automações) gerirem conteúdo, definições e chat contextual do site MTM.",
  basePath: "/api/agent/v1",
  authentication: {
    type: "bearer",
    header: "Authorization: Bearer <AGENT_SITE_API_KEY>",
    alternatives: ["ADMIN_TOKEN (Bearer)", "Sessão admin Supabase (cookie)"],
    envKeys: ["AGENT_SITE_API_KEY", "ADMIN_TOKEN"],
  },
  endpoints: [
    { method: "GET", path: "/api/agent/v1", description: "Manifesto e capacidades" },
    { method: "GET", path: "/api/agent/v1/context", description: "Snapshot do site para contexto IA" },
    { method: "GET", path: "/api/agent/v1/site/settings", description: "Definições operacionais" },
    { method: "PATCH", path: "/api/agent/v1/site/settings", description: "Atualizar definições (whitelist)" },
    { method: "GET", path: "/api/agent/v1/content-config", description: "Vídeos/links/imagens globais" },
    { method: "PUT", path: "/api/agent/v1/content-config", description: "Atualizar content config" },
    { method: "GET", path: "/api/agent/v1/content", description: "Listar CMS site_content" },
    { method: "POST", path: "/api/agent/v1/content", description: "Criar item CMS" },
    { method: "GET", path: "/api/agent/v1/content/{id}", description: "Obter item CMS" },
    { method: "PATCH", path: "/api/agent/v1/content/{id}", description: "Atualizar item CMS" },
    { method: "DELETE", path: "/api/agent/v1/content/{id}", description: "Remover item CMS" },
    { method: "POST", path: "/api/agent/v1/ai/chat", description: "Chat IA com contexto de gestão do site" },
    { method: "GET", path: "/api/agent/v1/ai/insights", description: "Métricas e sugestões de uso de IA" },
  ],
  siteAgents: [
    { id: "mtm-coach", route: "/api/ai/chat", auth: "user_session", description: "Assistente membros (app)" },
    { id: "onboarding-hub", route: "/api/fast-start/progress", auth: "user_session", description: "Onboarding / fast-start" },
    { id: "portfolio-ai", routes: ["/api/portfolio/ai-tp-sl", "/api/portfolio/dca-analysis"], description: "Portefólio" },
    { id: "site-manager", route: "/api/agent/v1", auth: "AGENT_SITE_API_KEY", description: "Esta API" },
  ],
}

function extractBearer(request: NextRequest): string | null {
  const header = request.headers.get("authorization") || ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function verifyApiKey(token: string | null): { ok: boolean; keyId: string } {
  if (!token) return { ok: false, keyId: "" }
  const agentKey = process.env.AGENT_SITE_API_KEY?.trim()
  const adminToken = process.env.ADMIN_TOKEN?.trim()
  if (agentKey && token === agentKey) return { ok: true, keyId: "agent_site" }
  if (adminToken && token === adminToken) return { ok: true, keyId: "admin_token" }
  return { ok: false, keyId: "" }
}

/** Autentica agente externo, admin token ou sessão admin. */
export async function verifyAgentAccess(
  request: NextRequest
): Promise<AgentAuth | { error: string; status: number }> {
  const bearer = extractBearer(request)
  const keyCheck = verifyApiKey(bearer)
  if (keyCheck.ok) {
    return { actor: "agent", keyId: keyCheck.keyId }
  }

  const admin = await verifyAdminAccess()
  if (admin.isAdmin) {
    return {
      actor: "admin",
      keyId: "admin_session",
      userId: admin.userId,
      email: admin.email,
    }
  }

  return {
    error:
      "Não autorizado. Usa Authorization: Bearer <AGENT_SITE_API_KEY> ou sessão admin.",
    status: 401,
  }
}

export async function requireAgentAccess(
  request: NextRequest
): Promise<AgentAuth | NextResponse> {
  const rateKey =
    extractBearer(request)?.slice(0, 16) ||
    request.headers.get("x-forwarded-for") ||
    "anonymous"
  const limit = checkRateLimit(`agent:${rateKey}`, 120, 60_000)
  if (!limit.allowed) {
    return agentError("Rate limit excedido.", 429, {
      resetAt: limit.resetAt,
      remaining: limit.remaining,
    })
  }

  const auth = await verifyAgentAccess(request)
  if ("error" in auth) {
    return agentError(auth.error, auth.status)
  }
  return auth
}

export function agentOk<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, data, ...(meta ? { meta } : {}) })
}

export function agentError(
  message: string,
  status = 400,
  meta?: Record<string, unknown>
) {
  return NextResponse.json({ ok: false, error: message, ...(meta ? { meta } : {}) }, { status })
}

export async function loadAdminSettings(): Promise<Record<string, unknown>> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from("admin_settings").select("*")

  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  if (error || !data) return settings

  for (const row of data) {
    const key = row.setting_key as string
    const raw = row.setting_value
    try {
      settings[key] = typeof raw === "string" ? JSON.parse(raw) : raw
    } catch {
      settings[key] = raw
    }
  }
  return settings
}

const SETTINGS_PATCH_KEYS = [
  "site_name",
  "site_description",
  "maintenance_mode",
  "registration_enabled",
  "auto_approve_users",
  "email_notifications",
  "default_user_role",
] as const

export async function patchAdminSettings(
  body: Record<string, unknown>
): Promise<{ savedCount: number; errors: { key: string; error: string }[] }> {
  const supabase = getSupabaseAdmin()
  let savedCount = 0
  const errors: { key: string; error: string }[] = []

  for (const key of SETTINGS_PATCH_KEYS) {
    if (!(key in body)) continue
    const { error } = await supabase.from("admin_settings").upsert(
      {
        setting_key: key,
        setting_value: JSON.stringify(body[key]),
        description: `Agent API: ${key}`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "setting_key" }
    )
    if (error) errors.push({ key, error: error.message })
    else savedCount++
  }

  return { savedCount, errors }
}

export async function loadContentConfig(): Promise<ContentConfig> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("admin_settings")
    .select("setting_value")
    .eq("setting_key", "site_content")
    .maybeSingle()

  if (error || !data?.setting_value) return defaultContentConfig
  try {
    return JSON.parse(data.setting_value as string) as ContentConfig
  } catch {
    return defaultContentConfig
  }
}

export async function saveContentConfig(config: ContentConfig): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from("admin_settings").upsert(
    {
      setting_key: "site_content",
      setting_value: JSON.stringify(config),
      description: "Configuração de vídeos e links do site",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "setting_key" }
  )
  if (error) throw new Error(error.message)
}

export async function buildSiteContextSnapshot(): Promise<Record<string, unknown>> {
  const supabase = getSupabaseAdmin()
  const settings = await loadAdminSettings()
  const contentConfig = await loadContentConfig()

  const [{ count: contentCount }, { count: postsCount }, { data: recentAi }] =
    await Promise.all([
      supabase.from("site_content").select("*", { count: "exact", head: true }),
      supabase.from("posts").select("*", { count: "exact", head: true }),
      supabase
        .from("ai_events")
        .select("ai_feature, success, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ])

  return {
    generatedAt: new Date().toISOString(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://www.morethanmoney.pt",
    settings,
    contentConfigSummary: {
      videos: contentConfig.videos?.length ?? 0,
      links: contentConfig.links?.length ?? 0,
      images: contentConfig.images?.length ?? 0,
    },
    counts: {
      site_content: contentCount ?? 0,
      social_posts: postsCount ?? 0,
    },
    recentAiEvents: recentAi ?? [],
    manifest: AGENT_API_MANIFEST,
  }
}

async function callAnthropic(system: string, userMessage: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-haiku-20241022"
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  return data.content?.find((b) => b.type === "text")?.text?.trim() || null
}

async function callOpenAI(system: string, userMessage: string): Promise<string | null> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) return null
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini"
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
      temperature: 0.5,
      max_tokens: 2048,
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const text = data.choices?.[0]?.message?.content?.trim()
  return text || null
}

export function buildSiteAgentSystemPrompt(siteContext: Record<string, unknown>): string {
  return `És o **agente de gestão do site MoreThanMoney (MTM)** ligado à API /api/agent/v1.

Tens acesso (via ferramentas HTTP do utilizador) a:
- Definições do site (manutenção, registo, nome)
- Conteúdo CMS (site_content) e content-config (vídeos/links)
- Insights de uso de IA no site
- Não inventes URLs nem dados — usa apenas o contexto abaixo e respostas da API.

Contexto atual do site (JSON resumido):
${JSON.stringify(siteContext, null, 2).slice(0, 12000)}

Responde em **português de Portugal**, de forma clara e operacional. Para alterações no site, indica o endpoint e payload exactos.`
}

export async function runSiteAgentChat(
  message: string,
  extraContext?: string
): Promise<{ reply: string; source: string }> {
  const snapshot = await buildSiteContextSnapshot()
  const system = buildSiteAgentSystemPrompt(snapshot) + (extraContext ? `\n\n${extraContext}` : "")

  const prefer = (process.env.AI_CHAT_PROVIDER || "auto").toLowerCase()
  let reply: string | null = null
  let source = "local"

  if (prefer === "anthropic") {
    reply = await callAnthropic(system, message)
    if (reply) source = "anthropic"
  } else if (prefer === "openai") {
    reply = await callOpenAI(system, message)
    if (reply) source = "openai"
  } else {
    reply = await callOpenAI(system, message)
    if (reply) source = "openai"
    if (!reply) {
      reply = await callAnthropic(system, message)
      if (reply) source = "anthropic"
    }
  }

  if (!reply) {
    reply = buildLocalMtmCoachReply(message, { mentor_mode: false, onboarding_focus: false })
    source = "local"
  }

  return { reply, source }
}

export { validateRequiredFields }
