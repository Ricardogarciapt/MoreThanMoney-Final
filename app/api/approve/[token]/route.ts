import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { sendRejectionEmail } from "@/lib/email-service"
import { sendNewMemberWelcomeIfEligible } from "@/lib/new-member-welcome"
import jwt from 'jsonwebtoken'

const supabase = getSupabaseAdmin()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  try {
    console.log('🔐 [APPROVE] Processando token JWT...')

    // Decodificar e validar token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    const { userId, action } = decoded

    console.log(`📋 [APPROVE] Action: ${action}, UserID: ${userId}`)

    // Buscar dados do utilizador
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      console.error('❌ [APPROVE] Utilizador não encontrado:', userId)
      return NextResponse.redirect(
        new URL('/error?message=Utilizador não encontrado', request.url)
      )
    }

    console.log(`👤 [APPROVE] Utilizador encontrado: ${user.email}`)

    if (action === 'approve') {
      // ========================================
      // APROVAR UTILIZADOR
      // ========================================
      
      console.log(`✅ [APPROVE] Aprovando utilizador: ${user.email}`)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          user_type: 'member',
          member_category: 'standard',
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (updateError) {
        console.error('❌ [APPROVE] Erro ao atualizar perfil:', updateError)
        return NextResponse.redirect(
          new URL('/error?message=Erro ao aprovar utilizador', request.url)
        )
      }

      // Log da atividade
      try {
        await supabase.rpc('log_activity', {
          p_user_email: user.email,
          p_action: 'user_approved_via_email',
          p_details: `Utilizador ${user.email} aprovado via link de email`
        })
      } catch (logError) {
        console.warn('⚠️ [APPROVE] Erro ao fazer log:', logError)
      }

      // Enviar email de boas-vindas ao utilizador
      try {
        console.log(`📧 [APPROVE] Enviando email de boas-vindas para: ${user.email}`)
        await sendNewMemberWelcomeIfEligible({
          userId,
          source: 'admin',
          force: true,
        })
        console.log(`✅ [APPROVE] Email de boas-vindas enviado!`)
      } catch (emailError) {
        console.error('❌ [APPROVE] Erro ao enviar email de boas-vindas:', emailError)
        // Continuar mesmo se email falhar
      }

      // Redirecionar para página de sucesso
      const successUrl = new URL('/success', request.url)
      successUrl.searchParams.set('type', 'approved')
      successUrl.searchParams.set('email', user.email)
      
      console.log(`🎉 [APPROVE] Utilizador aprovado com sucesso!`)
      return NextResponse.redirect(successUrl)

    } else if (action === 'reject') {
      // ========================================
      // REJEITAR UTILIZADOR
      // ========================================
      
      console.log(`❌ [APPROVE] Rejeitando utilizador: ${user.email}`)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          user_type: 'rejected',
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (updateError) {
        console.error('❌ [APPROVE] Erro ao rejeitar:', updateError)
        return NextResponse.redirect(
          new URL('/error?message=Erro ao processar rejeição', request.url)
        )
      }

      // Log da atividade
      try {
        await supabase.rpc('log_activity', {
          p_user_email: user.email,
          p_action: 'user_rejected_via_email',
          p_details: `Utilizador ${user.email} rejeitado via link de email`
        })
      } catch (logError) {
        console.warn('⚠️ [APPROVE] Erro ao fazer log:', logError)
      }

      // Enviar email de rejeição ao utilizador
      try {
        console.log(`📧 [APPROVE] Enviando email de rejeição para: ${user.email}`)
        await sendRejectionEmail(
          user.email,
          user.full_name || user.username || 'Utilizador'
        )
        console.log(`✅ [APPROVE] Email de rejeição enviado!`)
      } catch (emailError) {
        console.error('❌ [APPROVE] Erro ao enviar email de rejeição:', emailError)
        // Continuar mesmo se email falhar
      }

      // Redirecionar para página de sucesso
      const successUrl = new URL('/success', request.url)
      successUrl.searchParams.set('type', 'rejected')
      successUrl.searchParams.set('email', user.email)
      
      console.log(`✅ [APPROVE] Utilizador rejeitado com sucesso!`)
      return NextResponse.redirect(successUrl)

    } else {
      console.error('❌ [APPROVE] Ação inválida:', action)
      return NextResponse.redirect(
        new URL('/error?message=Ação inválida', request.url)
      )
    }

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      console.error('❌ [APPROVE] Token inválido ou expirado:', error.message)
      return NextResponse.redirect(
        new URL('/error?message=Link inválido ou expirado', request.url)
      )
    }
    
    console.error('❌ [APPROVE] Erro geral:', error)
    return NextResponse.redirect(
      new URL('/error?message=Erro ao processar pedido', request.url)
    )
  }
}
