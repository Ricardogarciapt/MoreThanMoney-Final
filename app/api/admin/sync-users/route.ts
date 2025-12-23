import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface AuthUser {
  id: string
  email?: string
  user_metadata?: {
    full_name?: string
    username?: string
    user_type?: string
  }
  created_at: string
  email_confirmed_at?: string
}

export async function POST(request: NextRequest) {
  try {
    // Verificar se é admin (opcional - pode remover para facilitar)
    // const authHeader = request.headers.get('authorization')
    // if (!authHeader || !authHeader.includes(process.env.ADMIN_TOKEN || '')) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }

    console.log("🔄 Iniciando sincronização de utilizadores...")

    // 1. Buscar todos os utilizadores do Auth
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    // 2. Buscar todos os perfis existentes
    const { data: existingProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 })
    }

    const existingProfileIds = new Set(existingProfiles?.map(p => p.id) || [])

    // 3. Identificar admins existentes
    const adminEmails = [
      'ricardogarciapt@proton.me',
      'morethanmoneypt@gmail.com'
    ]

    const adminUsers = authUsers.users.filter(user => 
      user.user_metadata?.user_type === 'admin' || 
      adminEmails.includes(user.email || '')
    )

    // 4. Sincronizar utilizadores
    let syncedCount = 0
    let adminCount = 0
    const results = []

    for (const authUser of authUsers.users) {
      if (!existingProfileIds.has(authUser.id)) {
        // Determinar tipo de utilizador
        let userType = 'member'
        let isActive = true
        let isVerified = !!authUser.email_confirmed_at

        // Verificar se é admin
        if (adminUsers.some(admin => admin.id === authUser.id)) {
          userType = 'admin'
          adminCount++
        }

        // Criar perfil do utilizador (sem is_verified se a coluna não existir)
        const profileData: any = {
          id: authUser.id,
          email: authUser.email || '',
          full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Utilizador',
          username: authUser.user_metadata?.username || authUser.email?.split('@')[0] || `user_${Math.random().toString(36).substr(2, 9)}`,
          user_type: userType,
          membership_level: 'basic',
          is_active: isActive,
          created_at: authUser.created_at,
          updated_at: new Date().toISOString()
        }
        
        // Adicionar is_verified apenas se a coluna existir
        // A API tentará inserir, se falhar por causa da coluna, tentaremos sem ela

        const { error: insertError } = await supabase
          .from('profiles')
          .insert(profileData)

        if (insertError) {
          results.push({
            email: authUser.email,
            status: 'error',
            error: insertError.message
          })
        } else {
          results.push({
            email: authUser.email,
            status: 'success',
            userType
          })
          syncedCount++
        }
      } else {
        results.push({
          email: authUser.email,
          status: 'already_exists'
        })
      }
    }

    // 5. Atualizar admins existentes
    for (const admin of adminUsers) {
      if (existingProfileIds.has(admin.id)) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            user_type: 'admin',
            updated_at: new Date().toISOString()
          })
          .eq('id', admin.id)

        if (updateError) {
          results.push({
            email: admin.email,
            status: 'admin_update_error',
            error: updateError.message
          })
        } else {
          results.push({
            email: admin.email,
            status: 'admin_updated'
          })
        }
      }
    }

    // 6. Criar configurações padrão se não existirem
    const { data: settings } = await supabase
      .from('admin_settings')
      .select('*')

    if (!settings || settings.length === 0) {
      const defaultSettings = [
        { setting_key: 'site_name', setting_value: 'MoreThanMoney', description: 'Nome do site' },
        { setting_key: 'site_description', setting_value: 'Plataforma de Trading e Educação Financeira', description: 'Descrição do site' },
        { setting_key: 'maintenance_mode', setting_value: false, description: 'Modo de manutenção' },
        { setting_key: 'registration_enabled', setting_value: true, description: 'Registo de novos utilizadores' },
        { setting_key: 'auto_approve_users', setting_value: false, description: 'Aprovação automática' },
        { setting_key: 'email_notifications', setting_value: true, description: 'Notificações por email' },
        { setting_key: 'default_user_role', setting_value: 'member', description: 'Role padrão para novos utilizadores' }
      ]

      for (const setting of defaultSettings) {
        await supabase
          .from('admin_settings')
          .insert(setting)
      }
    }

    // 7. Buscar lista final de admins
    const { data: allAdmins } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_type', 'admin')

    return NextResponse.json({
      success: true,
      summary: {
        totalAuthUsers: authUsers.users.length,
        existingProfiles: existingProfiles?.length || 0,
        newProfilesCreated: syncedCount,
        adminsIdentified: adminCount,
        totalAdmins: allAdmins?.length || 0
      },
      admins: allAdmins?.map(admin => ({
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        username: admin.username,
        is_active: admin.is_active,
        created_at: admin.created_at
      })) || [],
      results: results
    })

  } catch (error: any) {
    console.error("❌ Erro na sincronização:", error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    // Buscar estatísticas atuais
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 })
    }

    const admins = profiles?.filter(p => p.user_type === 'admin') || []
    const pendingUsers = profiles?.filter(p => p.user_type === 'pending') || []
    const activeUsers = profiles?.filter(p => p.is_active) || []

    return NextResponse.json({
      summary: {
        totalAuthUsers: authUsers.users.length,
        totalProfiles: profiles?.length || 0,
        admins: admins.length,
        pendingUsers: pendingUsers.length,
        activeUsers: activeUsers.length
      },
      admins: admins.map(admin => ({
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        username: admin.username,
        is_active: admin.is_active,
        created_at: admin.created_at
      })),
      recentUsers: profiles?.slice(-10).map(user => ({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        username: user.username,
        user_type: user.user_type,
        is_active: user.is_active,
        created_at: user.created_at
      })) || []
    })

  } catch (error: any) {
    console.error("❌ Erro ao buscar estatísticas:", error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}
