import { NextRequest, NextResponse } from 'next/server'

/**
 * CRON JOB NOTURNO - Recalcular TP/SL de TODOS os ativos
 * 
 * Execução: Diariamente às 03:00 UTC (04:00 em Portugal)
 * Função: Atualizar níveis de TP/SL usando análise técnica + IA
 * Duração estimada: ~1-2 minutos para 30 ativos
 */

export async function GET(request: NextRequest) {
  // Verificar CRON_SECRET para segurança
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('❌ [CRON TP/SL] Acesso não autorizado')
    return new NextResponse('Unauthorized', { status: 401 })
  }

  console.log('🌙 [CRON TP/SL] Iniciando recálculo noturno de TP/SL...')
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`)

  try {
    // Chamar API de recálculo em massa
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://morethanmoney.pt'
    const response = await fetch(`${siteUrl}/api/admin/recalculate-tp-sl`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [CRON TP/SL] Erro na API de recálculo:', errorText)
      return NextResponse.json(
        { success: false, error: errorText },
        { status: 500 }
      )
    }

    const result = await response.json()

    console.log('✅ [CRON TP/SL] Recálculo noturno concluído!')
    console.log(`📊 Resultados:`, result.results)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result
    })
  } catch (error) {
    console.error('❌ [CRON TP/SL] Erro fatal:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}

// Método POST (backup manual)
export async function POST(request: NextRequest) {
  return GET(request)
}

