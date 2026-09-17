import { NextResponse } from 'next/server'
import { getLandingStats } from '@/lib/landing-stats'

/**
 * Leitura PÚBLICA dos números da landing. As páginas estáticas buscam aqui para mostrarem sempre o
 * valor da última execução do cron semanal, em vez do valor que estava em código quando fizeram build.
 *
 * Só contagens — nunca valores em euros, nunca dados de utilizador.
 */
export const runtime = 'nodejs'
// Pedida em cada visita e servida pela cache do CDN (cabeçalho abaixo). Deixou de ser gerada no
// build a 17/09: uma leitura lenta do Supabase nesse momento fazia falhar o deploy inteiro
// («took more than 60 seconds»), por uma rota que só devolve contagens.
export const dynamic = 'force-dynamic'

export async function GET() {
  const stats = await getLandingStats()
  return NextResponse.json(stats, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
