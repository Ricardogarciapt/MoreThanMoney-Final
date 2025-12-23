const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não encontradas')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createAdminUser() {
  try {
    console.log('🔄 Criando usuário admin...')
    
    const adminEmail = 'admin@morethanmoney.com'
    const adminPassword = 'Admin2024#'
    const adminName = 'Administrador'
    
    // Criar usuário na auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        name: adminName,
        role: 'admin'
      }
    })

    if (authError) {
      console.error('❌ Erro ao criar usuário na auth:', authError)
      return
    }

    console.log('✅ Usuário criado na auth:', authData.user.id)

    // Inserir na tabela users
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email: adminEmail,
        name: adminName,
        role: 'admin',
        user_type: 'admin',
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (userError) {
      console.error('❌ Erro ao inserir na tabela users:', userError)
      return
    }

    console.log('✅ Usuário inserido na tabela users:', userData.id)
    console.log('🎉 Usuário admin criado com sucesso!')
    console.log('📧 Email:', adminEmail)
    console.log('🔑 Password:', adminPassword)
    console.log('👤 Role: admin')

  } catch (error) {
    console.error('❌ Erro geral:', error)
  }
}

createAdminUser() 