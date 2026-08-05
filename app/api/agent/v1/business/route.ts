import { NextRequest } from "next/server"
import { agentOk, agentError, requireAgentAccess } from "@/lib/agent-site-api"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getStripeRevenue } from "@/lib/agent-business-stripe"

/**
 * API de negócio para o agente executivo AIOS.
 * GET  /api/agent/v1/business?resource=overview|revenue|subscriptions|customers|leads|tasks
 * POST /api/agent/v1/business   body: { action: "create_task" | "update_task" | "outreach_draft", ... }
 *
 * Leitura = imediata. Escrita interna (tarefas) = imediata. Envios para clientes NÃO acontecem aqui:
 * outreach_draft devolve apenas um rascunho para o AIOS confirmar antes de enviar.
 */

// preços de referência para estimativa de MRR (€/mês)
const PRICE = { premium: 65, app_member: 35, mtmcopy: 20 }

function euros(cents: number) {
  return Math.round((cents || 0)) / 100
}

async function getRevenue(sb: ReturnType<typeof getSupabaseAdmin>, includeStripe = false) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const d30 = new Date(now.getTime() - 30 * 864e5).toISOString()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

  const { data: pays } = await sb
    .from("payment_history")
    .select("amount,currency,status,plan,created_at")
    .in("status", ["succeeded", "paid"])
    .order("created_at", { ascending: false })
    .limit(500)

  const rows = pays || []
  const sum = (from?: string) =>
    rows.filter((r) => !from || r.created_at >= from).reduce((a, r) => a + (r.amount || 0), 0)

  const result: Record<string, unknown> = {
    moeda: "EUR",
    hoje: euros(sum(dayStart)),
    mes_ate_agora: euros(sum(monthStart)),
    ultimos_30_dias: euros(sum(d30)),
    total_registado: euros(sum()),
    n_pagamentos: rows.length,
    ultimos: rows.slice(0, 8).map((r) => ({
      valor: euros(r.amount),
      plano: r.plan,
      data: r.created_at,
    })),
    nota: "payment_history (local). Stripe = fonte completa quando pedido com ?stripe=1.",
  }

  if (includeStripe) {
    try {
      result.stripe = await getStripeRevenue()
    } catch (e) {
      result.stripe_error = (e as Error).message
    }
  }
  return result
}

async function getSubscriptions(sb: ReturnType<typeof getSupabaseAdmin>) {
  const { data: profs } = await sb
    .from("profiles")
    .select("subscription_plan,subscription_status,membership_level,subscription_expires_at,mtmcopy_subscription_active")
    .limit(5000)

  const p = profs || []
  const byPlan: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  let active = 0
  let mtmcopy = 0
  const soon: number = p.filter((x) => {
    const exp = x.subscription_expires_at ? new Date(x.subscription_expires_at) : null
    return exp && exp.getTime() - Date.now() < 7 * 864e5 && exp.getTime() > Date.now()
  }).length

  for (const x of p) {
    const plan = x.subscription_plan || "(sem plano)"
    byPlan[plan] = (byPlan[plan] || 0) + 1
    const st = x.subscription_status || "(sem estado)"
    byStatus[st] = (byStatus[st] || 0) + 1
    if (x.subscription_status === "active") active++
    if (x.mtmcopy_subscription_active) mtmcopy++
  }

  const premium = byPlan["premium"] || 0
  const member = byPlan["app_member"] || 0
  const mrr = premium * PRICE.premium + member * PRICE.app_member + mtmcopy * PRICE.mtmcopy

  return {
    ativos: active,
    por_plano: byPlan,
    por_estado: byStatus,
    premium,
    membros: member,
    mtmcopy_addon: mtmcopy,
    a_expirar_7dias: soon,
    mrr_estimado_eur: mrr,
    nota: "MRR é estimativa (preços de referência, ignora ciclo anual vs mensal).",
  }
}

async function getCustomers(sb: ReturnType<typeof getSupabaseAdmin>, q: string | null, limit: number) {
  let query = sb
    .from("profiles")
    .select(
      "id,full_name,username,email,phone,country,user_type,membership_level,subscription_plan,subscription_status,subscription_expires_at,last_login,created_at,stripe_customer_id"
    )
    .order("created_at", { ascending: false })
    .limit(limit)

  if (q) {
    query = query.or(`email.ilike.%${q}%,username.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%`)
  }
  const { data, error } = await query
  if (error) return { erro: error.message, clientes: [] }
  return { total: (data || []).length, clientes: data || [] }
}

async function getLeads(sb: ReturnType<typeof getSupabaseAdmin>, stage: string | null, limit: number) {
  let query = sb
    .from("mtm_leads")
    .select("id,full_name,instagram_handle,email,manychat_id,score,stage,source,country,last_interaction,notes,created_at")
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limit)
  if (stage) query = query.eq("stage", stage)
  const { data, error } = await query
  if (error) return { erro: error.message, leads: [] }
  return { total: (data || []).length, leads: data || [] }
}

async function getTasks(sb: ReturnType<typeof getSupabaseAdmin>, status: string | null, limit: number) {
  let query = sb
    .from("aios_tasks")
    .select("*")
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit)
  if (status) query = query.eq("status", status)
  const { data, error } = await query
  if (error) return { erro: error.message, tarefas: [] }
  return { total: (data || []).length, tarefas: data || [] }
}

async function getOverview(sb: ReturnType<typeof getSupabaseAdmin>) {
  const [rev, subs, leads, tasks] = await Promise.all([
    getRevenue(sb),
    getSubscriptions(sb),
    getLeads(sb, null, 5),
    getTasks(sb, "open", 5),
  ])
  const { count: novos30 } = await sb
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gt("created_at", new Date(Date.now() - 30 * 864e5).toISOString())

  return {
    receita: { mes_ate_agora: rev.mes_ate_agora, ultimos_30_dias: rev.ultimos_30_dias },
    subscricoes: { ativos: subs.ativos, premium: subs.premium, membros: subs.membros, mrr_estimado_eur: subs.mrr_estimado_eur, a_expirar_7dias: subs.a_expirar_7dias },
    clientes: { total: subs.ativos, novos_30dias: novos30 || 0 },
    leads: { total: leads.total, top: leads.leads },
    tarefas_abertas: tasks.total,
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  const url = new URL(request.url)
  const resource = (url.searchParams.get("resource") || "overview").toLowerCase()
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "25", 10) || 25, 200)
  const sb = getSupabaseAdmin()

  try {
    switch (resource) {
      case "overview":
        return agentOk(await getOverview(sb))
      case "revenue":
        return agentOk(await getRevenue(sb, url.searchParams.get("stripe") === "1"))
      case "subscriptions":
        return agentOk(await getSubscriptions(sb))
      case "customers":
        return agentOk(await getCustomers(sb, url.searchParams.get("q"), limit))
      case "leads":
        return agentOk(await getLeads(sb, url.searchParams.get("stage"), limit))
      case "tasks":
        return agentOk(await getTasks(sb, url.searchParams.get("status"), limit))
      // Máquina de vendas — usada pela FRIDAY (funnel) e EDITH (admin) do AIOS.
      case "funnel":
      case "sales":
      case "content":
      case "admin": {
        const { buildSalesState, salesStateSummary } = await import("@/lib/sales-machine")
        const state = await buildSalesState()
        return agentOk({ ...state, resumo: salesStateSummary(state) })
      }
      default:
        return agentError("resource desconhecido: " + resource, 400)
    }
  } catch (e) {
    return agentError("Falha ao obter dados: " + (e as Error).message, 500)
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    return agentError("Corpo JSON inválido.", 400)
  }
  const action = (body.action || "").toLowerCase()
  const sb = getSupabaseAdmin()

  try {
    // ----- Máquina de vendas (FRIDAY/EDITH): comandos partilhados com o hub -----
    const SALES_ACTIONS = new Set(["approve_post", "reject_post", "set_autopilot", "set_exec", "generate_now", "repost_now", "digest_now"])
    if (SALES_ACTIONS.has(action)) {
      const { runSalesCommand } = await import("@/lib/sales-machine")
      const r = await runSalesCommand({ action, id: body.id, account: body.account, key: body.key, on: body.on })
      return r.ok ? agentOk(r) : agentError(String(r.error || "falhou"), 400)
    }

    // ----- Escrita interna: criar tarefa (imediata) -----
    if (action === "create_task") {
      if (!body.title) return agentError("Falta 'title'.", 400)
      const { data, error } = await sb
        .from("aios_tasks")
        .insert({
          title: body.title,
          details: body.details || null,
          kind: body.kind || "task",
          priority: body.priority || "normal",
          due_at: body.due_at || null,
          related_lead_id: body.related_lead_id || null,
          related_user_id: body.related_user_id || null,
          created_by: "aios",
        })
        .select()
        .single()
      if (error) return agentError(error.message, 500)
      return agentOk({ criada: data })
    }

    // ----- Escrita interna: atualizar tarefa (imediata) -----
    if (action === "update_task") {
      if (!body.id) return agentError("Falta 'id'.", 400)
      const patch: any = { updated_at: new Date().toISOString() }
      for (const k of ["title", "details", "kind", "status", "priority", "due_at"]) {
        if (body[k] !== undefined) patch[k] = body[k]
      }
      if (body.status === "done" && !patch.completed_at) patch.completed_at = new Date().toISOString()
      const { data, error } = await sb.from("aios_tasks").update(patch).eq("id", body.id).select().single()
      if (error) return agentError(error.message, 500)
      return agentOk({ atualizada: data })
    }

    // ----- Prospeção/closing: SÓ rascunho (nunca envia) -----
    if (action === "outreach_draft") {
      const target = body.target || {}
      const goal = body.goal || "prospecao"
      const draft =
        body.draft ||
        `Olá ${target.name || target.handle || ""}! Sou da More Than Money. ${
          goal === "closing"
            ? "Vi o teu interesse e queria ajudar-te a dar o próximo passo."
            : "Achei que o nosso sistema podia fazer sentido para ti."
        }`
      return agentOk({
        rascunho: {
          canal: body.channel || (target.manychat_id ? "manychat" : target.email ? "email" : "telegram"),
          para: target,
          objetivo: goal,
          mensagem: draft,
        },
        aviso: "RASCUNHO. Nada foi enviado. Requer confirmação explícita do senhor antes de qualquer envio.",
        requer_confirmacao: true,
      })
    }

    return agentError("action desconhecida: " + action, 400)
  } catch (e) {
    return agentError("Falha na acção: " + (e as Error).message, 500)
  }
}
