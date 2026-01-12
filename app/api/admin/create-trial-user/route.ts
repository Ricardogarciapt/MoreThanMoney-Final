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

// DEPRECATED: Esta API não é mais usada
// Trial users agora se registram diretamente com senha no /register
// Mantida apenas para compatibilidade com versões antigas
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient()
  try {
    const body = await request.json()
    const { email, username, full_name, user_type, phone, whatsapp } = body

    console.log('📥 Recebido:', { email, username, full_name, user_type })

    // Validações
    if (!email || !username || !full_name || !user_type) {
      console.error('❌ Dados obrigatórios em falta')
      return NextResponse.json({ 
        error: 'Email, username, nome completo e tipo de conta são obrigatórios' 
      }, { status: 400 })
    }

    if (!['trial', 'guest'].includes(user_type)) {
      console.error('❌ Tipo inválido:', user_type)
      return NextResponse.json({ 
        error: 'Tipo de conta inválido. Use "trial" ou "guest"' 
      }, { status: 400 })
    }

    // Gerar senha temporária
    const tempPassword = `Trial${Math.random().toString(36).substring(2, 10)}@MTM`

    // Calcular data de expiração
    const expiryDate = new Date()
    if (user_type === 'trial') {
      expiryDate.setDate(expiryDate.getDate() + 7) // 7 dias para trial
    } else {
      expiryDate.setHours(expiryDate.getHours() + 48) // 48 horas para guest
    }

    console.log('⏰ Expiração:', expiryDate.toLocaleString('pt-PT'))

    // Criar utilizador no Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name,
        username,
        user_type
      }
    })

    if (authError) {
      console.error('❌ Erro no Auth:', authError.message)
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    console.log('✅ Usuário criado no Auth:', authUser.user?.id)

    // Criar perfil na tabela profiles
    if (authUser.user) {
      // Corrigir user_type: 'trial' não existe, usar 'guest' para ambos
      const correctedUserType = user_type === 'trial' ? 'guest' : user_type
      
      const profileData: any = {
        id: authUser.user.id,
        email,
        username,
        full_name,
        user_type: correctedUserType, // Usar 'guest' em vez de 'trial'
        member_category: 'standard', // Adicionar member_category
        phone: phone || null,
        whatsapp: whatsapp || null,
        membership_level: 'basic',
        is_active: true,
        trial_expires_at: expiryDate.toISOString(),
        trial_expired: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      // Adicionar is_verified se a coluna existir
      try {
        const { data: columns } = await supabase
          .from('profiles')
          .select('*')
          .limit(0)
        
        if (columns !== null) {
          (profileData as any).is_verified = true
        }
      } catch (e) {
        // Coluna não existe, continuar sem ela
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .insert(profileData)

      if (profileError) {
        console.error('❌ Erro ao criar perfil:', profileError.message)
        await supabase.auth.admin.deleteUser(authUser.user.id)
        return NextResponse.json({ 
          error: 'Erro ao criar perfil: ' + profileError.message 
        }, { status: 500 })
      }

      console.log('✅ Perfil criado com sucesso')
    }

    // Log da atividade
    try {
      await supabase.rpc('log_activity', {
        p_user_email: email,
        p_action: 'trial_created',
        p_details: `Conta ${user_type} criada. Expira em: ${expiryDate.toLocaleString('pt-PT')}`
      })
    } catch (logError) {
      console.warn('⚠️ Erro ao registrar log:', logError)
    }

    const displayType = user_type === 'trial' ? 'Free Trial' : 'Guest'
    const temporaryPassword = tempPassword

    console.log('✅ Conta criada com sucesso!')
    console.log('Senha temporária:', temporaryPassword)

    return NextResponse.json({ 
      success: true,
      message: `Conta ${displayType} criada com sucesso`,
      temporaryPassword: temporaryPassword, // Nome correto que o frontend espera
      user: {
        id: authUser.user?.id,
        email,
        username,
        user_type,
        trial_expires_at: expiryDate.toISOString(),
        days_remaining: user_type === 'trial' ? 7 : 0,
        hours_remaining: user_type === 'guest' ? 48 : 0
      }
    })

  } catch (error: any) {
    console.error('Erro ao criar utilizador trial:', error)
    return NextResponse.json({ 
      error: error.message || 'Erro interno do servidor' 
    }, { status: 500 })
  }
}
