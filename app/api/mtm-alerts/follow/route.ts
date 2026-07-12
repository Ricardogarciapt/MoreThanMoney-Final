import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Sinais seguidos pelo utilizador (acompanhamento da ação de preço).
 * NÃO executa nada — é apenas uma watchlist pessoal, fora do Tap-to-Trade/MTM Auto.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

/** GET → lista de signal_ids seguidos pelo utilizador. */
export async function GET() {
  const supabase = await getClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const { data, error } = await supabase
    .from("user_followed_signals")
    .select("signal_id")
    .eq("user_id", session.user.id)

  if (error) return NextResponse.json({ success: true, followed: [] })
  return NextResponse.json({ success: true, followed: (data ?? []).map((r) => r.signal_id) })
}

/** POST { signalId, follow } → segue/deixa de seguir um sinal. */
export async function POST(request: NextRequest) {
  const supabase = await getClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const signalId = String(body.signalId || "").trim()
  const follow = body.follow !== false
  if (!signalId) return NextResponse.json({ error: "signalId em falta" }, { status: 400 })

  if (follow) {
    const { error } = await supabase
      .from("user_followed_signals")
      .upsert({ user_id: session.user.id, signal_id: signalId }, { onConflict: "user_id,signal_id" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from("user_followed_signals")
      .delete()
      .eq("user_id", session.user.id)
      .eq("signal_id", signalId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, following: follow })
}
