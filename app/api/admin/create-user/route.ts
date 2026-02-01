import { NextRequest, NextResponse } from "next/server"
import { 
  getSupabaseAdmin, 
  requireAdmin, 
  validateRequiredFields, 
  isValidEmail,
  sanitizeString
} from "@/lib/admin-api-helpers"

export async function POST(request: NextRequest) {
  // Verificar acesso admin
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const supabase = getSupabaseAdmin()
  
  try {
    const body = await request.json()
    const { email, username, full_name, password, phone, whatsapp, user_type, membership_level } = body

    // Validação de campos obrigatórios
    const validation = validateRequiredFields(body, ['email', 'username', 'password', 'full_name'])
    if (!validation.valid) {
      return NextResponse.json({ 
        error: validation.error,
        missing: validation.missing
      }, { status: 400 })
    }

    // Validação de email
    if (!isValidEmail(email)) {
      return NextResponse.json({ 
        error: 'Email inválido' 
      }, { status: 400 })
    }

    // Validação de senha
    if (password.length < 6) {
      return NextResponse.json({ 
        error: 'A senha deve ter pelo menos 6 caracteres' 
      }, { status: 400 })
    }

    if (password.length > 128) {
      return NextResponse.json({ 
        error: 'A senha deve ter no máximo 128 caracteres' 
      }, { status: 400 })
    }

    // Sanitizar inputs
    const sanitizedEmail = sanitizeString(email).toLowerCase()
    const sanitizedUsername = sanitizeString(username)
    const sanitizedFullName = sanitizeString(full_name)

    // Verificar se email já existe (em paralelo com username)
    const [emailCheck, usernameCheck] = await Promise.all([
      supabase
        .from('profiles')
        .select('id')
        .eq('email', sanitizedEmail)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id')
        .eq('username', sanitizedUsername)
        .maybeSingle()
    ])

    if (emailCheck.data) {
      return NextResponse.json({ 
        error: 'Email já está em uso' 
      }, { status: 400 })
    }

    if (emailCheck.error && emailCheck.error.code !== 'PGRST116') {
      console.error('❌ [CREATE USER] Erro ao verificar email:', emailCheck.error)
    }

    if (usernameCheck.data) {
      return NextResponse.json({ 
        error: 'Username já está em uso' 
      }, { status: 400 })
    }

    if (usernameCheck.error && usernameCheck.error.code !== 'PGRST116') {
      console.error('❌ [CREATE USER] Erro ao verificar username:', usernameCheck.error)
    }

    // Criar utilizador no Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: sanitizedEmail,
      password,
      email_confirm: true, // Email já verificado por ser criação manual
      user_metadata: {
        full_name: sanitizedFullName,
        username: sanitizedUsername,
        user_type: user_type || 'member'
      }
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    // Criar perfil na tabela profiles
    if (authUser.user) {
      // Calcular data de expiração para trial/guest users
      const isTrial = user_type === 'guest' || user_type === 'presentation'
      let trialExpiresAt = null
      if (isTrial) {
        const expiryDate = new Date()
        if (user_type === 'presentation') {
          expiryDate.setDate(expiryDate.getDate() + 7) // 7 dias para presentation
        } else {
          expiryDate.setHours(expiryDate.getHours() + 48) // 48 horas para guest
        }
        trialExpiresAt = expiryDate.toISOString()
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authUser.user.id,
          email: sanitizedEmail,
          username: sanitizedUsername,
          full_name: sanitizedFullName,
          phone: phone ? sanitizeString(phone) : null,
          whatsapp: whatsapp ? sanitizeString(whatsapp) : null,
          user_type: user_type || 'member',
          membership_level: membership_level || 'basic',
          is_active: true,
          is_verified: true, // Verificado por ser criação manual
          trial_expires_at: trialExpiresAt,
          trial_expired: false,
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

    const isTrial = user_type === 'guest' || user_type === 'presentation'
    const expiryDate = isTrial ? (() => {
      const date = new Date()
      if (user_type === 'presentation') {
        date.setDate(date.getDate() + 7)
      } else {
        date.setHours(date.getHours() + 48)
      }
      return date.toISOString()
    })() : null

    return NextResponse.json({ 
      success: true,
      message: 'Utilizador criado com sucesso',
      user: {
        id: authUser.user?.id,
        email,
        username,
        full_name,
        user_type,
        trial_expires_at: expiryDate
      }
    })

  } catch (error: any) {
    console.error('Erro ao criar utilizador:', error)
    return NextResponse.json({ 
      error: error.message || 'Erro interno do servidor' 
    }, { status: 500 })
  }
}
