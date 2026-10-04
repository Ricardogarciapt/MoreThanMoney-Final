import { NextResponse } from 'next/server'

/**
 * 410 GONE — a fonte «Forex Swings» (canal JAMES → relay `fs-relay`) saiu (decisão do dono, 2026-10-04).
 *
 * Esta rota recebia do `fs-relay` (VPS) os sinais do canal externo, publicava-os no chat da app
 * `ideias-e-sinais` («MTM Auto FOREX Swings») e abria-os na conta-mestre configurada em
 * `site_settings.forex_swings_execution` (a última, bd421604 «Monaxa 20X», está inactiva e
 * apagada na MetaApi). O `fs-relay` foi PARADO e desligado a 04/10; sem relay não há quem chame isto.
 * Fica a devolver 410 com o motivo para que um pedido perdido do relay antigo se perceba nos logs.
 *
 * O que NÃO saiu com isto (são da casa, não da fonte):
 *  · o grupo Telegram «MTM Auto FOREX swings» (-1004362819270) e o canal da app `ideias-e-sinais`,
 *    com as mensagens já publicadas — continuam a ler-se e o T2T continua a reconhecer a fonte
 *    `james` nelas (lib/mtmcopy/t2t-source.ts) para fechar o que estiver aberto;
 *  · o espelho desse grupo para o canal da app (webhook-aibot), gateado pelo interruptor `forex_swings`.
 */
export const dynamic = 'force-dynamic'

const MOTIVO = {
  ok: false,
  error: 'gone',
  motivo: 'A fonte Forex Swings (fs-relay) saiu a 2026-10-04 por decisão do dono; esta rota já não executa nada.',
} as const

export async function POST() {
  return NextResponse.json(MOTIVO, { status: 410 })
}

export async function GET() {
  return NextResponse.json(MOTIVO, { status: 410 })
}
