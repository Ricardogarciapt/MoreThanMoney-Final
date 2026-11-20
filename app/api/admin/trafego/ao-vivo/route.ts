import { NextRequest, NextResponse } from 'next/server'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { lerAoVivoMeta } from '@/lib/trafego/meta'

export const dynamic = 'force-dynamic'

/** Teto mensal de publicidade decidido pelo dono (16/11/2026). */
const TETO_MENSAL_EUR = 150

/**
 * GET /api/admin/trafego/ao-vivo — o feed ao vivo das campanhas Meta: estado e revisão de cada anúncio,
 * gasto contra orçamento e a conta (gasto do mês contra o teto, por faturar). O painel relê de minuto
 * a minuto. Só leitura; nada do método de pagamento sai daqui.
 */
export async function GET(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.gestao_comercial')
  if (g.negado) return g.negado
  const vivo = await lerAoVivoMeta()
  return NextResponse.json({ vivo, tetoMensal: TETO_MENSAL_EUR })
}
