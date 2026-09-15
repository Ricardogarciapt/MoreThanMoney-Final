import { NextRequest, NextResponse } from "next/server"
import { findTerminalAsset } from "@/lib/mtm-terminal-assets"
import { fetchTerminalCandles } from "@/lib/mtm-terminal-levels"

/**
 * VELAS DIÁRIAS do instrumento de referência — GET ?symbol=XAUUSD
 * → { ref: { kind, symbol, sameLevel }, velas: [[t,o,h,l,c], ...] }
 *
 * A página recalcula níveis, regime, RSI e ATR no browser com o preço ao vivo, por isso isto só
 * muda uma vez por minuto (CDN 60 s). Sem MetaApi: Binance/Yahoo.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const preferredRegion = "fra1"
export const maxDuration = 15

const cache = new Map<string, { at: number; velas: number[][] }>()

export async function GET(request: NextRequest) {
  const asset = findTerminalAsset(request.nextUrl.searchParams.get("symbol") || "")
  if (!asset) return NextResponse.json({ error: "Ativo inválido" }, { status: 400 })

  let hit = cache.get(asset.symbol)
  if (!hit || Date.now() - hit.at > 60_000) {
    const candles = await fetchTerminalCandles(asset)
    if (candles.length) {
      hit = { at: Date.now(), velas: candles.slice(-260).map((c) => [c.t, c.o, c.h, c.l, c.c]) }
      cache.set(asset.symbol, hit)
    }
  }
  const velas = hit?.velas ?? []
  return NextResponse.json(
    { success: true, ref: asset.ref, velas },
    { headers: { "Cache-Control": velas.length ? "public, max-age=30, s-maxage=60, stale-while-revalidate=120" : "no-store" } },
  )
}
