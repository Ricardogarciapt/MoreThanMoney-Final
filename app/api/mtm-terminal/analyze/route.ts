import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase"
import { findTerminalAsset } from "@/lib/mtm-terminal-assets"
import { fetchTerminalQuote } from "@/lib/mtm-terminal-quote"
import { streamTerminalAnalysis } from "@/lib/mtm-terminal-analysis"

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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
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

/** GET — devolve a análise diária JÁ guardada (gerada pelo cron das 9h). */
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
      .select("analysis, quote, generated_at, model")
      .eq("symbol", asset.symbol)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      cached: data
        ? {
            analysis: data.analysis,
            quote: data.quote,
            generatedAt: data.generated_at,
            model: data.model,
          }
        : null,
    })
  } catch {
    return NextResponse.json({ success: true, cached: null })
  }
}

/** POST — análise ao vivo em streaming (botão Atualizar / auto ao abrir sem cache). */
export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess()
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const body = await request.json()
    const { symbol, timeframe, question } = body as {
      symbol?: string
      timeframe?: string
      question?: string
    }

    const asset = symbol ? findTerminalAsset(symbol) : undefined
    if (!asset) return NextResponse.json({ error: "Ativo inválido" }, { status: 400 })

    const quote = await fetchTerminalQuote(asset)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "quote", quote, symbol: asset.symbol, tvSymbol: asset.tvSymbol })}\n\n`
          )
        )
        try {
          let full = ""
          await streamTerminalAnalysis(
            asset,
            quote,
            (text) => {
              full += text
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text })}\n\n`))
            },
            { timeframe, question }
          )
          // Aquece o cache diário com a análise gerada ao vivo (exceto perguntas ad-hoc)
          if (!question && full.trim()) {
            try {
              await getSupabaseAdmin()
                .from("mtm_terminal_daily")
                .upsert(
                  {
                    symbol: asset.symbol,
                    name: asset.name,
                    analysis: full,
                    quote,
                    model: process.env.ANTHROPIC_MODEL || null,
                    generated_at: new Date().toISOString(),
                  },
                  { onConflict: "symbol" }
                )
            } catch {
              /* cache best-effort */
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Erro interno"
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("Erro no Terminal MTM:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
