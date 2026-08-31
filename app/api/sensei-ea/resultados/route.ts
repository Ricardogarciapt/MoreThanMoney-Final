import { NextResponse } from 'next/server'
import { lerResultadosSensei } from '@/lib/sensei-resultados'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * O registo dos sinais Sensei para a página de vendas.
 *
 * Público — é a prova, não faria sentido escondê-la. Cache de uma hora na borda: os sinais não
 * mudam ao minuto e a leitura percorre alguns milhares de linhas.
 */
export async function GET() {
  const r = await lerResultadosSensei()
  if (!r) return NextResponse.json({ erro: 'sem dados' }, { status: 503 })
  return NextResponse.json(r, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
