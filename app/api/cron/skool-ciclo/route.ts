import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { correrCicloSkool } from '@/lib/skool/ciclo'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Ciclo do Skool (feed da app, ideias DEFY, DCA, desafio e sala do dia).
 * O vercel.json está no tecto de 100 crons, por isso isto corre de hora a hora encadeado no
 * cron social-link-preview; esta rota serve para correr à mão ou a partir do mtm-vigias.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  return NextResponse.json(await correrCicloSkool())
}
