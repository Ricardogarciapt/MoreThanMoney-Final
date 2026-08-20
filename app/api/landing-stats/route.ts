import { NextResponse } from 'next/server'
import { getLandingStats } from '@/lib/landing-stats'

/**
 * Leitura PÚBLICA dos números da landing. As páginas estáticas buscam aqui para mostrarem sempre o
 * valor da última execução do cron semanal, em vez do valor que estava em código quando fizeram build.
 *
 * Só contagens — nunca valores em euros, nunca dados de utilizador.
 */
export const runtime = 'nodejs'
export const revalidate = 3600

export async function GET() {
  const stats = await getLandingStats()
  return NextResponse.json(stats, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
