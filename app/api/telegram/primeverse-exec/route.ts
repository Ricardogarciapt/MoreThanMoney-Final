import { NextResponse } from 'next/server'

/**
 * 410 GONE — a perna de SINAIS do PrimeVerse saiu (decisão do dono, 2026-10-04).
 *
 * Esta rota recebia do relay `pv-relay` (VPS) os sinais do canal «PѴ TRADE INSIGHTS» — setups,
 * ENTRY HIT, TP/SL, fechos — e abria-os na mestre MTM Auto Edge (antes também King e Wolf, que já
 * tinham saído a 29/09) e nas contas que a seguem. O `pv-relay` foi PARADO e desligado a 04/10;
 * sem relay não há quem chame isto, e uma rota de execução sem fonte é uma porta aberta para quem
 * tiver o segredo. Fica a devolver 410 com o motivo, em vez de 404, para que um pedido perdido do
 * relay antigo se perceba nos logs pelo que é.
 *
 * O que NÃO saiu com isto:
 *  · «Entrar com PrimeVerse» (hub.primeverse.ca) — é LOGIN, vive em /api/auth/primeverse-login.
 *  · A estratégia MTM Auto Edge (`mtmauto_providers.slug = 'mtm-auto-edge'`) e as mensagens já
 *    publicadas no canal `sinais-scanner-mtm`: o motor das mestres continua a gerir o que está
 *    aberto, e as etiquetas Edge/King/Wolf continuam a ler-se (lib/sinais/formato-sinal.ts).
 *  · O leitor das mensagens em lib/mtmfunded/estrategias-sinais/calculo.ts — é usado pelas mestres
 *    e pela reconstituição para LER o histórico, não para executar.
 */
export const dynamic = 'force-dynamic'

const MOTIVO = {
  ok: false,
  error: 'gone',
  motivo: 'A fonte PrimeVerse (pv-relay) saiu a 2026-10-04 por decisão do dono; esta rota já não executa nada.',
} as const

export async function POST() {
  return NextResponse.json(MOTIVO, { status: 410 })
}

export async function GET() {
  return NextResponse.json(MOTIVO, { status: 410 })
}
