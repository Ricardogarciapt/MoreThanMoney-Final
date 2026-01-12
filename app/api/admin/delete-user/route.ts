import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase configuration is missing")
  }
  
  return createClient(supabaseUrl, supabaseKey)
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseClient()
  try {
    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Buscar dados do utilizador antes de apagar
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('email, username')
      .eq('id', userId)
      .single()

    if (userError) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Apagar perfil da tabela profiles
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    // Apagar utilizador do Auth
    const { error: authError } = await supabase.auth.admin.deleteUser(userId)

    if (authError) {
      console.warn('Erro ao apagar do Auth:', authError.message)
      // Continuar mesmo se falhar no Auth
    }

    // Log da atividade
    try {
      await supabase.rpc('log_activity', {
        p_user_email: 'admin@morethanmoney.pt',
        p_action: 'user_deleted',
        p_details: `Utilizador ${user.email} (${user.username}) foi apagado`
      })
    } catch (logError) {
      console.warn('Erro ao registrar log:', logError)
    }

    return NextResponse.json({
      success: true,
      message: 'Utilizador apagado com sucesso',
      deletedUser: {
        email: user.email,
        username: user.username
      }
    })

  } catch (error: any) {
    console.error('Erro ao apagar utilizador:', error)
    return NextResponse.json({
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}
