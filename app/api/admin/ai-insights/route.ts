/**
 * Fechado a 2026-08-28: esta rota corria com a service-role e SEM verificar quem chamava.
 *
 * Uma rota assim nao e "menos protegida" — nao tem protecao nenhuma. Bastava saber o endereco.
 * O `delete-user` apagava contas, o `approve-user` dava acesso, o chat do dashboard corria o
 * modelo com as ferramentas todas na nossa conta. Testado contra producao antes de fechar.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { requireAdmin } from "@/lib/admin-api-helpers"

// Get AI insights and suggestions for admin dashboard
export async function GET(request: NextRequest) {
  const guarda = await requireAdmin(request)
  if (guarda) return guarda

  try {
    const supabase = getSupabaseAdmin()
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '7days'
    
    // Calculate date range
    const now = new Date()
    const startDate = new Date()
    
    switch (range) {
      case '24hours':
        startDate.setHours(now.getHours() - 24)
        break
      case '7days':
        startDate.setDate(now.getDate() - 7)
        break
      case '30days':
        startDate.setDate(now.getDate() - 30)
        break
      case '90days':
        startDate.setDate(now.getDate() - 90)
        break
    }

    // Get AI events
    const { data: aiEvents, error: eventsError } = await supabase
      .from('ai_events')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })

    if (eventsError) {
      console.error('❌ [AI INSIGHTS] Erro ao buscar eventos:', eventsError)
    }

    // Analyze AI usage patterns
    const events = aiEvents || []
    const totalEvents = events.length
    const successfulEvents = events.filter(e => e.success).length
    const failedEvents = totalEvents - successfulEvents
    const avgResponseTime = events.length > 0
      ? Math.round(events.reduce((sum, e) => sum + (e.response_time || 0), 0) / events.length)
      : 0

    // Group by feature
    const featureUsage = events.reduce((acc, event) => {
      const feature = event.ai_feature || 'unknown'
      acc[feature] = (acc[feature] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Get most used features
    const topFeatures = Object.entries(featureUsage)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([feature, count]) => ({ feature, count }))

    // Get error patterns
    const errorPatterns = events
      .filter(e => !e.success && e.error_message)
      .reduce((acc, event) => {
        const error = event.error_message || 'Unknown error'
        acc[error] = (acc[error] || 0) + 1
        return acc
      }, {} as Record<string, number>)

    // Generate suggestions using OpenAI
    const openaiKey = process.env.OPENAI_API_KEY?.trim()
    let suggestions: string[] = []

    if (openaiKey && totalEvents > 0) {
      try {
        const prompt = `Analise os seguintes dados de uso de IA e sugira melhorias:

- Total de eventos: ${totalEvents}
- Taxa de sucesso: ${((successfulEvents / totalEvents) * 100).toFixed(1)}%
- Tempo médio de resposta: ${avgResponseTime}ms
- Features mais usadas: ${topFeatures.map(f => `${f.feature} (${f.count}x)`).join(', ')}
- Erros comuns: ${Object.keys(errorPatterns).slice(0, 3).join(', ')}

Sugira 3-5 melhorias práticas e acionáveis para otimizar o sistema de IA. Seja conciso e específico.`

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'Você é um analista especializado em otimização de sistemas de IA. Forneça sugestões práticas e acionáveis.'
              },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 300
          })
        })

        if (response.ok) {
          const data = await response.json()
          const content = data.choices[0]?.message?.content || ''
          suggestions = content.split('\n').filter((s: string) => s.trim().length > 0 && s.match(/^[-•\d]/))
        }
      } catch (error) {
        console.error('❌ [AI INSIGHTS] Erro ao gerar sugestões:', error)
      }
    }

    // Default suggestions if AI fails
    if (suggestions.length === 0) {
      suggestions = [
        failedEvents > 0 ? `Reduzir taxa de erro de ${((failedEvents / totalEvents) * 100).toFixed(1)}%` : null,
        avgResponseTime > 2000 ? `Otimizar tempo de resposta (atual: ${avgResponseTime}ms)` : null,
        topFeatures.length > 0 ? `Expandir uso de ${topFeatures[0].feature} para outras áreas` : null,
      ].filter(Boolean) as string[]
    }

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalEvents,
          successfulEvents,
          failedEvents,
          successRate: totalEvents > 0 ? ((successfulEvents / totalEvents) * 100).toFixed(1) : '0',
          avgResponseTime
        },
        topFeatures,
        errorPatterns: Object.entries(errorPatterns).slice(0, 5),
        suggestions,
        metadata: {
          range,
          generatedAt: new Date().toISOString(),
          startDate: startDate.toISOString(),
          endDate: now.toISOString()
        }
      }
    })
  } catch (error) {
    console.error('❌ [AI INSIGHTS] Erro:', error)
    return NextResponse.json(
      { success: false, error: 'Erro ao gerar insights de IA' },
      { status: 500 }
    )
  }
}




