import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/admin-api-helpers'
import { carregarDireitos } from '@/lib/entitlements'
import {
  licencasDoUtilizador,
  PRODUTO_EA,
  PRODUTOS,
  produtoDe,
  PRECO_ANUAL_EUR,
  PRECO_VITALICIO_EUR,
} from '@/lib/licencas'

export const dynamic = 'force-dynamic'

/**
 * As licenças deste utilizador (de TODAS as EAs) e se tem direito a emitir a Sensei EA incluída.
 *
 * Só sai o que o membro precisa de ver: notas internas e ids do Stripe ficam no servidor.
 */
export async function GET() {
  const { userId, error } = await getAuthenticatedUser()
  if (!userId) return NextResponse.json({ error: error || 'Não autenticado' }, { status: 401 })

  const [direitos, todas] = await Promise.all([
    carregarDireitos(userId),
    licencasDoUtilizador(userId, 'todos'),
  ])

  const licencas = todas.map((l) => {
    const produto = produtoDe(l.produto)
    return {
      id: l.id,
      chave: l.chave,
      produto,
      produtoNome: PRODUTOS[produto].nome,
      plano: l.plano,
      estado: l.estado,
      mt5_login: l.mt5_login,
      contas_permitidas: l.contas_permitidas,
      expira_em: l.expira_em,
      criada_em: l.criada_em,
    }
  })

  const incluidaAtiva = licencas.some(
    (l) => l.produto === PRODUTO_EA && l.plano === 'incluida' && l.estado === 'ativa',
  )
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
