import { NextRequest, NextResponse } from "next/server"
import { findTerminalAsset, type ReferenceInstrument } from "@/lib/mtm-terminal-assets"
import { fetchTerminalCandleSeries } from "@/lib/mtm-terminal-levels"
import { candlesCacheHeader } from "@/lib/mtm-terminal-live"

/**
 * VELAS DIÁRIAS do instrumento de referência — GET ?symbol=XAUUSD
 * → { ref: { kind, symbol, sameLevel }, velas: [[t,o,h,l,c], ...] }
 *
 * `ref` é a referência que DEU as velas (pode ser uma de reserva, ex.: PAXG no ouro): a página usa o
 * `sameLevel` dela para decidir se reescala. Sem MetaApi e sem base de dados: Binance/Yahoo.
 *
 * Região: o preferredRegion fica, mas as funções node deste projeto correm em iad1 (x-vercel-id
 * «cdg1::iad1::…», 17/09) — só as edge respeitam fra1. Por isso fapi.binance.com (451 nos EUA) não
 * serve sozinho; ver refFallbacks em lib/mtm-terminal-assets.ts.
 *
 * Carga: velas diárias mudam devagar. Com velas, CDN 60 s; sem velas, CDN 30 s e a instância também
 * guarda o vazio 30 s — antes o vazio ia com no-store e cada visita voltava a bater nas fontes.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const preferredRegion = "fra1"
export const maxDuration = 15

const OK_TTL_MS = 60_000
const EMPTY_TTL_MS = 30_000
const cache = new Map<string, { at: number; ref: ReferenceInstrument; velas: number[][] }>()

export async function GET(request: NextRequest) {
  const asset = findTerminalAsset(request.nextUrl.searchParams.get("symbol") || "")
  if (!asset) return NextResponse.json({ error: "Ativo inválido" }, { status: 400 })

  let hit = cache.get(asset.symbol)
  const ttl = hit?.velas.length ? OK_TTL_MS : EMPTY_TTL_MS
  if (!hit || Date.now() - hit.at > ttl) {
    const { ref, candles } = await fetchTerminalCandleSeries(asset)
    const velas = candles.slice(-260).map((c) => [c.t, c.o, c.h, c.l, c.c])
    // Um falhanço momentâneo não apaga velas boas que a instância já tinha.
    if (velas.length || !hit?.velas.length) {
      hit = { at: Date.now(), ref, velas }
      cache.set(asset.symbol, hit)
    }
    if (!velas.length) console.warn(`[mtm-terminal/candles] ${asset.symbol}: nenhuma referência deu velas`)
  }
  return NextResponse.json(
    { success: true, ref: hit!.ref, velas: hit!.velas },
    { headers: { "Cache-Control": candlesCacheHeader(hit!.velas.length) } },
  )
}
