import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { resolveCurrentPrice } from "@/lib/mtm-alerts/evaluate"

/**
 * Preço atual de um ticker para acompanhar a ação de preço de um sinal seguido.
 * Usa as fontes já existentes (Binance para cripto, Yahoo para o resto).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          /* read-only */
        },
      },
    }
  )
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const ticker = (new URL(request.url).searchParams.get("ticker") || "").trim()
  if (!ticker) return NextResponse.json({ error: "ticker em falta" }, { status: 400 })

  const price = await resolveCurrentPrice(ticker)
  return NextResponse.json({ success: true, ticker, price }, { headers: { "Cache-Control": "no-store" } })
}
