import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Função para buscar preço atual da Binance
async function getCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      { next: { revalidate: 60 } }
    )

    if (!response.ok) return null

    const data = await response.json()
    return parseFloat(data.price)
  } catch (error) {
    console.error(`Erro ao buscar preço ${symbol}:`, error)
    return null
  }
}

// Função para enviar notificação (email + push notification)
async function sendNotification(userId: string, alert: any, currentPrice: number) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        }
    )
    
    // Buscar dados do usuário
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name, is_active')
      .eq('id', userId)
      .single()

    if (!profile || !profile.is_active) {
      console.warn(`⚠️ [ALERTS] Usuário ${userId} não encontrado ou inativo`)
      return false
    }

    const title = generateNotificationTitle(alert, currentPrice)
    const message = generateNotificationMessage(alert, currentPrice)
    
    console.log(`📧 [ALERTS] Enviando notificação para ${profile.email}: ${title}`)
    
    // 1. Salvar no histórico de notificações
    try {
      await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          type: 'price_alert',
          title,
          message,
          read: false,
          data: {
            symbol: alert.symbol,
            alert_type: alert.alert_type,
            current_price: currentPrice,
            target_value: alert.target_value
          }
        })
      console.log(`✅ [ALERTS] Notificação salva no histórico para ${userId}`)
    } catch (error) {
      console.error(`❌ [ALERTS] Erro ao salvar no histórico:`, error)
    }

    // 2. Enviar Push Notification
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt'
      const pushResponse = await fetch(`${siteUrl}/api/notifications/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          title,
          body: message,
          data: {
            type: 'price_alert',
            symbol: alert.symbol,
            alert_type: alert.alert_type,
            current_price: currentPrice.toString(),
            target_value: alert.target_value.toString(),
            url: '/app-mobile'
          }
        })
      })

      if (pushResponse.ok) {
        console.log(`✅ [ALERTS] Push notification enviada para ${userId}`)
      } else {
        console.warn(`⚠️ [ALERTS] Falha ao enviar push para ${userId}`)
      }
    } catch (error) {
      console.error(`❌ [ALERTS] Erro ao enviar push:`, error)
    }

    // 3. Enviar Email (opcional, se configurado)
    // TODO: Integrar com sistema de email marketing se necessário

    return true
  } catch (error) {
    console.error('❌ [ALERTS] Erro ao enviar notificação:', error)
    return false
  }
}

function generateNotificationTitle(alert: any, currentPrice: number): string {
  const { symbol, alert_type } = alert
  
  switch (alert_type) {
    case 'take_profit':
      return `🎯 Take Profit: ${symbol}`
    case 'stop_loss':
      return `⚠️ Stop Loss: ${symbol}`
    case 'dca_opportunity':
      return `💰 Oportunidade DCA: ${symbol}`
    case 'price_above':
      return `🚀 ${symbol} acima do alvo!`
    case 'price_below':
      return `📉 ${symbol} abaixo do alvo!`
    default:
      return `📊 Alerta: ${symbol}`
  }
}

function generateNotificationMessage(alert: any, currentPrice: number): string {
  const { symbol, alert_type, target_value } = alert
  
  switch (alert_type) {
    case 'price_above':
      return `🚀 ${symbol} atingiu $${currentPrice.toFixed(4)}! Acima do alerta de $${target_value.toFixed(4)}`
    case 'price_below':
      return `📉 ${symbol} caiu para $${currentPrice.toFixed(4)}! Abaixo do alerta de $${target_value.toFixed(4)}`
    case 'take_profit':
      return `🎯 ${symbol} atingiu Take Profit! Preço: $${currentPrice.toFixed(4)} (Target: $${target_value.toFixed(4)})`
    case 'stop_loss':
      return `⚠️ ${symbol} atingiu Stop Loss! Preço: $${currentPrice.toFixed(4)} (SL: $${target_value.toFixed(4)})`
    case 'dca_opportunity':
      return `💰 Oportunidade DCA! ${symbol} com ${target_value.toFixed(1)}% de desconto. Momento ideal para reforçar!`
    default:
      return `${symbol}: Preço atual $${currentPrice.toFixed(4)}`
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verificar se é chamada de cron (opcional auth)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Permite sem auth em desenvolvimento, mas loga aviso
      console.warn('⚠️ [CHECK ALERTS] Sem auth header, continuando...')
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        }
    )

    console.log('🔍 [CHECK ALERTS] Verificando alertas ativos...')

    // Buscar todos os alertas ativos
    const { data: alerts, error } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('is_active', true)
      .is('triggered_at', null)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('❌ [CHECK ALERTS] Erro ao buscar alertas:', error)
      
      // Se tabela não existe, retornar sucesso vazio
      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
        return NextResponse.json({
          success: true,
          checked: 0,
          triggered: 0,
          alerts: [],
          message: 'Tabela price_alerts não existe. Execute o SQL de setup.'
        })
      }
      
      return NextResponse.json({ 
        success: false,
        error: 'Erro ao buscar alertas',
        details: error.message 
      }, { status: 500 })
    }

    if (!alerts || alerts.length === 0) {
      console.log('✅ [CHECK ALERTS] Nenhum alerta ativo encontrado')
      return NextResponse.json({
        success: true,
        checked: 0,
        triggered: 0,
        alerts: []
      })
    }

    console.log(`🔍 [CHECK ALERTS] Verificando ${alerts.length} alertas ativos...`)

    const triggeredAlerts = []
    let checkedCount = 0

    // Verificar cada alerta
    for (const alert of alerts) {
      try {
        checkedCount++
        const currentPrice = await getCurrentPrice(alert.symbol)
        
        if (!currentPrice) {
          console.warn(`⚠️ [CHECK ALERTS] Preço não encontrado para ${alert.symbol}`)
          continue
        }

        let shouldTrigger = false
        const priceDiff = currentPrice - alert.target_value
        const percentDiff = ((priceDiff / alert.target_value) * 100)

        // Verificar condição do alerta
        switch (alert.alert_type) {
          case 'price_above':
            shouldTrigger = currentPrice >= alert.target_value
            break
          case 'price_below':
            shouldTrigger = currentPrice <= alert.target_value
            break
          case 'stop_loss':
            shouldTrigger = currentPrice <= alert.target_value
            break
          case 'take_profit':
            shouldTrigger = currentPrice >= alert.target_value
            break
          case 'dca_opportunity':
            // Verificar se preço atual está abaixo do target (desconto)
            // target_value = preço ideal de entrada
            shouldTrigger = currentPrice <= alert.target_value && percentDiff <= -5
            break
        }

        if (shouldTrigger) {
          console.log(`🎯 [CHECK ALERTS] Alerta disparado: ${alert.symbol} (${alert.alert_type}) - Preço: $${currentPrice} | Target: $${alert.target_value}`)
          
          // Enviar notificação (push + email + histórico)
          const sent = await sendNotification(alert.user_id, alert, currentPrice)
          
          if (sent) {
            // Marcar alerta como disparado
            await supabase
              .from('price_alerts')
              .update({ 
                triggered_at: new Date().toISOString(),
                is_active: false,
                updated_at: new Date().toISOString()
              })
              .eq('id', alert.id)

            triggeredAlerts.push({
              ...alert,
              current_price: currentPrice,
              price_diff_percent: percentDiff.toFixed(2)
            })

            console.log(`✅ [CHECK ALERTS] Alerta ${alert.id} marcado como disparado`)
          } else {
            console.error(`❌ [CHECK ALERTS] Falha ao enviar notificação para alerta ${alert.id}`)
          }
        } else {
          // Log de debug (apenas se muito próximo)
          if (Math.abs(percentDiff) < 2) {
            console.log(`📊 [CHECK ALERTS] ${alert.symbol} próximo do alvo: $${currentPrice} (Target: $${alert.target_value}, ${percentDiff.toFixed(1)}%)`)
          }
        }
      } catch (alertError) {
        console.error(`❌ [CHECK ALERTS] Erro ao processar alerta ${alert.id}:`, alertError)
      }
    }

    console.log(`✅ [CHECK ALERTS] Verificação completa: ${checkedCount} verificados, ${triggeredAlerts.length} disparados`)

    return NextResponse.json({
      success: true,
      checked: checkedCount,
      triggered: triggeredAlerts.length,
      alerts: triggeredAlerts,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Erro na API de verificação de alertas:', error)
    return NextResponse.json({
      error: 'Erro ao verificar alertas',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 })
  }
}

