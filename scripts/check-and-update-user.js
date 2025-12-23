const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não encontradas')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkAndUpdateUser() {
  try {
    console.log('🔍 Verificando usuário existente...')
    
    // Buscar usuário na auth
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      console.error('❌ Erro ao listar usuários:', authError)
      return
    }

    const user = authData.users.find(u => u.email === 'test@example.com')
    
    if (!user) {
      console.error('❌ Usuário não encontrado na auth')
      return
    }

    console.log('✅ Usuário encontrado na auth:', user.id)

    // Verificar se está na tabela users
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'test@example.com')
      .single()

    if (userError) {
      console.log('⚠️ Usuário não encontrado na tabela users, inserindo...')
      
      const { data: insertData, error: insertError } = await supabase
        .from('users')
        .insert({
          id: user.id,
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
    } else {
      console.log('✅ Usuário já existe na tabela users:', userData.id)
      
      // Atualizar se necessário
      const { data: updateData, error: updateError } = await supabase
        .from('users')
        .update({
          email: 'test@example.com',
          name: 'Test User',
          role: 'member',
          user_type: 'member',
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('email', 'test@example.com')
        .select()
        .single()

      if (updateError) {
        console.error('❌ Erro ao atualizar usuário:', updateError)
        return
      }

      console.log('✅ Usuário atualizado na tabela users:', updateData.id)
    }

    console.log('🎉 Usuário configurado com sucesso!')
    console.log('📧 Email: test@example.com')
    console.log('🔑 Password: Superacao2022#')
    console.log('👤 Role: member')

  } catch (error) {
    console.error('❌ Erro geral:', error)
  }
}

checkAndUpdateUser() 