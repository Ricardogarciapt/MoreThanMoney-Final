import { lerRegrasVida } from "@/lib/agentes/vida"
import { NextRequest } from "next/server"
import { agentOk, agentError, requireAgentAccess } from "@/lib/agent-site-api"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getStripeRevenue } from "@/lib/agent-business-stripe"
import {
  CORTES_DA_ESCALA, achatar, escalaDeVida, estadoNoEcra, montarArvore, relogioDoJuizo,
  resumoDaEquipa,
} from "@/lib/agentes/arvore"

/**
 * API de negócio para o agente executivo AIOS.
 * GET  /api/agent/v1/business?resource=overview|revenue|subscriptions|customers|leads|tasks|envios|equidade|equipa|conhecimento
 * POST /api/agent/v1/business   body: { action: "create_task" | "update_task" | "outreach_draft" | "aprovar_envio" | "rejeitar_envio" | "auto_aprovar_envios", ... }
 *
 * `envios` / `aprovar_envio` / `rejeitar_envio` (06/10): as mensagens que a máquina quer mandar
 * por iniciativa própria (DM do setter IG, follow-up do bot, email de recuperação de checkout)
 * ficam `pendente`; aprovar com `{ action: "aprovar_envio", id }` FAZ-AS SAIR. O `id` é o uuid da
 * fila `aios_tasks` ou o `comment_id` do setter. Ver lib/envios-fila.ts.
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

/**
 * Os leads do Instagram — do motor NATIVO (`ig_leads`, escrita por lib/instagram/funnel.ts).
 *
 * Até 04/10/2026 lia-se `mtm_leads`, a tabela que o ManyChat sincronizava. O ManyChat saiu; a
 * tabela ficou (com o que já tinha) mas não recebe mais nada, e um agente a ler uma fonte parada
 * responde com confiança sobre gente de há meses. O `stage` aqui é o estado da DM
 * (`sent` · `public_fallback` · `window_expired`), que é o que a fonte sabe.
 */
async function getLeads(sb: ReturnType<typeof getSupabaseAdmin>, stage: string | null, limit: number) {
  let query = sb
    .from("ig_leads")
    .select("comment_id,commenter,ig_username,keyword,intent,comment_text,dm_status,created_at")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (stage) query = query.eq("dm_status", stage)
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
      case "envios": {
        const { listarEnviosPendentes } = await import("@/lib/envios-fila")
        return agentOk(await listarEnviosPendentes(limit))
      }
      case "equidade":
      case "equity":
        return agentOk(await getEquidade(sb))
      case "equipa":
      case "agentes":
        return agentOk(await getEquipa(sb))
      /**
       * O CONHECIMENTO DA CASA — decisões que não se reabrem, limites, incidentes e o mapa do código.
       *
       * Existe como `resource` e não como texto nas `instrucoes` do agente porque não cabe lá e,
       * pior, apodrecia: um prompt escrito à mão fica certo no dia em que se escreve. Assim o
       * agente CONSULTA, e o que lê é montado da fonte a cada chamada.
       *
       * `?texto=1` devolve o bloco pronto a colar num `system`; sem isso vem estruturado, para
       * quem quiser percorrer os factos um a um e ir às origens.
       */
      case "conhecimento": {
        const c = await import("@/lib/agentes/conhecimento")
        if (url.searchParams.get("texto") === "1") {
          return agentOk({ texto: c.conhecimentoDoCEO() })
        }
        return agentOk({
          decisoes_irreversiveis: c.DECISOES_IRREVERSIVEIS,
          limites: c.LIMITES,
          incidentes: c.INCIDENTES,
          mapa_do_codigo: c.MAPA_DO_CODIGO,
          como_consultar: c.COMO_CONSULTAR,
          // Contado, não escrito: um total à mão diverge no dia em que entrar um facto novo.
          total_factos: c.todosOsFactos().length,
        })
      }
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
    const SALES_ACTIONS = new Set(["approve_post", "reject_post", "attach_image", "set_autopilot", "set_exec", "generate_now", "repost_now", "digest_now"])
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

    // ----- Envios por aprovar: aprovar FAZ SAIR a mensagem; rejeitar arquiva-a -----
    if (action === "aprovar_envio" || action === "rejeitar_envio") {
      if (!body.id) return agentError("Falta 'id'.", 400)
      const quem = `agente:${auth.email || auth.userId || auth.keyId}`
      const { aprovarEnvio, rejeitarEnvio } = await import("@/lib/envios-fila")
      const r =
        action === "aprovar_envio"
          ? await aprovarEnvio(String(body.id), quem)
          : await rejeitarEnvio(String(body.id), quem, body.motivo ? String(body.motivo) : undefined)
      return r.ok ? agentOk(r) : agentError(r.erro || "falhou", 409, { ...r })
    }

    // ----- 07/10: o toggle «Auto-aprovar» do AIOS aplicado à fila do site -----
    // Só sai o que `decidirContacto` marca «sai» (base legal + exclusão + tectos), e sai pelo mesmo
    // `aprovarEnvio` do clique. `ensaio: true` só diz o que sairia. Ver lib/envios-auto-aprovar.ts.
    if (action === "auto_aprovar_envios") {
      const { autoAprovarFilaSite } = await import("@/lib/envios-auto-aprovar")
      const usados = body.usados_por_agente && typeof body.usados_por_agente === "object" ? body.usados_por_agente : {}
      const r = await autoAprovarFilaSite(sb, {
        ensaio: body.ensaio === true,
        limite: Number(body.limite ?? 0),
        tectoPorAgente: body.tecto_por_agente === undefined ? undefined : Number(body.tecto_por_agente),
        usadosAiosPorCodigo: Object.fromEntries(
          Object.entries(usados as Record<string, unknown>).map(([k, v]) => [String(k).toUpperCase(), Number(v) || 0]),
        ),
        quem: "regra:auto-aprovar",
      })
      return r.ok ? agentOk(r) : agentError(r.erros.join("; ") || "falhou", 500, { ...r })
    }

    // ----- Escrita interna: atualizar tarefa (imediata) -----
    if (action === "update_task") {
      if (!body.id) return agentError("Falta 'id'.", 400)
      // Um envio por aprovar não muda de estado por aqui: aprovar FAZ SAIR uma mensagem, e isso
      // tem o seu caminho (`aprovar_envio`), com a transição condicional e o envio juntos.
      if (body.status !== undefined) {
        const { data: t } = await sb.from("aios_tasks").select("kind").eq("id", body.id).maybeSingle()
        if (String((t as { kind?: string } | null)?.kind ?? "").startsWith("envio:")) {
          return agentError("Envios por aprovar mudam de estado só por 'aprovar_envio'/'rejeitar_envio'.", 400)
        }
      }
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
          canal: body.channel || (target.instagram_handle || target.commenter ? "instagram" : target.email ? "email" : "telegram"),
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

/**
 * A EQUIDADE DAS CONTAS DA CASA.
 *
 * «Da casa» é o que `conta_casa` ou `conta_real_casa` marcam — mestres, financiadas e as duas
 * reais. Não entram aqui as contas dos clientes: a pergunta «quanto temos» é sobre o nosso
 * dinheiro, e misturar as duas numa resposta falada seria a pior forma de o confundir.
 *
 * O `lidas_em` vai sempre junto, e é a parte que não se pode cortar: uma equidade sem hora é um
 * número que parece de agora e pode ser de ontem. Num painel vê-se a data ao lado; numa resposta
 * falada, se não for dita, ninguém a pergunta.
 */
async function getEquidade(sb: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await sb
    .from("mtm_trading_accounts")
    .select("etiqueta, mt5_login, tipo, estado, motor, saldo_inicial, sim_saldo, sim_equity, metricas, metricas_lidas_em, conta_real_casa")
    .or("conta_casa.is.true,conta_real_casa.is.true")
    .eq("estado", "ativa")
  if (error) throw new Error(error.message)

  const num = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const contas = (data ?? []).map((c) => {
    const r = c as Record<string, unknown>
    const metricas = (r.metricas ?? {}) as Record<string, unknown>
    // A equidade vem do snapshot das métricas quando existe; o `sim_equity` é a do motor simulado.
    // A ordem importa: as métricas são o que o motor real leu da corretora.
    const equity = num(metricas.equity) ?? num(r.sim_equity) ?? num(r.sim_saldo)
    const inicial = num(r.saldo_inicial)
    return {
      conta: (r.etiqueta as string) || `MT5 ${r.mt5_login}`,
      login: r.mt5_login as string,
      tipo: r.tipo as string,
      motor: r.motor as string,
      real: r.conta_real_casa === true,
      equidade: equity,
      inicial,
      // Em valor E em percentagem: a percentagem compara contas de tamanhos diferentes, o valor
      // diz o que está mesmo lá.
      resultado: equity != null && inicial != null ? Number((equity - inicial).toFixed(2)) : null,
      pct: equity != null && inicial ? Number((((equity - inicial) / inicial) * 100).toFixed(2)) : null,
      lidas_em: r.metricas_lidas_em as string | null,
    }
  })

  contas.sort((a, b) => (b.equidade ?? 0) - (a.equidade ?? 0))
  const comValor = contas.filter((c) => c.equidade != null)
  const total = comValor.reduce((s, c) => s + (c.equidade ?? 0), 0)
  const investido = comValor.reduce((s, c) => s + (c.inicial ?? 0), 0)
  const datas = contas.map((c) => c.lidas_em).filter(Boolean) as string[]

  return {
    contas,
    quantas: contas.length,
    total: Number(total.toFixed(2)),
    investido: Number(investido.toFixed(2)),
    resultado: Number((total - investido).toFixed(2)),
    pct: investido ? Number((((total - investido) / investido) * 100).toFixed(2)) : null,
    // A leitura MAIS ANTIGA, e não a mais recente: é ela que diz há quanto tempo o número mais
    // velho desta soma não é confirmado. A mais recente só diria que alguma coisa foi lida agora.
    lidas_desde: datas.length ? datas.sort()[0] : null,
    nota: "Contas da casa (mestres, financiadas e reais). Não inclui contas de clientes.",
  }
}


/**
 * A EQUIPA DE AGENTES — o estado de cada um e o relógio que corre contra ele.
 *
 * Existe para o AIOS poder responder «como está a equipa?» sem adivinhar. E o campo que não pode
 * faltar é o `horasAteAoJuizo`: a regra de vida pára um agente ao fim da carência se a receita na
 * janela não pagar o gasto, e sem o relógio à vista isso parece um agente a morrer do nada.
 *
 * `receitaPorAtribuir` vai junto de propósito: um agente a zero pode ter trazido vendas que
 * ninguém conseguiu ligar a ele. Ver o cabeçalho de `lib/agentes/receita.ts` — o que não é
 * atribuível não se inventa, mas também não se esconde.
 */
async function getEquipa(sb: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await sb
    .from("agentes_equipa")
    .select("id, nome, papel, pilar, estado, pausado, orcamento, receita, gasto, chave_receita, avaliado_em, criado_em, parado_porque, pai_id")
    .order("criado_em", { ascending: true })

  const agora = new Date()
  // A régua viva: o relógio conta desde o último reinício do dono, como o motor julga.
  const { data: cfgVida } = await sb.from("site_settings").select("value").eq("key", "agentes_vida").maybeSingle()
  const reguaViva = lerRegrasVida(cfgVida?.value)
  const arvore = montarArvore(
    (data ?? []).map((a: Record<string, unknown>) => ({
      id: String(a.id ?? ""),
      nome: String(a.nome ?? ""),
      pilar: a.pilar == null ? null : String(a.pilar),
      pai_id: a.pai_id == null ? null : String(a.pai_id),
      estado: a.estado == null ? null : String(a.estado),
      pausado: a.pausado === true,
      criado_em: a.criado_em == null ? null : String(a.criado_em),
      bruto: a,
    })),
  )

  /**
   * A LISTA JÁ ACHATADA PELA ORDEM DA ÁRVORE.
   *
   * O AIOS e o dashboard dele são HTML e Python à mão: não reconstroem hierarquia. Entregar-lhes a
   * ordem já feita — com a `profundidade` de cada um — é o que impede que o painel de lá discorde
   * do painel do site. E `id` vai no payload porque ANTES não ia: mandava-se `pai_id` sem `id`
   * nenhum, ou seja, a hierarquia era impossível de reconstruir do outro lado e todos os agentes
   * apareciam como se fossem irmãos.
   */
  const agentes = achatar(arvore).map((n) => {
    const a = n.agente.bruto as Record<string, unknown>
    const ecra = estadoNoEcra(n.agente)
    const relogio = relogioDoJuizo(n.agente, agora, undefined, reguaViva)
    return {
      id: n.agente.id,
      nome: n.agente.nome,
      papel: a.papel ?? null,
      pilar: n.agente.pilar,
      paiId: n.agente.pai_id,
      profundidade: n.profundidade,
      /** Verdadeiro quando o `pai_id` dele não bate com nenhum agente desta lista. */
      orfao: n.orfao,
      /** O estado da coluna, tal como está na base. */
      estado: a.estado,
      /** O estado que se PINTA: `pausado` ganha a `estado`, e um estado desconhecido não vira vivo. */
      estadoEcra: ecra.estado,
      /** Não-nulo quando as duas colunas discordavam. Diz-se, não se cala. */
      conflitoDeEstado: ecra.conflito,
      pausado: a.pausado === true,
      saldo: Number(a.receita ?? 0) - Number(a.gasto ?? 0),
      receita: Number(a.receita ?? 0),
      gasto: Number(a.gasto ?? 0),
      orcamento: Number(a.orcamento ?? 0),
      codigo: a.chave_receita,
      avaliadoEm: a.avaliado_em,
      /**
       * O RELÓGIO, em fase + frase.
       *
       * O campo antigo `horasAteAoJuizo` ficava NEGATIVO depois da carência, e qualquer leitura que
       * o tratasse como contagem decrescente dizia o contrário da verdade. Mantém-se, mas só com
       * valor quando ele quer dizer mesmo «faltam»: fora da carência é `null`, e quem precisa de
       * saber lê o `relogio`.
       */
      relogio,
      horasAteAoJuizo: relogio.fase === "carencia" ? relogio.horas : null,
      /**
       * A ESCALA DE VIDA, calculada aqui e não no ecrã.
       *
       * Os cortes são os de `julgar()`, e `arvore.check.ts` prova que não se afastam dela. Um ecrã
       * que os recalculasse a olho acabava a desenhar uma banda enquanto o cron parava o agente
       * por outra — e as duas coisas pareceriam certas.
       */
      escala: escalaDeVida(
        {
          resultado: Number(a.receita ?? 0) - Number(a.gasto ?? 0),
          saldo: Number(a.orcamento ?? 0) - Number(a.gasto ?? 0),
          codigo: a.chave_receita == null ? null : String(a.chave_receita),
          estado: n.agente.estado,
          pausado: n.agente.pausado,
          criado_em: n.agente.criado_em,
          pilar: n.agente.pilar,
          pai_id: n.agente.pai_id,
        },
        agora,
        10,
        reguaViva,
      ),
      paradoPorque: a.parado_porque ?? null,
      eCeo: n.profundidade === 0 && !n.orfao,
    }
  })

  /**
   * A RECEITA POR ATRIBUIR, EM ENSAIO.
   *
   * Em ensaio porque uma LEITURA não escreve no livro: quem grava é o cron. E embrulhada em
   * try/catch porque, se a atribuição falhar, o que não se pode é devolver zero — zero diria «não
   * há nada por atribuir» quando o que aconteceu foi «ninguém conseguiu contar». `null` é lido como
   * «não medido» por `resumoDaEquipa`, e o motivo vai junto.
   */
  let naoAtribuidoCents: number | null = null
  let porAtribuir: unknown[] = []
  let receitaErro: string | null = null
  let atribuidoCents: number | null = null
  let liquidoCents: number | null = null
  try {
    const { atribuirEGravar } = await import("@/lib/agentes/receita")
    const r = await atribuirEGravar(sb, { ensaio: true })
    naoAtribuidoCents = r.atribuicao.naoAtribuidoCents
    atribuidoCents = r.atribuicao.atribuidoCents
    liquidoCents = r.atribuicao.liquidoCents
    porAtribuir = r.atribuicao.porAtribuir
  } catch (e) {
    receitaErro = (e as Error).message
  }

  const resumo = resumoDaEquipa(arvore, naoAtribuidoCents)

  return {
    agentes,
    /** Os filhos que a árvore teria perdido em silêncio. Vazio é o normal. */
    orfaos: arvore.orfaos,
    resumo,
    cortesDaEscala: CORTES_DA_ESCALA,
    receita: {
      moeda: "EUR",
      liquidoCents,
      atribuidoCents,
      naoAtribuidoCents,
      porAtribuir,
      /** Quando a atribuição falha, diz-se. Um erro calado aqui lê-se como «não há receita». */
      erro: receitaErro,
      texto: resumo.porAtribuirTexto,
    },
    // Mantidos pelos nomes antigos: o AIOS já os lê.
    vivos: resumo.vivos,
    parados: resumo.parados,
    semReceita: resumo.semReceitaMedida,
    nota:
      "A receita de um agente so' conta quando a compra traz o codigo dele (link ?ag=). " +
      "Sem links em circulacao a receita e' zero para todos, e a regra de vida para a equipa " +
      "por falta de MEDICAO, nao por falta de trabalho.",
  }
}
