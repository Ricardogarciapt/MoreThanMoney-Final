import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { TERMINAL_ASSETS, findTerminalAsset } from "@/lib/mtm-terminal-assets"
import { buildAndGenerate } from "@/lib/mtm-terminal-analysis"
import { pickAssetsToRefresh } from "@/lib/mtm-terminal-live"

/**
 * CRON: análise diária do Terminal MTM, EM LOTES.
 *
 * Antes percorria os 22 ativos numa só invocação de 300 s: cada chamada ao modelo leva 20–60 s,
 * por isso a função morria a meio e os últimos da lista (XRP, NAS100…) ficavam com análises de
 * julho. Agora cada invocação trata os BATCH ativos com análise mais antiga (≥ 20 h; sem análise
 * primeiro), dois de cada vez, e não arranca um novo depois de DEADLINE_MS. Corre de 20 em 20 min
 * entre as 05:00 e as 08:40 UTC (12 corridas × 4 = 48 vagas para 22 ativos — sobra para falhas).
 * ?force=SYMBOL gera esse ativo já.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const preferredRegion = "fra1"
export const maxDuration = 300

const BATCH = 4
const CONCURRENCY = 2
// Só tem de ser MAIOR do que a janela do cron (05:00–08:40 UTC, ~4 h), para não refazer o mesmo
// ativo duas vezes na mesma manhã. Estava a 20 h, e isso partia-se sempre que um ativo era gerado
// fora da janela (alguém a abrir a página, ou um ?force= à tarde): na manhã seguinte ainda não
// tinha 20 h e ficava parado até ao dia a seguir. Com 12 h, qualquer análise feita depois das
// 17:00 da véspera já é refeita na janela.
const MIN_AGE_MS = 12 * 3600_000
/** Não arranca um ativo novo depois disto (deixa ~100 s ao que está a correr). */
const DEADLINE_MS = 180_000

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const started = Date.now()
  const admin = getSupabaseAdmin()

  const force = request.nextUrl.searchParams.get("force")
  let queue: string[]
  if (force) {
    const a = findTerminalAsset(force)
    if (!a) return NextResponse.json({ error: "Ativo inválido" }, { status: 400 })
    queue = [a.symbol]
  } else {
    const { data, error } = await admin.from("mtm_terminal_daily").select("symbol, generated_at, grounding:dashboard->grounding")
    if (error) {
      console.error("[cron mtm-terminal-daily] leitura falhou", error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    // Linhas do formato antigo (sem grounding) contam como sem análise — são as primeiras a refazer.
    const bySymbol = Object.fromEntries(
      (data ?? []).map((r) => [String(r.symbol), r.grounding ? (r.generated_at as string | null) : null]),
    )
    queue = pickAssetsToRefresh(TERMINAL_ASSETS.map((a) => a.symbol), bySymbol, started, { batch: BATCH, minAgeMs: MIN_AGE_MS })
  }

  const results: { symbol: string; ok: boolean; seconds: number; model?: string; error?: string }[] = []
  const worker = async () => {
    while (queue.length && Date.now() - started <= DEADLINE_MS) {
      const symbol = queue.shift()!
      const asset = findTerminalAsset(symbol)!
      const t0 = Date.now()
      try {
        const { dashboard, quote, model } = await buildAndGenerate(asset, { deadlineMs: 100_000 })
        const { error } = await admin.from("mtm_terminal_daily").upsert(
          { symbol: asset.symbol, name: asset.name, dashboard, quote, model, generated_at: new Date().toISOString() },
          { onConflict: "symbol" },
        )
        if (error) throw new Error(`upsert: ${error.message}`)
        results.push({ symbol, ok: true, seconds: Math.round((Date.now() - t0) / 1000), model })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[cron mtm-terminal-daily] falhou", symbol, msg)
        results.push({ symbol, ok: false, seconds: Math.round((Date.now() - t0) / 1000), error: msg.slice(0, 300) })
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  return NextResponse.json({
    success: true,
    generated: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    leftForNextRun: queue,
    seconds: Math.round((Date.now() - started) / 1000),
    results,
  })
}
