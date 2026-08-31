import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/admin-api-helpers'
import { carregarDireitos } from '@/lib/entitlements'
import { licencasDoUtilizador, PRECO_ANUAL_EUR, PRECO_VITALICIO_EUR } from '@/lib/licencas'

export const dynamic = 'force-dynamic'

/** As licenças deste utilizador e se tem direito a emitir mais uma sem pagar. */
export async function GET() {
  const { userId, error } = await getAuthenticatedUser()
  if (!userId) return NextResponse.json({ error: error || 'Não autenticado' }, { status: 401 })

  const [direitos, licencas] = await Promise.all([
    carregarDireitos(userId),
    licencasDoUtilizador(userId),
  ])

  const incluidaAtiva = licencas.some((l) => l.plano === 'incluida' && l.estado === 'ativa')
  const temDireito = direitos.admin || direitos.vip || direitos.premium

  return NextResponse.json({
    licencas,
    direitos: {
      podeEmitir: temDireito && !incluidaAtiva,
      temDireito,
      jaEmitida: incluidaAtiva,
      motivo: direitos.admin ? 'admin' : direitos.vip ? 'vip' : direitos.premium ? 'premium' : null,
    },
    precos: { anual: PRECO_ANUAL_EUR, vitalicia: PRECO_VITALICIO_EUR },
  })
}
