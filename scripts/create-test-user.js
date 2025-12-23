const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não encontradas')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createTestUser() {
  try {
    console.log('🔄 Criando usuário de teste...')
    
    // Criar usuário na auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'ricardogarciapt@proton.me',
      password: 'Superacao2022#',
      email_confirm: true,
      user_metadata: {
        name: 'Ricardo Garcia',
        role: 'member'
      }
    })

    if (authError) {
      console.error('❌ Erro ao criar usuário na auth:', authError)
      return
    }

    console.log('✅ Usuário criado na auth:', authData.user.id)

    // Inserir na tabela users
    const testUser = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'test@example.com',
      name: 'Test User',
      role: 'member',
      user_type: 'member',
      is_active: true,
      created_at: new Date().toISOString()
    }

    const { data: insertData, error: insertError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email: 'test@example.com',
        name: 'Test User',
        role: 'member',
        user_type: 'member',
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('❌ Erro ao inserir na tabela users:', insertError)
      return
    }

    console.log('✅ Usuário inserido na tabela users:', insertData.id)
    console.log('🎉 Usuário de teste criado com sucesso!')
    console.log('📧 Email: test@example.com')
    console.log('🔑 Password: Superacao2022#')
    console.log('👤 Role: member')

  } catch (error) {
    console.error('❌ Erro geral:', error)
  }
}

createTestUser() 