import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import jwt from 'jsonwebtoken'

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase configuration is missing")
  }
  
  return createClient(supabaseUrl, supabaseKey)
}

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = getSupabaseClient()
  try {
    // Decodificar o token JWT
    const decoded = jwt.verify(params.token, process.env.JWT_SECRET!) as any
    const { userId, email } = decoded

    // Verificar se o utilizador existe
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .eq('email', email)
      .single()

    if (userError || !user) {
      return NextResponse.redirect(new URL('/error?message=User not found or email mismatch', request.url))
    }

    // Marcar email como verificado
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        is_verified: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (updateError) {
      return NextResponse.redirect(new URL('/error?message=Failed to verify email', request.url))
    }

    // Log da atividade
    await supabase.rpc('log_activity', {
      p_user_email: user.email,
      p_action: 'email_verified',
      p_details: `Email ${user.email} verificado com sucesso`
    })

    // Redirecionar para página de sucesso com dados de login
    const successUrl = new URL('/email-verified', request.url)
    successUrl.searchParams.set('email', user.email)
    successUrl.searchParams.set('username', user.username || '')
    
    return NextResponse.redirect(successUrl)

  } catch (error) {
    console.error('Error verifying email:', error)
    return NextResponse.redirect(new URL('/error?message=Invalid or expired verification token', request.url))
  }
}
