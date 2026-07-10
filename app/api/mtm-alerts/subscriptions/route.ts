import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Preferências de Trading Alerts do utilizador (símbolos/estratégias/timeframes).
 * Sincronizadas em Supabase (tabela user_signal_subscriptions, RLS por utilizador).
 */

async function getClient() {
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

/** Ativos que cada utilizador recebe por defeito nos Alertas MTM (o resto liga nos settings). */
export const DEFAULT_ALERT_SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "USDCAD", "USDJPY", "BTCUSD", "US30"]

const DEFAULT_SUB = {
  enabled: true,
  push_enabled: true,
  symbols: DEFAULT_ALERT_SYMBOLS,
  strategies: [] as string[],
  timeframes: [] as string[],
}

export async function GET() {
  const supabase = await getClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const { data, error } = await supabase
    .from("user_signal_subscriptions")
    .select("enabled, push_enabled, symbols, strategies, timeframes")
    .eq("user_id", session.user.id)
    .maybeSingle()

  if (error) {
    // Tabela ainda não migrada ou sem linha — devolve defaults
    return NextResponse.json({ success: true, subscription: DEFAULT_SUB })
  }

  return NextResponse.json({ success: true, subscription: data || DEFAULT_SUB })
}

export async function POST(request: NextRequest) {
  const supabase = await getClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
  }

  const clean = (arr: unknown): string[] =>
    Array.isArray(arr) ? [...new Set(arr.map((x) => String(x).trim().toUpperCase()).filter(Boolean))] : []

  const payload = {
    user_id: session.user.id,
    enabled: body.enabled !== false,
    push_enabled: body.push_enabled !== false,
    symbols: clean(body.symbols),
    strategies: clean(body.strategies),
    timeframes: clean(body.timeframes),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from("user_signal_subscriptions")
    .upsert(payload, { onConflict: "user_id" })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, subscription: payload })
}
