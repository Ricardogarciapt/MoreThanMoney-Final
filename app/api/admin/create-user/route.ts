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

export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient()
  try {
    const body = await request.json()
    const { email, username, full_name, password, phone, whatsapp, user_type, membership_level } = body

    // Validações
    if (!email || !username || !password || !full_name) {
      return NextResponse.json({ 
        error: 'Email, username, password e nome completo são obrigatórios' 
      }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ 
        error: 'A senha deve ter pelo menos 6 caracteres' 
      }, { status: 400 })
    }

    // Verificar se email já existe
    const { data: existingEmail } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    if (existingEmail) {
      return NextResponse.json({ error: 'Email já está em uso' }, { status: 400 })
    }

    // Verificar se username já existe
    const { data: existingUsername } = await supabase.rpc('check_username_exists', {
      username_param: username
    })

    if (existingUsername) {
      return NextResponse.json({ error: 'Username já está em uso' }, { status: 400 })
    }

    // Criar utilizador no Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Email já verificado por ser criação manual
      user_metadata: {
        full_name,
        username,
        user_type: user_type || 'member'
      }
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    // Criar perfil na tabela profiles
    if (authUser.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authUser.user.id,
          email,
          username,
          full_name,
          phone: phone || null,
          whatsapp: whatsapp || null,
          user_type: user_type || 'member',
          membership_level: membership_level || 'basic',
          is_active: true,
          is_verified: true, // Verificado por ser criação manual
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (profileError) {
        console.error('Erro ao criar perfil:', profileError)
        // Tentar deletar o auth user se o perfil falhar
        await supabase.auth.admin.deleteUser(authUser.user.id)
        return NextResponse.json({ error: 'Erro ao criar perfil do utilizador' }, { status: 500 })
      }
    }

    // Log da atividade
    try {
      await supabase.rpc('log_activity', {
        p_user_email: 'admin@morethanmoney.pt',
        p_action: 'user_created',
        p_details: `Utilizador ${email} criado manualmente via admin`
      })
    } catch (logError) {
      console.warn('Erro ao registrar log:', logError)
    }

    return NextResponse.json({ 
      success: true,
      message: 'Utilizador criado com sucesso',
      user: {
        id: authUser.user?.id,
        email,
        username,
        full_name
      }
    })

  } catch (error: any) {
    console.error('Erro ao criar utilizador:', error)
    return NextResponse.json({ 
      error: error.message || 'Erro interno do servidor' 
    }, { status: 500 })
  }
}
