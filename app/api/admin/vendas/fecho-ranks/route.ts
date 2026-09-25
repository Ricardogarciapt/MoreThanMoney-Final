/**
 * O fecho mensal da escada de ranks, à mão do admin.
 *
 * SIMULA POR DEFEITO. Um GET (ou um POST sem `simulacao: false`) devolve o que PAGARIA, com o volume
 * do mês, a percentagem que isso representa e a conta de cada linha em palavras. Escrever exige
 * pedir explicitamente — e mesmo escrito, o que nasce são comissões 'pending': quem paga é um
 * humano, no livro.
 *
 * Correr duas vezes é seguro: uma pessoa não recebe dois residuais do mesmo mês nem dois bónus do
 * mesmo rank.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { centimosEmEuros } from '@/lib/vendas/calculo'
import { fecharEscadaDeRanks } from '@/lib/vendas/fecho-ranks'

const supabase = getSupabaseAdmin()

async function correr(mes: string | null, simulacao: boolean) {
  const fecho = await fecharEscadaDeRanks(supabase, { mes, simulacao })
  return NextResponse.json({
    ...fecho,
    total: centimosEmEuros(fecho.totalCents),
    volumeTotal: centimosEmEuros(fecho.volumeTotalCents),
    linhas: fecho.linhas.map((l) => ({ ...l, valor: centimosEmEuros(l.valor_cents), base: centimosEmEuros(l.base_cents) })),
  })
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  try {
    return await correr(new URL(request.url).searchParams.get('mes'), true)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro no fecho' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  try {
    return await correr(body.mes ?? null, body.simulacao !== false)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro no fecho' }, { status: 500 })
  }
}
