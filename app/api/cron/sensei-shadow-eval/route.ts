/**
 * Avaliador do SHADOW do Sensei (#57/#59). Corre a cada 15min: para cada trade shadow ABERTA
 * (entra-no-sinal + alvo ~100 pips), lê o preço spot ATUAL (mesma fonte da entrada) e resolve
 * por SNAPSHOT — entra-no-mercado: SL conta como loss real (ao contrário do avaliador live
 * baseado em gatilho). Regista também o extremo favorável/adverso para medir o upside do
 * "deixa correr". Não executa nem posta nada. Ver lib/mtmcopy/sensei-shadow.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { resolveCurrentPrice } from "@/lib/mtm-alerts/evaluate"
import { getSenseiShadowConfig } from "@/lib/mtmcopy/sensei-shadow"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Row = {
  id: string
  created_at: string
  ticker: string
  side: "buy" | "sell"
  entry: number
  sl: number | null
  tp: number
  max_favorable: number | null
  max_adverse: number | null
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const cfg = await getSenseiShadowConfig()
  const { data, error } = await supabase
    .from("sensei_shadow_trades")
    .select("id,created_at,ticker,side,entry,sl,tp,max_favorable,max_adverse")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(300)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const rows = (data ?? []) as Row[]
  const now = Date.now()
  const horizonMs = cfg.horizonHours * 3600_000
  const priceCache = new Map<string, number | null>()
  let resolved = 0
  let expired = 0
  let updated = 0

  for (const r of rows) {
    // preço atual (cache por ticker neste run)
    let price = priceCache.get(r.ticker)
    if (price === undefined) {
      price = await resolveCurrentPrice(r.ticker).catch(() => null)
      priceCache.set(r.ticker, price)
    }

    const ageMs = now - Date.parse(r.created_at)
    const patch: Record<string, unknown> = {}

    if (price != null && price > 0) {
      // extremos (upside do "deixa correr")
      const fav = r.side === "buy" ? Math.max(r.max_favorable ?? -Infinity, price) : Math.min(r.max_favorable ?? Infinity, price)
      const adv = r.side === "buy" ? Math.min(r.max_adverse ?? Infinity, price) : Math.max(r.max_adverse ?? -Infinity, price)
      patch.max_favorable = Number.isFinite(fav) ? fav : price
      patch.max_adverse = Number.isFinite(adv) ? adv : price

      const hitTp = r.side === "buy" ? price >= r.tp : price <= r.tp
      const hitSl = r.sl != null && (r.side === "buy" ? price <= r.sl : price >= r.sl)
      // conservador: dentro do mesmo snapshot não há ambiguidade (preço único); SL se ambos falso.
      if (hitSl) {
        patch.status = "hit_sl"
        patch.resolved_at = new Date().toISOString()
        resolved++
      } else if (hitTp) {
        patch.status = "hit_target"
        patch.resolved_at = new Date().toISOString()
        patch.bars_to_target = Math.round(ageMs / (15 * 60000))
        resolved++
      }
    }

    if (patch.status === undefined && ageMs > horizonMs) {
      patch.status = "expired"
      patch.resolved_at = new Date().toISOString()
      expired++
    }

    if (Object.keys(patch).length) {
      await supabase.from("sensei_shadow_trades").update(patch).eq("id", r.id)
      updated++
    }
  }

  return NextResponse.json({ ok: true, open_before: rows.length, resolved, expired, updated })
}
