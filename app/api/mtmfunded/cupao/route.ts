import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { validarCupao } from '@/lib/mtmfunded/cupao'
import { getMtmFundedConfig } from '@/lib/mtmfunded/config'
import { precoDaPlataforma, validarPlataformaDoPrograma, COLUNAS_PRECOS } from '@/lib/mtmfunded/precos'

export const dynamic = 'force-dynamic'

/**
 * Verifica um cupão contra um programa, e diz quanto fica.
 *
 * O preço vem da BASE DE DADOS, não do pedido: pedir ao browser o preço a descontar era
 * deixar qualquer pessoa dizer que o desafio custa um cêntimo.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const slug = String(body?.programa ?? '').trim()
  const codigo = String(body?.codigo ?? '').trim()
  if (!slug) return NextResponse.json({ error: 'programa em falta' }, { status: 400 })

  const { data: programa } = await getSupabaseAdmin()
    .from('mtm_funded_programs')
    .select(`ativo, regras, ${COLUNAS_PRECOS}`)
    .eq('slug', slug)
    .maybeSingle()
  if (!programa?.ativo) return NextResponse.json({ error: 'Programa não encontrado' }, { status: 404 })

  // As regras seguem com o pedido: um programa que já É uma promoção não aceita outra por
  // cima, e isso tem de ser dito aqui — senão o formulário mostrava um desconto que o
  // checkout depois recusava, que é a pior ordem possível para a pessoa descobrir.
  // O desconto é sobre o preço DA PLATAFORMA escolhida: a MTM Funded é mais barata do que o MT5,
  // e descontar sobre o preço errado mostrava um total que o checkout depois recusava.
  const escolha = validarPlataformaDoPrograma(body?.plataforma, await getMtmFundedConfig(), programa)
  if (!escolha.ok) return NextResponse.json({ error: escolha.erro }, { status: 409 })
  const preco = precoDaPlataforma(programa, escolha.plataforma)

  const r = await validarCupao(
    codigo,
    preco.cents,
    (programa.regras ?? {}) as Record<string, unknown>,
  )
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 })

  return NextResponse.json({
    ok: true,
    codigo: r.codigo,
    descontoPct: r.descontoPct,
    plataforma: escolha.plataforma,
    centsOriginais: preco.cents,
    centsFinais: r.centsFinais,
  })
}
