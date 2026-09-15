import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase"
import { findTerminalAsset } from "@/lib/mtm-terminal-assets"
import { buildAndGenerate } from "@/lib/mtm-terminal-analysis"
import { refreshDecision } from "@/lib/mtm-terminal-live"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// A chamada ao modelo tem 100 s de orçamento; a rota fica com folga para guardar e fechar o stream.
export const maxDuration = 120

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
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            /* resposta já começou */
          }
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
  return { ok: true as const, userId: session.user.id }
}

async function readCached(symbol: string) {
  const { data } = await getSupabaseAdmin()
    .from("mtm_terminal_daily")
    .select("dashboard, quote, generated_at, model")
    .eq("symbol", symbol)
    .abortSignal(AbortSignal.timeout(6_000))
    .maybeSingle()
  return data
}

/**
 * GET — análise diária guardada (cron). Só a narrativa e quando foi gerada: os NÚMEROS ao vivo
 * (preço, níveis, técnicos) vêm de /api/mtm-terminal/live e /candles e são calculados na página.
 * (Antes o GET ia também ao Yahoo sem timeout — com a base lenta, o botão ficava a rodar.)
 */
export async function GET(request: NextRequest) {
  const access = await requireAccess()
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const asset = findTerminalAsset(request.nextUrl.searchParams.get("symbol") || "")
  if (!asset) return NextResponse.json({ error: "Ativo inválido" }, { status: 400 })

  try {
    const data = await readCached(asset.symbol)
    if (!data?.dashboard) return NextResponse.json({ success: true, cached: null })
    return NextResponse.json({
      success: true,
      cached: { dashboard: data.dashboard, quote: data.quote, generatedAt: data.generated_at, model: data.model },
    })
  } catch {
    return NextResponse.json({ success: false, error: "Análise guardada indisponível agora" }, { status: 503 })
  }
}

// 1 pedido por utilizador/ativo a cada 5 min (por instância) + o limite global pela data da análise.
const lastUserRequest = new Map<string, number>()
const inFlight = new Map<string, ReturnType<typeof buildAndGenerate>>()

/**
 * POST — gera a análise agora. Responde em NDJSON a correr: {"estado":"a_gerar"} logo e a cada 5 s
 * (mantém a ligação viva e a página sabe que não está parada) e no fim {"ok":true,...} ou
 * {"ok":false,"error":...}. Antes era um pedido mudo, sem timeout nem maxDuration.
 */
export async function POST(request: NextRequest) {
  const access = await requireAccess()
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await request.json().catch(() => ({}))
  const asset = findTerminalAsset(String(body.symbol || ""))
  if (!asset) return NextResponse.json({ error: "Ativo inválido" }, { status: 400 })

  let cachedRow: Awaited<ReturnType<typeof readCached>> = null
  try {
    cachedRow = await readCached(asset.symbol)
  } catch {
    /* sem leitura → não bloqueia pelo limite global */
  }
  const key = `${access.userId}:${asset.symbol}`
  const now = Date.now()
  const decision = refreshDecision({
    lastGeneratedAt: cachedRow?.generated_at ?? null,
    lastUserRequestAt: lastUserRequest.get(key) ?? null,
    now,
  })
  if (!decision.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error:
          decision.reason === "asset"
            ? `Esta análise foi gerada há menos de 5 min. Nova atualização possível daqui a ${decision.retryAfterS} s.`
            : `Já pediste esta análise há pouco. Tenta daqui a ${decision.retryAfterS} s.`,
        retryAfterS: decision.retryAfterS,
        ...(cachedRow?.dashboard
          ? { dashboard: cachedRow.dashboard, quote: cachedRow.quote, generatedAt: cachedRow.generated_at, model: cachedRow.model }
          : {}),
      },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterS) } },
    )
  }
  lastUserRequest.set(key, now)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
        } catch {
          /* cliente fechou */
        }
      }
      send({ estado: "a_gerar", segundos: 0 })
      const beat = setInterval(() => send({ estado: "a_gerar", segundos: Math.round((Date.now() - now) / 1000) }), 5_000)
      try {
        // Dois pedidos ao mesmo ativo na mesma instância partilham a mesma geração.
        let job = inFlight.get(asset.symbol)
        if (!job) {
          job = buildAndGenerate(asset, { deadlineMs: 100_000 })
          inFlight.set(asset.symbol, job)
          job.finally(() => inFlight.delete(asset.symbol)).catch(() => {})
        }
        const { dashboard, quote, model } = await job
        const generatedAt = new Date().toISOString()
        const { error: upsertError } = await getSupabaseAdmin()
          .from("mtm_terminal_daily")
          .upsert(
            { symbol: asset.symbol, name: asset.name, dashboard, quote, model, generated_at: generatedAt },
            { onConflict: "symbol" },
          )
        if (upsertError) console.error("[mtm-terminal] falha a guardar análise", asset.symbol, upsertError.message)
        const segundos = Math.round((Date.now() - now) / 1000)
        console.log("[mtm-terminal] análise gerada", asset.symbol, model, `${segundos}s`)
        send({ ok: true, dashboard, quote, model, generatedAt, segundos })
      } catch (error) {
        console.error("[mtm-terminal] falha a gerar análise", asset.symbol, `${Math.round((Date.now() - now) / 1000)}s`, error)
        lastUserRequest.delete(key) // falhou: não conta para o limite do utilizador
        send({ ok: false, error: error instanceof Error ? error.message : "Erro ao gerar a análise" })
      } finally {
        clearInterval(beat)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  })
}
