import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isCronAuthorized } from '@/lib/cron-auth'

const supabase = getSupabaseAdmin()

// Preço atual da Binance
async function getCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      { next: { revalidate: 0 } }
    )
    if (!response.ok) return null
    const data = await response.json()
    return parseFloat(data.price)
  } catch (error) {
    console.error(`Erro ao buscar preço ${symbol}:`, error)
    return null
  }
}

// Enviar notificação in-app + push
async function sendNotification(userId: string, alert: any, currentPrice: number) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name, is_active')
      .eq('id', userId)
      .single()

    if (!profile || !profile.is_active) {
      console.warn(`⚠️ [ALERTS] Utilizador ${userId} não encontrado ou inativo`)
      return false
    }

    const title = generateNotificationTitle(alert, currentPrice)
    const message = generateNotificationMessage(alert, currentPrice)

    // 1. Guardar no histórico in-app
    const { error: notifError } = await supabase
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
          target_value: alert.target_value,
          url: '/portfolios',
        },
      })

    if (notifError) {
      console.error(`❌ [ALERTS] Erro ao guardar notificação:`, notifError)
    }

    // 2. Enviar push
    try {
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt').trim()
      const pushResponse = await fetch(`${siteUrl}/api/notifications/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          skipInApp: true,
          title,
          body: message,
          data: {
            type: 'price_alert',
            symbol: alert.symbol,
            alert_type: alert.alert_type,
            current_price: currentPrice.toString(),
            target_value: alert.target_value.toString(),
            url: '/portfolios',
          },
        }),
      })

      if (!pushResponse.ok) {
        console.warn(`⚠️ [ALERTS] Falha ao enviar push para ${userId}`)
      }
    } catch (pushErr) {
      console.error(`❌ [ALERTS] Erro ao enviar push:`, pushErr)
    }

    return true
  } catch (error) {
    console.error('❌ [ALERTS] Erro ao enviar notificação:', error)
    return false
  }
}

function generateNotificationTitle(alert: any, currentPrice: number): string {
  switch (alert.alert_type) {
    case 'take_profit':
      return `🎯 Take Profit: ${alert.symbol}`
    case 'stop_loss':
      return `⚠️ Stop Loss: ${alert.symbol}`
    case 'dca_opportunity':
      return `💰 Oportunidade DCA: ${alert.symbol}`
    case 'price_above':
      return `🚀 ${alert.symbol} acima do alvo!`
    case 'price_below':
      return `📉 ${alert.symbol} abaixo do alvo!`
    default:
      return `📊 Alerta: ${alert.symbol}`
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
      return `💰 Oportunidade DCA! ${symbol} com ${(((currentPrice - target_value) / target_value) * 100).toFixed(1)}% de desconto. Momento ideal para reforçar!`
    default:
      return `${symbol}: Preço atual $${currentPrice.toFixed(4)}`
  }
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('🔍 [CHECK ALERTS] Verificando alertas ativos...')

    const { data: alerts, error } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('is_active', true)
      .is('triggered_at', null)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('❌ [CHECK ALERTS] Erro ao buscar alertas:', error)

      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
        return NextResponse.json({
          success: true,
          checked: 0,
          triggered: 0,
          alerts: [],
          message: 'Tabela price_alerts não existe. Execute o SQL de setup.',
        })
      }

      return NextResponse.json(
        { success: false, error: 'Erro ao buscar alertas', details: error.message },
        { status: 500 }
      )
    }

    if (!alerts || alerts.length === 0) {
      return NextResponse.json({ success: true, checked: 0, triggered: 0, alerts: [] })
    }

    console.log(`🔍 [CHECK ALERTS] Verificando ${alerts.length} alertas ativos...`)

    const triggeredAlerts: any[] = []
    let checkedCount = 0

    for (const alert of alerts) {
      try {
        checkedCount++
        const currentPrice = await getCurrentPrice(alert.symbol)

        if (!currentPrice) {
          console.warn(`⚠️ [CHECK ALERTS] Preço não encontrado para ${alert.symbol}`)
          continue
        }

        let shouldTrigger = false
        const percentDiff = ((currentPrice - alert.target_value) / alert.target_value) * 100

        switch (alert.alert_type) {
          case 'price_above':
          case 'take_profit':
            shouldTrigger = currentPrice >= alert.target_value
            break
          case 'price_below':
          case 'stop_loss':
            shouldTrigger = currentPrice <= alert.target_value
            break
          case 'dca_opportunity':
            shouldTrigger = currentPrice <= alert.target_value && percentDiff <= -5
            break
        }

        if (shouldTrigger) {
          console.log(
            `🎯 [CHECK ALERTS] Alerta disparado: ${alert.symbol} (${alert.alert_type}) — Preço: $${currentPrice} | Target: $${alert.target_value}`
          )

          const sent = await sendNotification(alert.user_id, alert, currentPrice)

          if (sent) {
            await supabase
              .from('price_alerts')
              .update({
                triggered_at: new Date().toISOString(),
                is_active: false,
                updated_at: new Date().toISOString(),
              })
              .eq('id', alert.id)

            triggeredAlerts.push({ ...alert, current_price: currentPrice, price_diff_percent: percentDiff.toFixed(2) })
          }
        } else if (Math.abs(percentDiff) < 2) {
          console.log(
            `📊 [CHECK ALERTS] ${alert.symbol} próximo do alvo: $${currentPrice} (Target: $${alert.target_value}, ${percentDiff.toFixed(1)}%)`
          )
        }
      } catch (alertError) {
        console.error(`❌ [CHECK ALERTS] Erro ao processar alerta ${alert.id}:`, alertError)
      }
    }

    console.log(
      `✅ [CHECK ALERTS] Verificação completa: ${checkedCount} verificados, ${triggeredAlerts.length} disparados`
    )

    return NextResponse.json({
      success: true,
      checked: checkedCount,
      triggered: triggeredAlerts.length,
      alerts: triggeredAlerts,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('❌ [CHECK ALERTS] Erro:', error)
    return NextResponse.json(
      { error: 'Erro ao verificar alertas', details: error instanceof Error ? error.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
