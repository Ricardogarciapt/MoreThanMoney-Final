import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isCategoryEnabled, normalizeNotificationPreferences } from '@/lib/notification-preferences'

/**
 * API CRON JOB: Criar post automático diário com oportunidades DCA
 * 
 * Executado diariamente às 09:00 UTC
 * 
 * Funcionalidades:
 * 1. Analisa oportunidades DCA via /api/portfolio/dca-smart
 * 2. Filtra apenas "Forte Compra" e "Compra" (desconto ≥10%)
 * 3. Publica análise no canal #Cripto (chat_messages)
 * 4. Envia notificação push para todos os membros
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveSystemUserId(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<string> {
  const { data: bot } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', 'sistema@morethanmoney.pt')
    .maybeSingle()
  if (bot?.id) return bot.id

  const { data: admin } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (admin?.id) return admin.id

  throw new Error('Nenhum utilizador sistema/admin encontrado para criar post DCA')
}

export async function GET(request: NextRequest) {
  try {
    if (!isCronAuthorized(request)) {
      console.log('❌ [CRON DCA POST] Não autorizado')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🤖 [CRON DCA POST] Iniciando análise diária...')

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt').trim()

    // Buscar oportunidades DCA
    const dcaResponse = await fetch(`${siteUrl}/api/portfolio/dca-smart?type=crypto`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!dcaResponse.ok) {
      throw new Error('Erro ao buscar oportunidades DCA')
    }

    const dcaData = await dcaResponse.json()

    if (!dcaData.success) {
      throw new Error('DCA API retornou erro')
    }

    console.log(`📊 [CRON DCA POST] ${dcaData.data.opportunities.length} oportunidades encontradas`)

    // Filtrar apenas Forte Compra e Compra
    const goodOpportunities = dcaData.data.opportunities.filter(
      (opp: any) => opp.recommendation === 'Forte Compra' || opp.recommendation === 'Compra'
    )

    console.log(`✅ [CRON DCA POST] ${goodOpportunities.length} boas oportunidades (Forte Compra ou Compra)`)

    if (goodOpportunities.length === 0) {
      console.log('⚠️ [CRON DCA POST] Nenhuma boa oportunidade hoje, post não criado')
      return NextResponse.json({
        success: true,
        message: 'Nenhuma oportunidade para post hoje',
        opportunities: 0
      })
    }

    // Criar conteúdo do post
    const strongBuys = goodOpportunities.filter((o: any) => o.recommendation === 'Forte Compra')
    const buys = goodOpportunities.filter((o: any) => o.recommendation === 'Compra')

    let postContent = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🤖 ANÁLISE DCA INTELIGENTE  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

📅 ${new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

💡 **Esta Ideia de possível DCA foi fornecida pelo nosso serviço de IA para que tenhas as melhores análises para a tua aprendizagem.**\n\n`

    if (strongBuys.length > 0) {
      postContent += `┏━━━━━━━━━━━━━━━━━━━━━┓\n`
      postContent += `┃ 🚀 FORTE COMPRA (${strongBuys.length}) ┃\n`
      postContent += `┗━━━━━━━━━━━━━━━━━━━━━┛\n\n`
      strongBuys.slice(0, 5).forEach((opp: any, idx: number) => {
        postContent += `${idx + 1}. **${opp.name}** (${opp.symbol})\n`
        postContent += `   💰 Preço: $${opp.current_price.toFixed(4)}\n`
        postContent += `   📉 Desconto: **${opp.discount_percent.toFixed(1)}%**\n`
        postContent += `   💎 Reforço: **${opp.suggested_amount.toFixed(0)}€**\n`
        postContent += `   🎯 Target: $${opp.take_profits[1].toFixed(4)}\n`
        postContent += `   🛑 SL: $${opp.stop_loss.toFixed(4)}\n\n`
      })
    }

    if (buys.length > 0) {
      postContent += `┏━━━━━━━━━━━━━━━━━━┓\n`
      postContent += `┃ ⚡ COMPRA (${buys.length})    ┃\n`
      postContent += `┗━━━━━━━━━━━━━━━━━━┛\n\n`
      buys.slice(0, 3).forEach((opp: any, idx: number) => {
        postContent += `${idx + 1}. **${opp.name}** (${opp.symbol})\n`
        postContent += `   💰 Preço: $${opp.current_price.toFixed(4)}\n`
        postContent += `   📉 Desconto: **${opp.discount_percent.toFixed(1)}%**\n`
        postContent += `   💎 Reforço: **${opp.suggested_amount.toFixed(0)}€**\n\n`
      })
    }

    const totalInvestment = goodOpportunities.reduce((sum: number, o: any) => sum + o.suggested_amount, 0)
    const avgDiscount = goodOpportunities.reduce((sum: number, o: any) => sum + o.discount_percent, 0) / goodOpportunities.length

    postContent += `┏━━━━━━━━━━━━━━━━━━━━━━┓\n`
    postContent += `┃ 📊 RESUMO EXECUTIVO  ┃\n`
    postContent += `┗━━━━━━━━━━━━━━━━━━━━━━┛\n\n`
    postContent += `💰 **Capital Recomendado:** ${totalInvestment.toFixed(0)}€\n`
    postContent += `📉 **Desconto Médio:** ${avgDiscount.toFixed(1)}%\n`
    postContent += `🎯 **Oportunidades:** ${goodOpportunities.length} ativos\n\n`
    postContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    postContent += `⚡ **Estratégia DCA MoreThanMoney**\n`
    postContent += `🌟 Together We Go Further\n`
    postContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`
    postContent += `📱 Vê o portfólio completo em /portfolios`

    const DCA_CHANNEL_SLUG = 'cripto'

    const supabase = getSupabaseAdmin()
    const systemUserId = await resolveSystemUserId(supabase)

    const { data: newMessage, error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        channel_slug: DCA_CHANNEL_SLUG,
        user_id: systemUserId,
        content: postContent,
        image_url: null,
        link_url: null,
        link_preview: null,
        message_type: 'text',
        reply_to_id: null,
      })
      .select('id, channel_slug, created_at')
      .single()

    if (messageError) {
      console.error('❌ [CRON DCA POST] Erro ao publicar no canal Cripto:', messageError)
      throw new Error(messageError.message || 'Erro ao publicar no canal Cripto')
    }

    console.log(`✅ [CRON DCA POST] Mensagem publicada em #${DCA_CHANNEL_SLUG}!`)

    // Enviar notificação push para todos os membros
    const { data: allUsers } = await supabase
      .from('profiles')
      .select('id, notification_preferences, is_active')
      .eq('is_active', true)

    const dcaRecipients = (allUsers ?? []).filter((user) =>
      isCategoryEnabled(normalizeNotificationPreferences(user.notification_preferences), 'dca'),
    )

    if (dcaRecipients.length > 0) {
      const notificationTitle = `₿ ${goodOpportunities.length} Oportunidades DCA em #Cripto`
      const notificationBody = strongBuys.length > 0
        ? `💎 ${strongBuys.length} FORTE COMPRA — abre o canal Cripto para ver a análise.`
        : `🔵 ${buys.length} ativos em boa posição de compra no canal Cripto.`

      // Criar notificações para cada usuário
      const notifications = dcaRecipients.map(user => ({
        user_id: user.id,
        type: 'dca_daily',
        title: notificationTitle,
        message: notificationBody,
        data: {
          opportunities: goodOpportunities.length,
          strong_buys: strongBuys.length,
          channel: DCA_CHANNEL_SLUG,
          url: '/app-mobile?tab=chat',
          total_investment: goodOpportunities.reduce((sum: number, o: any) => sum + o.suggested_amount, 0)
        }
      }))

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications)

      if (notifError) {
        console.error('❌ [CRON DCA POST] Erro ao criar notificações:', notifError)
      } else {
        console.log(`✅ [CRON DCA POST] ${dcaRecipients.length} notificações criadas`)
      }

      // Enviar push notification
      try {
        await fetch(`${siteUrl}/api/notifications/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            all: true,
            skipInApp: true,
            title: notificationTitle,
            body: notificationBody,
            data: {
              type: 'dca_daily',
              url: '/app-mobile?tab=chat',
              channel: DCA_CHANNEL_SLUG,
              opportunities: String(goodOpportunities.length),
            }
          })
        })
        console.log('✅ [CRON DCA POST] Push notifications enviadas')
      } catch (pushError) {
        console.error('❌ [CRON DCA POST] Erro ao enviar push:', pushError)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Análise DCA publicada no canal Cripto e notificações enviadas',
      message_id: newMessage.id,
      channel: DCA_CHANNEL_SLUG,
      opportunities: goodOpportunities.length,
      strong_buys: strongBuys.length,
      total_users_notified: allUsers?.length || 0
    })

  } catch (error) {
    console.error('❌ [CRON DCA POST] Erro:', error)
    const details =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error)
    return NextResponse.json({
      error: 'Erro ao processar DCA diário',
      details: details || 'Erro desconhecido'
    }, { status: 500 })
  }
}

