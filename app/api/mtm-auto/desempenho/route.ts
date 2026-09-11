import { NextRequest, NextResponse } from 'next/server'
import { desempenhoDeTodas, desempenhoDaEstrategia } from '@/lib/mtmauto/desempenho-estrategia'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
export const revalidate = 0

/**
 * O desempenho das estratégias para CLIENTES — app MTM Auto, MTM System e site.
 *
 * A mesma função do painel de admin, sem `admin: true`. A diferença não é cosmética: sem essa
 * bandeira os saldos NEM SÃO LIDOS, por isso não há como aparecerem no HTML nem na resposta.
 * Escondê-los no ecrã deixava-os no JSON de quem abrisse as ferramentas do browser — e a
 * equidade de uma conta mestre é informação da casa, não do cliente.
 *
 * O que o cliente vê é o que a marca defende: pips e percentagem, com a proveniência à vista.
 */
export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('estrategia')?.trim()

  if (slug) {
    const d = await desempenhoDaEstrategia(slug)
    if (!d) return NextResponse.json({ error: 'estratégia desconhecida' }, { status: 404 })
    return NextResponse.json({ estrategia: d })
  }

  const todas = await desempenhoDeTodas()
  return NextResponse.json({
    estrategias: todas.filter((e) => e.ativo),
    nota: 'Resultados em pips e percentagem. Desempenho acumulado da estratégia, com a origem de cada período indicada.',
  })
}
