import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { reconciliarEstrategias } from '@/lib/mtmauto/reconciliar-estrategias'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Verifica — e opcionalmente repara — o alinhamento das estratégias.
 *
 * Uma estratégia vive em quatro sítios: a linha do provider, a conta mestre, a conta na
 * MetaApi e a estratégia na CopyFactory. Cada passo pode falhar sozinho, e falha em silêncio
 * porque tudo o resto continua a funcionar.
 *
 * Corre AQUI e não de um script local por uma razão concreta: a reparação precisa de decifrar
 * a palavra-passe da conta, e a chave (`MTMFUNDED_CRED_KEY`) só existe em produção. De fora,
 * a mesma função diz «a palavra-passe não é legível» — tecnicamente verdade, e completamente
 * enganador sobre onde está o problema.
 *
 * GET  → só diz o que está desalinhado.
 * POST → repara o que consegue. Nunca apaga nada: uma divergência pode ser um erro ou uma
 *        decisão de alguém, e daqui não se distingue uma da outra.
 */
export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  return NextResponse.json(await reconciliarEstrategias())
}

export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  return NextResponse.json(await reconciliarEstrategias({ reparar: true }))
}
