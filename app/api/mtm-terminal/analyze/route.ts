import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase"
import { findTerminalAsset } from "@/lib/mtm-terminal-assets"
import { fetchTerminalQuote } from "@/lib/mtm-terminal-quote"
import { fetchTerminalLevels } from "@/lib/mtm-terminal-levels"
import { generateTerminalDashboard } from "@/lib/mtm-terminal-analysis"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function getAuthedClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
}

/** Acesso: admin, vip ou premium (mesma regra das Apps MTM). */
function canAccessTerminal(profile: {
  user_type?: string | null
  member_category?: string | null
  subscription_plan?: string | null
  is_active?: boolean | null
} | null): boolean {
  if (!profile || profile.is_active === false) return false
  if (profile.user_type === "admin") return true
  if (profile.user_type === "vip" || profile.member_category === "vip") return true
  return (
    profile.member_category === "iq" ||
    profile.member_category === "premium" ||
    profile.subscription_plan === "premium"
  )
}

async function requireAccess() {
  const supabase = await getAuthedClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { ok: false as const, status: 401, error: "Não autenticado" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type, member_category, subscription_plan, is_active")
    .eq("id", session.user.id)
    .single()

  if (!canAccessTerminal(profile)) {
    return { ok: false as const, status: 403, error: "Acesso exclusivo a membros Premium, VIP e Admin." }
  }
  return { ok: true as const }
}

/** GET — dashboard diário já guardado (gerado pelo cron das 9h). */
export async function GET(request: NextRequest) {
  const access = await requireAccess()
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const symbol = (new URL(request.url).searchParams.get("symbol") || "").toUpperCase().trim()
  const asset = symbol ? findTerminalAsset(symbol) : undefined
  if (!asset) return NextResponse.json({ error: "Ativo inválido" }, { status: 400 })

  try {
    const admin = getSupabaseAdmin()
    const { data } = await admin
      .from("mtm_terminal_daily")
      .select("dashboard, quote, generated_at, model")
      .eq("symbol", asset.symbol)
      .maybeSingle()

    if (!data?.dashboard) return NextResponse.json({ success: true, cached: null })

    // SEMPRE os dados mais recentes: recalcula o PREÇO e os NÍVEIS técnicos (OHLC) a cada load e
    // sobrepõe-nos ao cache diário (o narrativo/IA fica do cron das 9h; os números ficam frescos).
    const dashboard = data.dashboard as { levels?: { supports: number[]; resistances: number[] } }
    let quote = data.quote
    try {
      const fresh = await fetchTerminalQuote(asset)
      if (fresh.price != null) {
        quote = fresh
        const levels = await fetchTerminalLevels(asset, fresh.price)
        if (levels && (levels.supports.length || levels.resistances.length)) {
          dashboard.levels = { supports: levels.supports, resistances: levels.resistances }
        }
      }
    } catch {
      /* mantém o cache se a atualização ao vivo falhar */
    }

    return NextResponse.json({
      success: true,
      cached: { dashboard, quote, generatedAt: data.generated_at, model: data.model },
    })
  } catch {
    return NextResponse.json({ success: true, cached: null })
  }
}

/** POST — gera o dashboard ao vivo (botão Atualizar / sem cache), guarda e devolve. */
export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess()
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const body = await request.json().catch(() => ({}))
    const symbol = String(body.symbol || "").toUpperCase().trim()
    const asset = findTerminalAsset(symbol)
    if (!asset) return NextResponse.json({ error: "Ativo inválido" }, { status: 400 })

    const quote = await fetchTerminalQuote(asset)
    // Níveis técnicos REAIS (OHLC) — os suportes/resistências deixam de ser inventados pelo LLM.
    const levels = await fetchTerminalLevels(asset, quote.price)
    const { data: dashboard, model } = await generateTerminalDashboard(asset, quote, levels)

    // Aquece o cache diário
    try {
      await getSupabaseAdmin()
        .from("mtm_terminal_daily")
        .upsert(
          {
            symbol: asset.symbol,
            name: asset.name,
            dashboard,
            quote,
            model,
            generated_at: new Date().toISOString(),
          },
          { onConflict: "symbol" }
        )
    } catch {
      /* cache best-effort */
    }

    return NextResponse.json({ success: true, dashboard, quote, model })
  } catch (error) {
    console.error("Erro no Terminal MTM:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno do servidor" },
      { status: 500 }
    )
  }
}
