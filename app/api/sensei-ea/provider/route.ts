import { NextResponse } from 'next/server'
import { lerMetricasProviderSensei } from '@/lib/sensei-provider-metricas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * As métricas da conta provider do Sensei, por instrumento.
 *
 * Cache de 30 minutos: a leitura vai ao broker e a conta não fecha trades ao minuto. Se a leitura
 * falhar não se devolve zero — devolve-se 503, e a página esconde a secção em vez de mostrar uma
 * tabela vazia que se leria como "não negociou nada".
 */
export async function GET() {
  try {
    const m = await lerMetricasProviderSensei()
    if (!m) return NextResponse.json({ erro: 'sem dados' }, { status: 503 })
    return NextResponse.json(m, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400' },
    })
  } catch (e) {
    console.error('[SENSEI] Erro a ler as métricas do provider:', e)
    return NextResponse.json({ erro: 'falhou' }, { status: 503 })
  }
}
