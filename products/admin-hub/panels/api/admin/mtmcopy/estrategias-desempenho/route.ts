import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { desempenhoDeTodas } from '@/lib/mtmauto/desempenho-estrategia'
import { contasFundedNaEquidade } from '@/lib/equidade-mtm'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * O desempenho de todas as estratégias, para o painel de admin.
 *
 * É a MESMA função que serve as apps e o site — muda só o `admin: true`, que abre os saldos.
 * Ter duas contas diferentes para o mesmo número é o que faz alguém deixar de acreditar em
 * qualquer um deles, e este painel existe precisamente para se confiar no que mostra.
 */
export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const [estrategias, contasFunded] = await Promise.all([
    desempenhoDeTodas({ admin: true }),
    contasFundedNaEquidade(),
  ])

  const equidadeFunded = contasFunded.reduce((a, c) => a + c.contribuicao, 0)

  return NextResponse.json({
    estrategias,
    equidade: {
      // O que estas contas valem à MTM (10% do nominal) e o que mostram na corretora.
      contribuicao: Math.round(equidadeFunded * 100) / 100,
      nominal: Math.round(contasFunded.reduce((a, c) => a + c.valorNominal, 0) * 100) / 100,
      contas: contasFunded,
    },
  })
}
