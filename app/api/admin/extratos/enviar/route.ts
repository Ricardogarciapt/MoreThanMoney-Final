import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'
import { correrExtratosMensais } from '@/lib/mtmfunded/extrato-mensal-envio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * SÓ SUPER ADMIN — envio manual do extrato mensal de um mês (ex.: ?periodo=2026-10).
 * Usa a mesma função do cron: só contas que conciliam, uma vez por conta e mês.
 * Sem MTM_STATEMENTS_ENVIO=1 corre em simulação e não envia nada.
 * Opcional: ?simular=1 força simulação mesmo com o envio ligado.
 */
export async function GET(request: NextRequest) {
  const negado = await requireSuperAdmin(request)
  if (negado) return negado

  const periodo = request.nextUrl.searchParams.get('periodo') ?? ''
  const m = /^(\d{4})-(\d{2})$/.exec(periodo)
  const mes = m ? Number(m[2]) : 0
  if (!m || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'periodo inválido; usar AAAA-MM' }, { status: 400 })
  }

  const simular = request.nextUrl.searchParams.get('simular') === '1'
  const resumo = await correrExtratosMensais({ ano: Number(m[1]), mes }, { enviar: simular ? false : undefined })
  return NextResponse.json(resumo)
}
