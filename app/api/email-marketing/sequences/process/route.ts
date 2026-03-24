import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import nodemailer from 'nodemailer'
import * as emailTemplates from '@/lib/email-templates'

const supabase = getSupabaseAdmin()

const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'morethanmoneypt@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || ''
    }
  })
}

// GET: Processar sequências pendentes (chamado por CRON)
export async function GET(request: NextRequest) {
  try {
    // Verificar autenticação CRON
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || 'mtm-cron-secret-2025'
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn('⚠️ [SEQUENCES] Auth inválida')
      // Em produção, descomentar esta linha:
      // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log('🔄 [SEQUENCES] Processando sequências pendentes...')
    
    // Buscar todas as inscrições ativas
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('email_sequence_enrollments')
      .select(`
        *,
        sequence:email_sequences(*)
      `)
      .eq('status', 'active')
    
    if (enrollmentsError) throw enrollmentsError
    
    if (!enrollments || enrollments.length === 0) {
      console.log('✅ [SEQUENCES] Nenhuma sequência pendente')
      return NextResponse.json({
        success: true,
        processed: 0
      })
    }
    
    console.log(`📋 [SEQUENCES] ${enrollments.length} inscrições ativas encontradas`)
    
    let processed = 0
    let sent = 0
    
    for (const enrollment of enrollments) {
      try {
        // Buscar próximo passo
        const nextStepNumber = enrollment.current_step + 1
        
        const { data: nextStep, error: stepError } = await supabase
          .from('email_sequence_steps')
          .select('*')
          .eq('sequence_id', enrollment.sequence_id)
          .eq('step_number', nextStepNumber)
          .eq('is_active', true)
          .single()
        
        if (stepError || !nextStep) {
          // Não há próximo passo, completar sequência
          await supabase
            .from('email_sequence_enrollments')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString()
            })
            .eq('id', enrollment.id)
          
          console.log(`✅ [SEQUENCES] Sequência completa para user ${enrollment.user_id}`)
          processed++
          continue
        }
        
        // Calcular quando enviar
        const enrolledDate = new Date(enrollment.enrolled_at)
        const delayMs = (nextStep.delay_days * 24 * 60 * 60 * 1000) + (nextStep.delay_hours * 60 * 60 * 1000)
        const sendDate = new Date(enrolledDate.getTime() + delayMs)
        
        // Verificar se já passou da data de envio
        if (new Date() < sendDate) {
          console.log(`⏰ [SEQUENCES] Aguardando: user ${enrollment.user_id}, passo ${nextStepNumber}`)
          continue
        }
        
        // Buscar dados do usuário
        const { data: user, error: userError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', enrollment.user_id)
          .single()
        
        if (userError || !user) {
          console.error(`❌ [SEQUENCES] Usuário não encontrado: ${enrollment.user_id}`)
          continue
        }
        
        // Verificar preferências de email
        const { data: prefs } = await supabase
          .from('email_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single()
        
        if (prefs?.unsubscribed_all) {
          // Cancelar sequência
          await supabase
            .from('email_sequence_enrollments')
            .update({
              status: 'cancelled',
              cancelled_at: new Date().toISOString()
            })
            .eq('id', enrollment.id)
          
          console.log(`⛔ [SEQUENCES] Sequência cancelada (unsubscribed): ${user.email}`)
          processed++
          continue
        }
        
        // Gerar HTML do email
        const templateData = {
          userName: user.full_name || user.username || 'Membro',
          userEmail: user.email,
          username: user.username || user.email,
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://morethanmoney.pt',
          skoolUrl: 'https://www.skool.com/morethanmoney-1132/about'
        }
        
        let htmlContent = ''
        
        switch (nextStep.template_name) {
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
          default:
            console.warn(`⚠️ Template ${nextStep.template_name} não encontrado`)
            continue
        }
        
        // Criar registro de envio (sem campanha)
        const { data: emailSend } = await supabase
          .from('email_sends')
          .insert({
            campaign_id: null, // Sequência automática
            user_id: user.id,
            email: user.email,
            status: 'pending',
            metadata: {
              sequence_id: enrollment.sequence_id,
              step_number: nextStepNumber,
              step_name: nextStep.name
            }
          })
          .select()
          .single()
        
        if (!emailSend) continue
        
        // Adicionar tracking
        const trackingPixel = `<img src="${process.env.NEXT_PUBLIC_SITE_URL}/api/email-marketing/tracking/open?id=${emailSend.id}" width="1" height="1" style="display:none;" />`
        htmlContent = htmlContent.replace('</body>', `${trackingPixel}</body>`)
        
        // Substituir placeholders
        htmlContent = htmlContent.replace(
          /\{\{unsubscribe_url\}\}/g,
          `${process.env.NEXT_PUBLIC_SITE_URL}/unsubscribe?token=${emailSend.id}`
        )
        htmlContent = htmlContent.replace(
          /\{\{preferences_url\}\}/g,
          `${process.env.NEXT_PUBLIC_SITE_URL}/email-preferences?token=${emailSend.id}`
        )
        
        // Enviar email
        const transporter = createTransporter()
        
        await transporter.sendMail({
          from: `"MoreThanMoney" <${process.env.GMAIL_USER}>`,
          to: user.email,
          subject: nextStep.subject,
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
        
        // Atualizar inscrição para próximo passo
        await supabase
          .from('email_sequence_enrollments')
          .update({
            current_step: nextStepNumber
          })
          .eq('id', enrollment.id)
        
        console.log(`✅ [SEQUENCES] Email enviado: ${user.email} - Passo ${nextStepNumber}`)
        sent++
        processed++
        
        // Delay para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 200))
        
      } catch (error) {
        console.error(`❌ [SEQUENCES] Erro ao processar inscrição ${enrollment.id}:`, error)
      }
    }
    
    console.log(`✅ [SEQUENCES] Processamento completo: ${processed} processadas, ${sent} enviadas`)
    
    return NextResponse.json({
      success: true,
      processed,
      sent
    })
    
  } catch (error: any) {
    console.error('❌ [SEQUENCES] Erro geral:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST: Inscrever usuário em sequência manualmente
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, triggerEvent } = body
    
    if (!userId || !triggerEvent) {
      return NextResponse.json(
        { success: false, error: 'userId e triggerEvent obrigatórios' },
        { status: 400 }
      )
    }
    
    // Usar função SQL para inscrever
    const { error } = await supabase.rpc('enroll_user_in_sequence', {
      p_user_id: userId,
      p_trigger_event: triggerEvent
    })
    
    if (error) throw error
    
    // Criar preferências de email se não existir
    await supabase
      .from('email_preferences')
      .insert({
        user_id: userId,
        marketing_emails: true,
        dca_notifications: true
      })
      .onConflict('user_id')
      .ignore()
    
    console.log(`✅ [SEQUENCES] Usuário inscrito: ${userId} em ${triggerEvent}`)
    
    return NextResponse.json({
      success: true,
      message: 'Usuário inscrito em sequências'
    })
    
  } catch (error: any) {
    console.error('❌ [SEQUENCES] Erro ao inscrever:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

