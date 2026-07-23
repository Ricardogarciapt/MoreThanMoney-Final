import { NextRequest, NextResponse } from "next/server"
import { POST as tradingviewPOST } from "../tradingview/route"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Webhook DEDICADO da lista de Perpétuos Cripto ("MTM Perps").
 *
 * Os alertas da watchlist de perps no TradingView apontam para ESTE URL. Reencaminha
 * para o handler principal do webhook com o header `x-mtm-perps: 1`, que força o
 * roteamento para o canal "Ideias de Perpétuos Cripto" (cripto-perps), em PAPEL,
 * independentemente do nome do alerta ou do ticker (inclui BTC perp sem o roubar ao
 * Sensei). É também o gancho para a execução Bybit na Fase 2 (motor de cópia próprio),
 * isolado do webhook partilhado.
 *
 * Autenticação (secret/passphrase) e parsing são tratados pelo handler principal.
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const headers = new Headers(request.headers)
  headers.set("x-mtm-perps", "1")
  const forwarded = new NextRequest(request.url, { method: "POST", headers, body })
  return tradingviewPOST(forwarded)
}

export function GET() {
  return NextResponse.json({ ok: true, endpoint: "tradingview-perps", mode: "paper" })
}
