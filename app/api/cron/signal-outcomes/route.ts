import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { atualizarTodosOsDesfechos } from "@/lib/mtmcopy/signal-outcomes"

/**
 * Mantém `chat_messages.outcome` em dia: os pips e a percentagem de cada sinal terminado.
 *
 * Corre de 5 em 5 minutos sobre as últimas 48 horas — é a rede de segurança que apanha os fechos
 * que chegam por caminhos diferentes (relay, master-poll, motor de preço, monitor de perpétuos).
 * Com `?full=1` percorre TODO o histórico; é assim que se faz o backfill.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const full = request.nextUrl.searchParams.get("full") === "1"
  const desde = full ? undefined : new Date(Date.now() - 48 * 3_600_000).toISOString()
  const resultado = await atualizarTodosOsDesfechos(desde)
  const escritas = Object.values(resultado).reduce((s, r) => s + r.escritas, 0)
  return NextResponse.json({ ok: true, full, escritas, resultado })
}
