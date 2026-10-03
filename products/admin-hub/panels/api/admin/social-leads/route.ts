/**
 * API admin — Leads do funil IG (ig_leads) + log de engagement (ig_engagement_log).
 * Read-only para o painel /admin/social/leads.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const [leadsQ, engageQ, tgQ, radarQ, autoQ, brokerQ, pagQ, setterQ, chaveQ] = await Promise.all([
      supabase.from("ig_leads").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("ig_engagement_log").select("*").order("replied_at", { ascending: false }).limit(300),
      supabase.from("telegram_leads").select("*").order("updated_at", { ascending: false }).limit(300),
      supabase.from("ig_radar_prospetos").select("*").eq("estado", "pendente").order("pontuacao", { ascending: false }).limit(30),
      supabase.from("mtm_automacoes").select("nome, canal, ativa, disparos, ultimo_disparo"),
      supabase.from("broker_clients").select("uid", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_status", "active"),
      /**
       * Os rascunhos do setter da persona — o que SAIRIA se o interruptor estivesse ligado.
       *
       * `maybeSingle` não serve aqui e a tabela pode ainda não existir (migração 144 por aplicar).
       * Um erro desta consulta não pode apagar o painel todo: o `?? []` mais abaixo trata disso, que
       * é o mesmo cuidado que as outras seis linhas já têm.
       */
      supabase.from("ig_setter_rascunhos").select("*").order("criado_em", { ascending: false }).limit(200),
      supabase.from("site_settings").select("value").eq("key", "ig_setter_persona").maybeSingle(),
    ])
    const leads = (leadsQ.data || []) as Record<string, any>[]
    const engage = (engageQ.data || []) as Record<string, any>[]
    const telegram = (tgQ.data || []) as Record<string, any>[]

    const dmsSent = leads.filter((l) => l.dm_status === "sent").length
    const publicFb = leads.filter((l) => l.dm_status === "public_fallback").length
    const windowExp = leads.filter((l) => l.dm_status === "window_expired").length
    const byIntent = leads.reduce((acc: Record<string, number>, l) => {
      const k = l.intent || "?"
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})
    const repliesOk = engage.filter((e) => e.status === "replied").length
    const tgByStage = telegram.reduce((acc: Record<string, number>, t) => {
      const k = t.stage || "?"
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})
    const tgGranted = telegram.filter((t) => t.stage === "granted").length

    const radar = (radarQ.data || []) as Record<string, any>[]
    const automacoes = (autoQ.data || []) as Record<string, any>[]

    /**
     * A escada, de onde vem até onde pára.
     *
     * As três tabelas em cima dizem quantos há em cada sítio; não dizem onde se perdem. E é onde
     * se perdem que decide o que fazer a seguir — foi assim que o passo do Instagram esteve meses
     * a zero sem ninguém dar por isso.
     *
     * Cada degrau vem de uma tabela diferente de propósito: se todos viessem do mesmo sítio, a
     * escada só mostrava o que esse sítio sabe.
     */
    const escada = [
      { nome: "Conversas encontradas", n: radar.length, fonte: "radar (por tratar)" },
      { nome: "Respostas dadas no IG", n: engage.filter((e) => e.status === "replied").length, fonte: "ig_engagement_log" },
      { nome: "Leads com intenção", n: leads.length, fonte: "ig_leads" },
      { nome: "Chegaram ao Telegram", n: telegram.length, fonte: "telegram_leads" },
      { nome: "Conta na corretora", n: brokerQ.count ?? 0, fonte: "broker_clients" },
      { nome: "Subscrição ativa", n: pagQ.count ?? 0, fonte: "profiles" },
    ].map((d, i, todos) => ({
      ...d,
      // Dividir por zero não é 0%: é "não há base de comparação".
      passou: i === 0 || todos[i - 1].n === 0 ? null : Math.round((d.n / todos[i - 1].n) * 1000) / 10,
    }))

    const setter = (setterQ.data || []) as Record<string, any>[]
    const chaveBruta = (chaveQ.data as { value?: unknown } | null)?.value
    // `value` tanto vem como objeto como string JSON, conforme quem o escreveu.
    const chaveObj = (typeof chaveBruta === "string" ? JSON.parse(chaveBruta) : chaveBruta) as Record<string, unknown> | null
    const setterChaves = {
      redigir: chaveObj?.redigir === true,
      enviar_publica: chaveObj?.enviar_publica === true,
      enviar_dm: chaveObj?.enviar_dm === true,
    }

    return NextResponse.json({
      leads,
      engage,
      telegram,
      radar,
      automacoes,
      escada,
      setter,
      setterChaves,
      setterStats: {
        rascunhos: setter.filter((s) => s.estado === "rascunho").length,
        enviados: setter.filter((s) => s.estado === "enviado").length,
        encerrados: setter.filter((s) => s.estado === "encerrado").length,
        // Quantos rascunhos NÃO podem levar DM, e porquê. É o número que diz se vale a pena
        // apressar a aprovação: um rascunho fora dos 7 dias já não tem DM para dar.
        semDm: setter.filter((s) => s.dm_possivel === false && s.estado === "rascunho").length,
        pessoas: new Set(setter.map((s) => s.commenter).filter(Boolean)).size,
      },
      stats: {
        totalLeads: leads.length, dmsSent, publicFb, windowExp, byIntent,
        totalReplies: engage.length, repliesOk,
        telegramTotal: telegram.length, tgGranted, tgByStage,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "erro", leads: [], engage: [], stats: {} }, { status: 500 })
  }
}
