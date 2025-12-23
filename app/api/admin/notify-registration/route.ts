import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendRegistrationNotification } from "@/lib/email-service"
import jwt from 'jsonwebtoken'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId } = body

    // Buscar dados do utilizador
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Gerar tokens JWT para aprovação e rejeição
    const approveToken = jwt.sign(
      { userId: user.id, action: 'approve' },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    const rejectToken = jwt.sign(
      { userId: user.id, action: 'reject' },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    const approveUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/approve/${approveToken}`
    const rejectUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/approve/${rejectToken}`

    // Enviar email de notificação para admin usando Gmail
    const emailResult = await sendRegistrationNotification(
      user.email,
      user.full_name || user.username || 'Utilizador',
      user.id
    )

    if (!emailResult.success) {
      console.warn('Erro ao enviar email:', emailResult.error)
      return NextResponse.json({ 
        success: false,
        message: 'Utilizador registado mas email não foi enviado',
        error: 'Email service unavailable'
      }, { status: 500 })
    }

    /* CÓDIGO ANTIGO COM RESEND - COMENTADO
    await resend.emails.send({
      from: 'MoreThanMoney <noreply@morethanmoney.pt>',
      to: ['morethanmoneypt@gmail.com'],
      subject: '🔔 Novo Pedido de Registo - Ação Necessária!',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; padding: 0; background: #f8f9fa;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #D2A63C 0%, #F4D03F 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: #000000; font-size: 28px; margin: 0; font-weight: bold;">
              🔔 Novo Pedido de Registo!
            </h1>
            <p style="color: #000000; font-size: 16px; margin: 10px 0 0 0; font-weight: 500;">
              Alguém quer juntar-se à família MoreThanMoney
            </p>
          </div>

          <!-- Main Content -->
          <div style="padding: 25px 20px;">
            
            <!-- User Info -->
            <div style="background: #ffffff; padding: 25px; border-radius: 15px; margin-bottom: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #D2A63C; margin: 0 0 20px 0; font-size: 22px;">
                👤 Informações do Candidato
              </h2>
              <div style="background: #f8f9fa; padding: 20px; border-radius: 10px;">
                <table style="width: 100%; color: #333;">
                  <tr>
                    <td style="padding: 10px 0; font-weight: bold; color: #D2A63C; width: 140px;">👤 Nome:</td>
                    <td style="padding: 10px 0;">${user.full_name || 'Não fornecido'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; font-weight: bold; color: #D2A63C;">🏷️ Username:</td>
                    <td style="padding: 10px 0;">${user.username || 'Não fornecido'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; font-weight: bold; color: #D2A63C;">📧 Email:</td>
                    <td style="padding: 10px 0; font-family: monospace;">${user.email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; font-weight: bold; color: #D2A63C;">📱 Telefone:</td>
                    <td style="padding: 10px 0;">${user.phone || 'Não fornecido'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; font-weight: bold; color: #D2A63C;">💬 WhatsApp:</td>
                    <td style="padding: 10px 0;">${user.whatsapp || 'Não fornecido'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; font-weight: bold; color: #D2A63C;">📅 Data:</td>
                    <td style="padding: 10px 0;">${new Date(user.created_at).toLocaleString('pt-PT')}</td>
                  </tr>
                </table>
              </div>
            </div>

            <!-- Action Buttons -->
            <div style="background: #ffffff; padding: 25px; border-radius: 15px; margin-bottom: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center;">
              <h3 style="color: #D2A63C; margin: 0 0 15px 0; font-size: 20px;">
                ⚡ Ação Rápida Necessária
              </h3>
              <p style="color: #666; margin: 0 0 25px 0; font-size: 16px;">
                Clica num dos botões abaixo para aprovar ou rejeitar este candidato:
              </p>
              
              <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; margin-bottom: 20px;">
                <a href="${approveUrl}" 
                   style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: #ffffff; padding: 18px 35px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 4px 8px rgba(40, 167, 69, 0.3); transition: transform 0.3s;">
                  ✅ Aprovar Membro
                </a>
                
                <a href="${rejectUrl}" 
                   style="background: linear-gradient(135deg, #dc3545 0%, #e74c3c 100%); color: #ffffff; padding: 18px 35px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 4px 8px rgba(220, 53, 69, 0.3); transition: transform 0.3s;">
                  ❌ Rejeitar Pedido
                </a>
              </div>
              
              <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px;">
                <p style="color: #856404; font-size: 14px; margin: 0; font-weight: bold;">
                  ⏰ Estes links expiram em 7 dias por motivos de segurança
                </p>
              </div>
            </div>

            <!-- Backup Links -->
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 4px solid #D2A63C;">
              <h4 style="color: #D2A63C; margin: 0 0 10px 0; font-size: 16px;">
                🔗 Links de Backup (caso os botões não funcionem)
              </h4>
              <div style="font-size: 12px; word-break: break-all;">
                <p style="margin: 5px 0; color: #28a745;"><strong>Aprovar:</strong> ${approveUrl}</p>
                <p style="margin: 5px 0; color: #dc3545;"><strong>Rejeitar:</strong> ${rejectUrl}</p>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #0a0a0a; color: #ffffff; padding: 20px; text-align: center;">
            <p style="color: #D2A63C; font-size: 16px; margin: 0 0 10px 0; font-weight: bold;">
              MoreThanMoney - Sistema de Gestão
            </p>
            <p style="color: #888; font-size: 14px; margin: 0;">
              Email automático enviado para morethanmoneypt@gmail.com
            </p>
          </div>
        </div>
      `
    })
    */

    // Log da atividade
    try {
      await supabase.rpc('log_activity', {
        p_user_email: 'system@morethanmoney.pt',
        p_action: 'registration_notification',
        p_details: `Email de notificação enviado para admin sobre novo registo: ${user.email}`
      })
    } catch (logError) {
      console.warn('Log activity failed:', logError)
    }

    return NextResponse.json({ 
      message: 'Registration notification email sent successfully',
      user: user.email 
    })

  } catch (error) {
    console.error('Error sending registration notification:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
