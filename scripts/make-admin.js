#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente não configuradas')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function makeAdmin(email) {
  console.log(`\n🔧 Tornando ${email} admin...\n`)

  try {
    // 1. Verificar se o usuário existe
    const { data: users, error: userError } = await supabase.auth.admin.listUsers()
    
    if (userError) {
      throw userError
    }

    const user = users.users.find(u => u.email === email)
    
    if (!user) {
      console.error(`❌ Usuário ${email} não encontrado`)
      return
    }

    console.log(`✅ Usuário encontrado: ${user.email} (${user.id})`)

    // 2. Atualizar perfil para admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .update({
        user_type: 'admin',
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select()
      .single()

    if (profileError) {
      throw profileError
    }

    console.log(`✅ Perfil atualizado:`, profile)
    console.log(`\n🎉 ${email} agora é admin!`)
    console.log(`\n📍 Acesse: http://localhost:3000/admin\n`)

  } catch (error) {
    console.error('❌ Erro:', error.message)
  }
}

// Usar email do argumento ou padrão
const email = process.argv[2] || 'morethanmoneypt@gmail.com'
makeAdmin(email)

