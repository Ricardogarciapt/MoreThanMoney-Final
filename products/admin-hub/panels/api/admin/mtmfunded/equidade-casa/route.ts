import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { equidadeDasContasDaCasa } from '@/lib/equidade-casa'

export const dynamic = 'force-dynamic'

/**
 * Equidade das contas MTM Funded da casa (conta_casa): total e por estratégia, em dinheiro.
 * SÓ ADMIN — para fora só se publicam pips e %. Ver lib/equidade-casa.ts.
 */
export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  return NextResponse.json(await equidadeDasContasDaCasa())
}
