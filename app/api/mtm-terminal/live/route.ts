import { NextRequest, NextResponse } from "next/server"
import { findTerminalAsset } from "@/lib/mtm-terminal-assets"
import { fetchLiveQuote } from "@/lib/mtm-terminal-quote"
import { registarPedidosDePreco } from "@/lib/mtmfunded/simulado/pedidos-precos"

/**
 * PREÇO AO VIVO do Terminal MTM — GET ?symbol=XAUUSD
 *
 * Público, como o preço do WebTrader: é uma cotação, não dados de ninguém, e validar sessão a cada
 * 3 s por utilizador era pôr a autenticação a trabalhar para nada. A página chama isto de 3 em 3 s
 * enquanto está visível; o CDN guarda 2 s (s-maxage) e a instância 1 s, por isso a base de dados
 * lê no máximo ~1 linha por símbolo a cada 2 s, seja qual for o número de pessoas a ver.
 *
 * fra1: a Binance bloqueia pedidos vindos dos EUA (mesma razão das rotas /api/bybit).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const preferredRegion = "fra1"
export const maxDuration = 15

export async function GET(request: NextRequest) {
  const asset = findTerminalAsset(request.nextUrl.searchParams.get("symbol") || "")
  if (!asset) return NextResponse.json({ error: "Ativo inválido" }, { status: 400 })

  const [quote] = await Promise.all([
    fetchLiveQuote(asset),
    // Diz ao motor que alguém está a ver este símbolo (é o que o põe a escrever ticks).
    asset.brokerSymbol ? registarPedidosDePreco([asset.brokerSymbol]) : Promise.resolve(),
  ])

  return NextResponse.json(
    { success: true, agora: new Date().toISOString(), quote },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=4" } },
  )
}
