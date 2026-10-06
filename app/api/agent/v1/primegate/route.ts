import { NextRequest } from 'next/server'
import { agentError, agentOk, requireAgentAccess } from '@/lib/agent-site-api'
import { resumoPrimeGate } from '@/lib/primegate/verificacao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/agent/v1/primegate?resource=resumo  (Bearer AGENT_SITE_API_KEY)
 *
 * Para o AIOS e os agentes: contagens confirmed/undetermined/erro, pendentes de reverificação,
 * esgotados (5 tentativas sem confirmação — NÃO são recusas) e a quota usada hoje.
 * Sem emails nem UIDs: só números.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth
  const resource = request.nextUrl.searchParams.get('resource') || 'resumo'
  if (resource !== 'resumo') return agentError('resource desconhecido. Disponível: resumo')
  try {
    return agentOk(await resumoPrimeGate())
  } catch {
    return agentError('não consegui ler o resumo do PrimeGate', 500)
  }
}
