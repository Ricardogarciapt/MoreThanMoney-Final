import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface User {
  id: string
  email: string
  full_name?: string
  username?: string
  user_type: string
  is_active: boolean
  is_verified: boolean
  created_at: string
  updated_at?: string
}

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

async function syncUsers() {
  try {
    console.log("🔄 Iniciando sincronização de utilizadores...")

    // 1. Buscar todos os utilizadores do Auth
    console.log("📋 Buscando utilizadores do Supabase Auth...")
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      console.error("❌ Erro ao buscar utilizadores do Auth:", authError)
      return
    }

    console.log(`✅ Encontrados ${authUsers.users.length} utilizadores no Auth`)

    // 2. Buscar todos os perfis existentes na tabela profiles
    console.log("📋 Buscando perfis existentes na tabela profiles...")
    const { data: existingProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')

    if (profilesError) {
      console.error("❌ Erro ao buscar perfis existentes:", profilesError)
      return
    }

    console.log(`✅ Encontrados ${existingProfiles?.length || 0} perfis existentes`)

    const existingProfileIds = new Set(existingProfiles?.map(p => p.id) || [])

    // 3. Identificar admins existentes
    console.log("👑 Identificando admins existentes...")
    const adminUsers = authUsers.users.filter(user => 
      user.user_metadata?.user_type === 'admin' || 
      user.email === 'ricardogarciapt@proton.me' ||
      user.email === 'morethanmoneypt@gmail.com'
    )

    console.log(`👑 Encontrados ${adminUsers.length} admins:`)
    adminUsers.forEach(admin => {
      console.log(`   - ${admin.email} (${admin.user_metadata?.user_type || 'admin'})`)
    })

    // 4. Sincronizar utilizadores que não têm perfil
    let syncedCount = 0
    let adminCount = 0

    for (const authUser of authUsers.users) {
      if (!existingProfileIds.has(authUser.id)) {
        console.log(`🔄 Sincronizando utilizador: ${authUser.email}`)
        
        // Determinar tipo de utilizador
        let userType = 'member'
        let isActive = true
        let isVerified = !!authUser.email_confirmed_at

        // Verificar se é admin
        if (adminUsers.some(admin => admin.id === authUser.id)) {
          userType = 'admin'
          adminCount++
        }

        // Criar perfil do utilizador
        const profileData = {
          id: authUser.id,
          email: authUser.email || '',
          full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Utilizador',
          username: authUser.user_metadata?.username || authUser.email?.split('@')[0] || `user_${Math.random().toString(36).substr(2, 9)}`,
          user_type: userType,
          membership_level: 'basic',
          is_active: isActive,
          is_verified: isVerified,
          created_at: authUser.created_at,
          updated_at: new Date().toISOString()
        }

        const { error: insertError } = await supabase
          .from('profiles')
          .insert(profileData)

        if (insertError) {
          console.error(`❌ Erro ao criar perfil para ${authUser.email}:`, insertError)
        } else {
          console.log(`✅ Perfil criado para ${authUser.email} (${userType})`)
          syncedCount++
        }
      }
    }

    // 5. Atualizar admins existentes se necessário
    console.log("👑 Verificando se admins existentes têm o tipo correto...")
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
          console.error(`❌ Erro ao atualizar admin ${admin.email}:`, updateError)
        } else {
          console.log(`✅ Admin ${admin.email} atualizado`)
        }
      }
    }

    // 6. Criar configurações padrão se não existirem
    console.log("⚙️ Verificando configurações do sistema...")
    const { data: settings, error: settingsError } = await supabase
      .from('admin_settings')
      .select('*')

    if (settingsError) {
      console.log("⚠️ Tabela admin_settings não existe ainda. Execute o script SQL primeiro.")
    } else if (!settings || settings.length === 0) {
      console.log("⚙️ Criando configurações padrão...")
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
        const { error: insertError } = await supabase
          .from('admin_settings')
          .insert(setting)

        if (insertError) {
          console.error(`❌ Erro ao criar configuração ${setting.setting_key}:`, insertError)
        } else {
          console.log(`✅ Configuração ${setting.setting_key} criada`)
        }
      }
    }

    // 7. Resumo final
    console.log("\n🎉 Sincronização concluída!")
    console.log(`📊 Estatísticas:`)
    console.log(`   - Total de utilizadores no Auth: ${authUsers.users.length}`)
    console.log(`   - Perfis existentes: ${existingProfiles?.length || 0}`)
    console.log(`   - Novos perfis criados: ${syncedCount}`)
    console.log(`   - Admins identificados: ${adminCount}`)
    console.log(`   - Admins totais (incluindo existentes): ${adminUsers.length}`)

    // 8. Listar todos os admins
    console.log("\n👑 Lista de Administradores:")
    const { data: allAdmins, error: adminError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_type', 'admin')

    if (!adminError && allAdmins) {
      allAdmins.forEach((admin, index) => {
        console.log(`   ${index + 1}. ${admin.full_name || admin.username} (${admin.email}) - ${admin.is_active ? 'Ativo' : 'Inativo'}`)
      })
    }

  } catch (error) {
    console.error("❌ Erro geral na sincronização:", error)
  }
}

// Executar sincronização
syncUsers()
  .then(() => {
    console.log("\n✅ Script de sincronização concluído!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Erro no script:", error)
    process.exit(1)
  })
