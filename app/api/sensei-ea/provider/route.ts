import { NextResponse } from 'next/server'
import { lerMetricasProviderSensei, minimoDiasConfigurado } from '@/lib/sensei-provider-metricas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * As métricas da conta provider do Sensei, por instrumento.
 *
 * Enquanto a amostra for curta demais, esta rota NÃO devolve os números — devolve só quantos dias
 * já tem e quantos faltam. A guarda está aqui e não no ecrã de propósito: a rota é pública, e
 * esconder apenas no componente deixava um acerto de 91% sobre cinco dias à distância de abrir o
 * endereço da API.
 *
 * Cache de 30 minutos: a leitura vai ao broker e a conta não fecha trades ao minuto. Se a leitura
 * falhar não se devolve zero — devolve-se 503, e a página esconde a secção em vez de mostrar uma
 * tabela vazia que se leria como "não negociou nada".
 */
export async function GET() {
  try {
    const [m, minimoDias] = await Promise.all([
      lerMetricasProviderSensei(),
      minimoDiasConfigurado(),
    ])
    if (!m) return NextResponse.json({ erro: 'sem dados' }, { status: 503 })

    if (m.dias < minimoDias) {
      return NextResponse.json(
        {
          amostraSuficiente: false,
          dias: m.dias,
          minimoDias,
          faltamDias: minimoDias - m.dias,
        },
        { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400' } },
      )
    }

    return NextResponse.json(
      { amostraSuficiente: true, ...m },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400' } },
    )
  } catch (e) {
    console.error('[SENSEI] Erro a ler as métricas do provider:', e)
    return NextResponse.json({ erro: 'falhou' }, { status: 503 })
  }
}
