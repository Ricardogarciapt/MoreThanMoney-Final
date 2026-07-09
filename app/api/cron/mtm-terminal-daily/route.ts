import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { TERMINAL_ASSETS } from "@/lib/mtm-terminal-assets"
import { fetchTerminalQuote } from "@/lib/mtm-terminal-quote"
import { generateTerminalDashboard } from "@/lib/mtm-terminal-analysis"

/**
 * CRON: análise diária do Terminal MTM.
 * Gera e guarda em mtm_terminal_daily a análise institucional de cada ativo,
 * para a página /mtm-terminal mostrar logo ao abrir (sem gerar por visita).
 * Horário: 08:00 UTC (~09h Portugal).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const results: { symbol: string; ok: boolean; error?: string }[] = []

  for (const asset of TERMINAL_ASSETS) {
    try {
      const quote = await fetchTerminalQuote(asset)
      const { data: dashboard, model } = await generateTerminalDashboard(asset, quote)
      const { error } = await admin.from("mtm_terminal_daily").upsert(
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
      results.push({ symbol: asset.symbol, ok: !error, error: error?.message })
    } catch (err) {
      results.push({ symbol: asset.symbol, ok: false, error: err instanceof Error ? err.message : "erro" })
    }
  }

  const okCount = results.filter((r) => r.ok).length
  return NextResponse.json({ success: true, generated: okCount, total: TERMINAL_ASSETS.length, results })
}
