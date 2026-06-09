import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * API CRON JOB: Criar post automático diário com oportunidades DCA
 * 
 * Executado diariamente às 09:00 UTC
 * 
 * Funcionalidades:
 * 1. Analisa oportunidades DCA via /api/portfolio/dca-smart
 * 2. Filtra apenas "Forte Compra" e "Compra" (desconto ≥10%)
 * 3. Cria post automático no feed social
 * 4. Envia notificação push para todos os membros
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Verificar autorização do cron
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log('❌ [CRON DCA POST] Não autorizado')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🤖 [CRON DCA POST] Iniciando análise diária...')

    // Buscar oportunidades DCA
    const dcaResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/portfolio/dca-smart?type=crypto`, {
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
    postContent += `📱 Vê os detalhes completos em /portfolios`

    // Criar post no Supabase
    const supabase = getSupabaseAdmin()

    // Buscar user_id do sistema (admin ou bot)
    const { data: adminUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', 'sistema@morethanmoney.pt')
      .single()

    const systemUserId = adminUser?.id || '00000000-0000-0000-0000-000000000000'

    const { data: newPost, error: postError } = await supabase
      .from('social_posts')
      .insert({
        user_id: systemUserId,
        content: postContent,
        image_url: null,
        video_url: null
      })
      .select()
      .single()

    if (postError) {
      console.error('❌ [CRON DCA POST] Erro ao criar post:', postError)
      throw postError
    }

    console.log('✅ [CRON DCA POST] Post criado com sucesso!')

    // Enviar notificação push para todos os membros
    const { data: allUsers } = await supabase
      .from('profiles')
      .select('id')

    if (allUsers && allUsers.length > 0) {
      const notificationTitle = `🚀 ${goodOpportunities.length} Oportunidades DCA Hoje!`
      const notificationBody = strongBuys.length > 0
        ? `💎 ${strongBuys.length} FORTE COMPRA disponível! Toca para ver detalhes.`
        : `🔵 ${buys.length} ativos em boa posição de compra.`

      // Criar notificações para cada usuário
      const notifications = allUsers.map(user => ({
        user_id: user.id,
        type: 'dca_daily',
        title: notificationTitle,
        message: notificationBody,
        data: {
          opportunities: goodOpportunities.length,
          strong_buys: strongBuys.length,
          total_investment: goodOpportunities.reduce((sum: number, o: any) => sum + o.suggested_amount, 0)
        }
      }))

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications)

      if (notifError) {
        console.error('❌ [CRON DCA POST] Erro ao criar notificações:', notifError)
      } else {
        console.log(`✅ [CRON DCA POST] ${allUsers.length} notificações criadas`)
      }

      // Enviar push notification
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notifications/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            all: true,
            title: notificationTitle,
            body: notificationBody,
            data: {
              type: 'dca_daily',
              url: '/portfolios',
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
      message: 'Post DCA criado e notificações enviadas',
      post_id: newPost.id,
      opportunities: goodOpportunities.length,
      strong_buys: strongBuys.length,
      total_users_notified: allUsers?.length || 0
    })

  } catch (error) {
    console.error('❌ [CRON DCA POST] Erro:', error)
    return NextResponse.json({
      error: 'Erro ao processar DCA diário',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 })
  }
}

