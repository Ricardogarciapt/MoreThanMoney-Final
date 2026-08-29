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

export async function GET(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || "active"
  const limit = parseInt(searchParams.get("limit") || "50")
  const eventType = searchParams.get("event_type")

  let query = supabase
    .from("calendly_bookings")
    .select("*")
    .order("start_time", { ascending: false })
    .limit(limit)

  if (status !== "all") query = query.eq("status", status)
  if (eventType) query = query.eq("event_type_slug", eventType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Stats
  const { count: totalActive } = await supabase
    .from("calendly_bookings")
    .select("*", { count: "exact", head: true })
    .eq("status", "active")

  const { count: totalCancelled } = await supabase
    .from("calendly_bookings")
    .select("*", { count: "exact", head: true })
    .eq("status", "cancelled")

  const { count: onboardings } = await supabase
    .from("calendly_bookings")
    .select("*", { count: "exact", head: true })
    .eq("event_type_slug", "onboarding-de-novos-membros")
    .eq("status", "active")

  return NextResponse.json({
    bookings: data,
    stats: {
      totalActive: totalActive ?? 0,
      totalCancelled: totalCancelled ?? 0,
      onboardings: onboardings ?? 0,
      reunioes: (totalActive ?? 0) - (onboardings ?? 0),
    },
  })
}
