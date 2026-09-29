import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { atualizarTodosOsDesfechos } from "@/lib/mtmcopy/signal-outcomes"
import { reconciliarHistorico } from "@/lib/mtmcopy/desfecho-unico"

/**
 * Mantém `chat_messages.outcome` em dia: os pips e a percentagem de cada sinal terminado.
 *
 * Corre de 5 em 5 minutos sobre as últimas 48 horas — é a rede de segurança que apanha os fechos
 * que chegam por caminhos diferentes (relay, master-poll, motor de preço, monitor de perpétuos).
 * Com `?full=1` percorre TODO o histórico; é assim que se faz o backfill.
 *
 * Com `?reconciliar=1` faz outra coisa: percorre o histórico JÁ FECHADO e mostra onde o número
 * publicado discorda do que o preço mediu — as linhas anteriores à escada de `desfecho-unico`,
 * que não têm `origem` e por isso seriam reclamadas por este mesmo cron, fixando o número
 * errado. Só CONTA, não escreve. Acrescentar `&aplicar=1` é que escreve, e isso reescreve
 * números de desempenho já publicados: é decisão do dono, não do cron.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const params = request.nextUrl.searchParams
  if (params.get("reconciliar") === "1") {
    // `aplicar` tem de ser pedido à mão — sem ele isto é uma vista, não uma escrita.
    const r = await reconciliarHistorico({ aplicar: params.get("aplicar") === "1" })
    return NextResponse.json({ ok: true, reconciliacao: r })
  }
  const full = params.get("full") === "1"
  const desde = full ? undefined : new Date(Date.now() - 48 * 3_600_000).toISOString()
  const resultado = await atualizarTodosOsDesfechos(desde)
  const escritas = Object.values(resultado).reduce((s, r) => s + r.escritas, 0)
  return NextResponse.json({ ok: true, full, escritas, resultado })
}
