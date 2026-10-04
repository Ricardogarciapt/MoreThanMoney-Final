/**
 * Fechado a 2026-08-28: esta rota corria com a service-role e SEM verificar quem chamava.
 *
 * Uma rota assim nao e "menos protegida" — nao tem protecao nenhuma. Bastava saber o endereco.
 * O `delete-user` apagava contas, o `approve-user` dava acesso, o chat do dashboard corria o
 * modelo com as ferramentas todas na nossa conta. Testado contra producao antes de fechar.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdmin } from "@/lib/admin-api-helpers"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: NextRequest) {
  const guarda = await requireAdmin(request)
  if (guarda) return guarda

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // ── 1. Utilizadores ───────────────────────────────────────────────────────
  const [profilesAll, profilesRecent] = await Promise.all([
    supabase.from("profiles").select("user_type, is_active, created_at"),
    supabase.from("profiles").select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo),
  ])

  const profiles = profilesAll.data ?? []
  const totalUsers = profiles.length
  const newUsers30d = profilesRecent.count ?? 0

  // Distribuição por tipo de utilizador
  const userTypeMap: Record<string, number> = {}
  for (const p of profiles) {
    const t = p.user_type || "sem_tipo"
    userTypeMap[t] = (userTypeMap[t] ?? 0) + 1
  }
  const activeUsers = profiles.filter((p) => p.is_active).length
  const inactiveUsers = totalUsers - activeUsers

  // Signup trend: last 7 vs previous 7
  const [week1, week2] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    supabase.from("profiles").select("id", { count: "exact", head: true })
      .gte("created_at", new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .lt("created_at", sevenDaysAgo),
  ])

  // ── 2. Calendly ──────────────────────────────────────────────────────────
  const { data: allBookings } = await supabase
    .from("calendly_bookings")
    .select("status, event_type_slug, start_time, created_at")

  const bookings = allBookings ?? []
  const totalBookings = bookings.length

  // Por estado
  const bookingsByStatus: Record<string, number> = {}
  for (const b of bookings) {
    const s = b.status || "unknown"
    bookingsByStatus[s] = (bookingsByStatus[s] ?? 0) + 1
  }

  // Por tipo de evento
  const bookingsByType: Record<string, number> = {}
  for (const b of bookings) {
    const slug = b.event_type_slug || "outro"
    const label = slug.includes("onboarding") ? "Onboarding" :
                  slug.includes("reuniao") || slug.includes("reunião") ? "Reunião Pontual" : slug
    bookingsByType[label] = (bookingsByType[label] ?? 0) + 1
  }

  // Últimos 30 dias
  const bookings30d = bookings.filter((b) => b.created_at >= thirtyDaysAgo).length

  // Upcoming (futuras)
  const upcomingBookings = bookings.filter(
    (b) => b.status === "active" && b.start_time > now.toISOString()
  ).length

  // Taxa de cancelamento
  const cancelRate = totalBookings > 0
    ? Math.round(((bookingsByStatus["cancelled"] ?? 0) / totalBookings) * 100)
    : 0

  // ── 3. Social próprio ─────────────────────────────────────────────────────
  // Até 04/10/2026 este bloco pedia flows, tags e «seguidores» à API do ManyChat. O ManyChat saiu
  // (decisão do dono) e o que se conta aqui é o que a casa MEDE mesmo, nas tabelas que o motor
  // nativo escreve: `ig_leads` (quem comentou uma palavra-chave no Instagram), `whatsapp_conversas`
  // (Cloud API própria) e `telegram_leads` (bot próprio). Nenhum destes números é estimado.
  const [igLeadsQ, igLeads30dQ, waConversasQ, waPorResponderQ, tgLeadsQ] = await Promise.all([
    supabase.from("ig_leads").select("comment_id", { count: "exact", head: true }),
    supabase.from("ig_leads").select("comment_id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
    supabase.from("whatsapp_conversas").select("id", { count: "exact", head: true }),
    supabase.from("whatsapp_conversas").select("id", { count: "exact", head: true }).gt("por_responder", 0),
    supabase.from("telegram_leads").select("chat_id", { count: "exact", head: true }),
  ])
  const igLeads = igLeadsQ.count ?? 0
  const igLeads30d = igLeads30dQ.count ?? 0
  const waConversas = waConversasQ.count ?? 0
  const waPorResponder = waPorResponderQ.count ?? 0
  const tgLeads = tgLeadsQ.count ?? 0

  // ── 4. Ecossistema — visão geral ─────────────────────────────────────────
  // Funil medido: leads com intenção (IG) → chegaram ao Telegram → agendamentos → membros.
  // O degrau «Seguidores» saiu com o ManyChat: não há tabela de seguidores, e um número estimado
  // num funil é pior do que um degrau a menos.
  const funnelData = [
    { stage: "Leads Instagram", value: igLeads, color: "#60a5fa" },
    { stage: "Leads Telegram", value: tgLeads, color: "#a78bfa" },
    { stage: "Agendamentos", value: bookingsByStatus["active"] ?? 0, color: "#D2A63C" },
    { stage: "Membros", value: activeUsers, color: "#4ade80" },
  ]

  return NextResponse.json({
    generatedAt: now.toISOString(),

    users: {
      total: totalUsers,
      active: activeUsers,
      inactive: inactiveUsers,
      newLast30d: newUsers30d,
      newLast7d: week1.count ?? 0,
      prevWeek: week2.count ?? 0,
      byType: Object.entries(userTypeMap).map(([name, value]) => ({
        name: name === "admin" ? "Admin" :
              name === "member" ? "Membro" :
              name === "trial" ? "Trial" :
              name === "premium" ? "Premium" : name,
        value,
      })),
      activitySplit: [
        { name: "Ativos", value: activeUsers, color: "#4ade80" },
        { name: "Inativos", value: inactiveUsers, color: "#6b7280" },
      ],
    },

    bookings: {
      total: totalBookings,
      last30d: bookings30d,
      upcoming: upcomingBookings,
      cancelRate,
      byStatus: Object.entries(bookingsByStatus).map(([name, value]) => ({
        name: name === "active" ? "Ativas" :
              name === "cancelled" ? "Canceladas" : name,
        value,
        color: name === "active" ? "#4ade80" : name === "cancelled" ? "#f87171" : "#6b7280",
      })),
      byType: Object.entries(bookingsByType).map(([name, value]) => ({
        name,
        value,
        color: name === "Onboarding" ? "#D2A63C" : "#60a5fa",
      })),
    },

    social: {
      instagram: { leads: igLeads, leads30d: igLeads30d },
      whatsapp: { conversas: waConversas, porResponder: waPorResponder },
      telegram: { leads: tgLeads },
    },

    funnel: funnelData,

    ecosystem: {
      supabase: "ok",
      instagram: igLeads > 0 ? "ok" : "sem_dados",
      whatsapp: waConversas > 0 ? "ok" : "sem_dados",
      telegram: tgLeads > 0 ? "ok" : "sem_dados",
      calendly: totalBookings > 0 ? "ok" : "sem_dados",
    },
  })
}
