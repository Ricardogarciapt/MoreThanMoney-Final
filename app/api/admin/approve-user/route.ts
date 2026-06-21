import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { sendRejectionEmail } from "@/lib/email-service"
import { sendNewMemberWelcomeIfEligible } from "@/lib/new-member-welcome"

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  try {
    const body = await request.json()
    const { userId, action } = body

    // Buscar dados do utilizador
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (action === 'approve') {
      // Aprovar utilizador
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          user_type: 'member',
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      // Log da atividade
      await supabase.rpc('log_activity', {
        p_user_email: user.email,
        p_action: 'user_approved',
        p_details: `Utilizador ${user.email} aprovado via email`
      })

      // Enviar email de confirmação para o utilizador
      try {
        await sendNewMemberWelcomeIfEligible({
          userId,
          source: 'admin',
          force: true,
        })
      } catch (emailError) {
        console.error('Erro ao enviar email de boas-vindas:', emailError)
        // Continuar mesmo se o email falhar
      }

      return NextResponse.json({ 
        message: 'User approved successfully and confirmation email sent',
        user: user.email 
      })

    } else if (action === 'reject') {
      // Rejeitar utilizador
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      // Log da atividade
      await supabase.rpc('log_activity', {
        p_user_email: user.email,
        p_action: 'user_rejected',
        p_details: `Utilizador ${user.email} rejeitado via email`
      })

      // Enviar email de rejeição
      try {
        await sendRejectionEmail(user.email, user.full_name || user.username)
      } catch (emailError) {
        console.error('Erro ao enviar email de rejeição:', emailError)
        // Continuar mesmo se o email falhar
      }

      return NextResponse.json({ 
        message: 'User rejected and notification email sent',
        user: user.email 
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('Error processing user approval:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
