import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isCronAuthorized } from '@/lib/cron-auth'

const supabase = getSupabaseAdmin()

// Função para enviar push notification
async function sendPushNotification(userId: string, title: string, body: string, data: any) {
  try {
    // Buscar FCM token do usuário
    const { data: tokens } = await supabase
      .from('fcm_tokens')
      .select('token')
      .eq('user_id', userId)

    if (!tokens || tokens.length === 0) {
      console.log(`⚠️ [DCA CRON] Usuário ${userId} sem FCM token`)
      return false
    }

    // Enviar notificação via API interna
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notifications/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        title,
        body,
        data
      })
    })

    return response.ok
  } catch (error) {
    console.error(`❌ [DCA CRON] Erro ao enviar push para ${userId}:`, error)
    return false
  }
}

// Rota principal - Executada pelo Vercel Cron diariamente
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 [DCA CRON] Iniciando análise DCA diária...')

    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Buscar oportunidades DCA
    console.log('📊 [DCA CRON] Buscando oportunidades DCA...')
    
    const dcaResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/portfolio/dca-smart?type=crypto`, {
      next: { revalidate: 0 } // Sem cache
    })

    if (!dcaResponse.ok) {
      throw new Error(`DCA API retornou ${dcaResponse.status}`)
    }

    const dcaData = await dcaResponse.json()
    
    if (!dcaData.success) {
      throw new Error('DCA API retornou success: false')
    }

    const strongBuys = dcaData.data.categorized?.strong_buys || []
    const buys = dcaData.data.categorized?.buys || []
    const totalOpportunities = strongBuys.length + buys.length

    console.log(`🚀 [DCA CRON] Encontradas ${strongBuys.length} Forte Compra e ${buys.length} Compra`)

    // 2. Buscar todos os usuários ativos (VIP + Admin + Membros)
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, full_name, email, user_type, member_category')
      .eq('is_active', true) // Apenas usuários ativos

    if (usersError || !users) {
      throw new Error('Erro ao buscar usuários')
    }

    console.log(`👥 [DCA CRON] Encontrados ${users.length} usuários ativos`)

    // 3. Criar notificações para todos os usuários
    let notificationsSent = 0
    let notificationsFailed = 0

    for (const user of users) {
      try {
        // Título e corpo da notificação
        let title = '🚀 Oportunidades DCA Disponíveis!'
        let body = ''

        if (strongBuys.length > 0) {
          const topOpportunity = strongBuys[0]
          title = `🚀 ${strongBuys.length} Forte${strongBuys.length > 1 ? 's' : ''} Compra Detectada${strongBuys.length > 1 ? 's' : ''}!`
          body = `${topOpportunity.name}: ${topOpportunity.discount_percent.toFixed(1)}% desconto. ${strongBuys.length > 1 ? `+${strongBuys.length - 1} outras oportunidades.` : ''}`
        } else if (buys.length > 0) {
          const topBuy = buys[0]
          title = `💰 ${buys.length} Oportunidade${buys.length > 1 ? 's' : ''} de Compra`
          body = `${topBuy.name}: ${topBuy.discount_percent.toFixed(1)}% desconto.`
        } else {
          title = '📊 Análise DCA Diária'
          body = 'Sem oportunidades de desconto hoje. Mercado estável.'
        }

        // Dados adicionais
        const notificationData = {
          type: 'dca_opportunity',
          strong_buys_count: strongBuys.length,
          buys_count: buys.length,
          url: '/portfolios',
          timestamp: new Date().toISOString()
        }

        // Enviar push notification
        const sent = await sendPushNotification(user.id, title, body, notificationData)
        
        if (sent) {
          notificationsSent++
          console.log(`✅ [DCA CRON] Notificação enviada para ${user.email}`)
        } else {
          notificationsFailed++
        }

        // Salvar no histórico de notificações
        await supabase
          .from('notifications')
          .insert({
            user_id: user.id,
            type: 'dca_opportunity',
            title,
            message: body,
            data: notificationData,
            read: false
          })

      } catch (error) {
        console.error(`❌ [DCA CRON] Erro ao notificar ${user.email}:`, error)
        notificationsFailed++
      }

      // Pequeno delay entre notificações (evitar rate limit)
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // 4. Resposta
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      analysis: {
        strong_buys: strongBuys.length,
        buys: buys.length,
        total_opportunities: totalOpportunities,
        top_opportunity: strongBuys[0] || buys[0] || null
      },
      notifications: {
        users_total: users.length,
        sent: notificationsSent,
        failed: notificationsFailed,
        success_rate: ((notificationsSent / users.length) * 100).toFixed(1) + '%'
      }
    }

    console.log('✅ [DCA CRON] Análise DCA diária concluída:', result)

    return NextResponse.json(result)
  } catch (error) {
    console.error('❌ [DCA CRON] Erro:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

