import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import nodemailer from 'nodemailer'
import * as emailTemplates from '@/lib/email-templates'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'morethanmoneypt@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || ''
    }
  })
}

// GET: Listar todas as campanhas
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    
    let query = supabase
      .from('email_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (status) {
      query = query.eq('status', status)
    }
    
    if (type) {
      query = query.eq('type', type)
    }
    
    const { data: campaigns, error } = await query
    
    if (error) throw error
    
    return NextResponse.json({
      success: true,
      campaigns
    })
    
  } catch (error: any) {
    console.error('❌ [CAMPAIGNS] Erro ao buscar:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST: Criar nova campanha
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      subject,
      template_name,
      type = 'broadcast',
      segment = 'all',
      send_at,
      settings = {}
    } = body
    
    console.log('📧 [CAMPAIGNS] Criando campanha:', name)
    
    // Verificar se template existe
    const { data: template } = await supabase
      .from('email_templates')
      .select('*')
      .eq('name', template_name)
      .single()
    
    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Template não encontrado' },
        { status: 404 }
      )
    }
    
    // Calcular total de destinatários
    let recipientsQuery = supabase
      .from('profiles')
      .select('id, email, full_name, username', { count: 'exact' })
      .eq('active', true)
    
    if (segment === 'vip') {
      recipientsQuery = recipientsQuery.eq('user_type', 'vip')
    } else if (segment === 'members') {
      recipientsQuery = recipientsQuery.eq('user_type', 'member')
    } else if (segment === 'trial') {
      recipientsQuery = recipientsQuery.eq('user_type', 'trial')
    }
    
    const { count: totalRecipients } = await recipientsQuery
    
    // Criar campanha
    const { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .insert({
        name,
        subject,
        template_name,
        type,
        segment,
        send_at: send_at || null,
        status: send_at ? 'scheduled' : 'draft',
        total_recipients: totalRecipients || 0,
        settings,
        created_by: body.created_by // Passar do frontend após auth
      })
      .select()
      .single()
    
    if (campaignError) throw campaignError
    
    console.log('✅ [CAMPAIGNS] Campanha criada:', campaign.id)
    
    return NextResponse.json({
      success: true,
      campaign
    })
    
  } catch (error: any) {
    console.error('❌ [CAMPAIGNS] Erro ao criar:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// PATCH: Atualizar ou enviar campanha
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { campaignId, action, ...updates } = body
    
    if (action === 'send') {
      // Enviar campanha agora
      return await sendCampaign(campaignId)
    } else {
      // Atualizar campanha
      const { data: campaign, error } = await supabase
        .from('email_campaigns')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', campaignId)
        .select()
        .single()
      
      if (error) throw error
      
      return NextResponse.json({
        success: true,
        campaign
      })
    }
    
  } catch (error: any) {
    console.error('❌ [CAMPAIGNS] Erro ao atualizar:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// DELETE: Cancelar/deletar campanha
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('id')
    
    if (!campaignId) {
      return NextResponse.json(
        { success: false, error: 'Campaign ID obrigatório' },
        { status: 400 }
      )
    }
    
    const { error } = await supabase
      .from('email_campaigns')
      .update({ status: 'cancelled' })
      .eq('id', campaignId)
    
    if (error) throw error
    
    return NextResponse.json({
      success: true,
      message: 'Campanha cancelada'
    })
    
  } catch (error: any) {
    console.error('❌ [CAMPAIGNS] Erro ao cancelar:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// Função auxiliar: Enviar campanha
async function sendCampaign(campaignId: string) {
  try {
    console.log(`📤 [CAMPAIGNS] Iniciando envio da campanha ${campaignId}...`)
    
    // Buscar campanha
    const { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()
    
    if (campaignError || !campaign) {
      throw new Error('Campanha não encontrada')
    }
    
    if (campaign.status === 'sent' || campaign.status === 'sending') {
      throw new Error('Campanha já foi enviada ou está sendo enviada')
    }
    
    // Atualizar status para "sending"
    await supabase
      .from('email_campaigns')
      .update({ status: 'sending' })
      .eq('id', campaignId)
    
    // Buscar destinatários
    let recipientsQuery = supabase
      .from('profiles')
      .select('id, email, full_name, username, user_type')
      .eq('active', true)
    
    // Verificar preferências de email
    const { data: preferences } = await supabase
      .from('email_preferences')
      .select('user_id')
      .eq('unsubscribed_all', false)
    
    const allowedUserIds = preferences?.map(p => p.user_id) || []
    
    if (campaign.segment === 'vip') {
      recipientsQuery = recipientsQuery.eq('user_type', 'vip')
    } else if (campaign.segment === 'members') {
      recipientsQuery = recipientsQuery.eq('user_type', 'member')
    } else if (campaign.segment === 'trial') {
      recipientsQuery = recipientsQuery.eq('user_type', 'trial')
    }
    
    const { data: recipients, error: recipientsError } = await recipientsQuery
    
    if (recipientsError) throw recipientsError
    
    if (!recipients || recipients.length === 0) {
      throw new Error('Nenhum destinatário encontrado')
    }
    
    // Filtrar por preferências
    const filteredRecipients = recipients.filter(r => 
      campaign.type === 'transactional' || allowedUserIds.includes(r.id)
    )
    
    console.log(`👥 [CAMPAIGNS] ${filteredRecipients.length} destinatários válidos`)
    
    // Criar transporter
    const transporter = createTransporter()
    
    let sent = 0
    let failed = 0
    
    // Enviar para cada destinatário
    for (const recipient of filteredRecipients) {
      try {
        // Gerar HTML do template
        const templateData = {
          userName: recipient.full_name || recipient.username || 'Membro',
          userEmail: recipient.email,
          username: recipient.username || recipient.email,
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://morethanmoney.pt',
          skoolUrl: 'https://www.skool.com/morethanmoney-1132/about',
          opportunities: [], // Para templates DCA
        }
        
        let htmlContent = ''
        
        // Selecionar template correto
        switch (campaign.template_name) {
          case 'welcome':
            htmlContent = emailTemplates.welcomeEmailTemplate(
              templateData.userName,
              templateData.userEmail,
              templateData.username,
              templateData.siteUrl
            )
            break
          case 'onboarding_1':
            htmlContent = emailTemplates.onboarding1EmailTemplate(
              templateData.userName,
              templateData.siteUrl
            )
            break
          case 'onboarding_2':
            htmlContent = emailTemplates.onboarding2EmailTemplate(
              templateData.userName,
              templateData.siteUrl
            )
            break
          case 'onboarding_3':
            htmlContent = emailTemplates.onboarding3EmailTemplate(
              templateData.userName,
              templateData.siteUrl
            )
            break
          case 'onboarding_4':
            htmlContent = emailTemplates.onboarding4EmailTemplate(
              templateData.userName,
              templateData.skoolUrl
            )
            break
          case 'onboarding_schedule':
            const calendlyUrl = process.env.NEXT_PUBLIC_CALENDLY_URL || 'https://calendly.com/morethanmoney'
            htmlContent = emailTemplates.onboardingScheduleEmailTemplate(
              templateData.userName,
              calendlyUrl,
              templateData.siteUrl
            )
            break
          case 'vision_announcement':
            htmlContent = emailTemplates.visionAnnouncementEmailTemplate(
              templateData.userName,
              templateData.siteUrl
            )
            break
          default:
            console.warn(`⚠️ Template ${campaign.template_name} não encontrado, usando welcome`)
            htmlContent = emailTemplates.welcomeEmailTemplate(
              templateData.userName,
              templateData.userEmail,
              templateData.username,
              templateData.siteUrl
            )
        }
        
        // Criar registro de envio
        const { data: emailSend } = await supabase
          .from('email_sends')
          .insert({
            campaign_id: campaignId,
            user_id: recipient.id,
            email: recipient.email,
            status: 'pending'
          })
          .select()
          .single()
        
        if (!emailSend) continue
        
        // Adicionar tracking pixels e links
        const trackingPixel = `<img src="${process.env.NEXT_PUBLIC_SITE_URL}/api/email-marketing/tracking/open?id=${emailSend.id}" width="1" height="1" style="display:none;" />`
        htmlContent = htmlContent.replace('</body>', `${trackingPixel}</body>`)
        
        // Substituir placeholders de unsubscribe
        htmlContent = htmlContent.replace(
          /\{\{unsubscribe_url\}\}/g,
          `${process.env.NEXT_PUBLIC_SITE_URL}/unsubscribe?token=${emailSend.id}`
        )
        htmlContent = htmlContent.replace(
          /\{\{preferences_url\}\}/g,
          `${process.env.NEXT_PUBLIC_SITE_URL}/email-preferences?token=${emailSend.id}`
        )
        
        // Enviar email
        await transporter.sendMail({
          from: `"MoreThanMoney" <${process.env.GMAIL_USER}>`,
          to: recipient.email,
          subject: campaign.subject,
          html: htmlContent
        })
        
        // Atualizar status de envio
        await supabase
          .from('email_sends')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', emailSend.id)
        
        sent++
        console.log(`✅ [CAMPAIGNS] Email enviado para ${recipient.email}`)
        
        // Delay para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
        
      } catch (error) {
        console.error(`❌ [CAMPAIGNS] Erro ao enviar para ${recipient.email}:`, error)
        failed++
      }
    }
    
    // Atualizar campanha com resultados
    await supabase
      .from('email_campaigns')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        emails_sent: sent,
        emails_delivered: sent // Assumir delivered = sent (pode melhorar com webhooks)
      })
      .eq('id', campaignId)
    
    console.log(`✅ [CAMPAIGNS] Campanha enviada: ${sent} sucesso, ${failed} falhas`)
    
    return NextResponse.json({
      success: true,
      sent,
      failed,
      total: filteredRecipients.length
    })
    
  } catch (error: any) {
    console.error('❌ [CAMPAIGNS] Erro ao enviar campanha:', error)
    
    // Reverter status
    await supabase
      .from('email_campaigns')
      .update({ status: 'draft' })
      .eq('id', campaignId)
    
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

