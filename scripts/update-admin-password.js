#!/usr/bin/env node

/**
 * Script para atualizar a senha do admin
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não configuradas!')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function updateAdminPassword() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗')
  console.log('║         ATUALIZAR SENHA DO ADMIN                              ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝\n')

  const adminEmail = 'ricardogarciapt@proton.me'
  const newPassword = 'Superacao2022#'

  try {
    // 1. Buscar usuário
    console.log(`🔍 Buscando usuário: ${adminEmail}`)
    
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers()
    
    if (listError) {
      throw listError
    }

    const adminUser = authUsers.users.find(u => u.email === adminEmail)

    if (!adminUser) {
      console.error(`❌ Usuário ${adminEmail} não encontrado!`)
      process.exit(1)
    }

    console.log(`✅ Usuário encontrado: ${adminUser.id}`)

    // 2. Atualizar senha
    console.log('\n🔐 Atualizando senha...')
    
    const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
      adminUser.id,
      { 
        password: newPassword,
        email_confirm: true
      }
    )

    if (updateError) {
      throw updateError
    }

    console.log('✅ Senha atualizada com sucesso!\n')

    // 3. Verificar perfil
    console.log('🔍 Verificando perfil...')
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', adminUser.id)
      .single()

    if (profileError) {
      console.error('❌ Erro ao buscar perfil:', profileError.message)
    } else {
      console.log(`✅ Perfil encontrado:`)
      console.log(`   Email: ${profile.email}`)
      console.log(`   Username: ${profile.username}`)
      console.log(`   Tipo: ${profile.user_type}`)
      console.log(`   Ativo: ${profile.is_active ? '✅' : '❌'}`)
      
      // Garantir que é admin
      if (profile.user_type !== 'admin') {
        console.log('\n⚠️ Atualizando tipo de usuário para admin...')
        
        const { error: updateProfileError } = await supabase
          .from('profiles')
          .update({ user_type: 'admin', is_active: true })
          .eq('id', adminUser.id)

        if (updateProfileError) {
          console.error('❌ Erro ao atualizar perfil:', updateProfileError.message)
        } else {
          console.log('✅ Perfil atualizado para admin')
        }
      }
    }

    console.log('\n╔═══════════════════════════════════════════════════════════════╗')
    console.log('║                    RESUMO                                     ║')
    console.log('╚═══════════════════════════════════════════════════════════════╝\n')
    console.log(`📧 Email: ${adminEmail}`)
    console.log(`🔑 Senha: ${newPassword}`)
    console.log(`👤 Tipo: admin`)
    console.log(`✅ Status: Ativo\n`)
    console.log('🧪 TESTE AGORA:')
    console.log('   1. http://localhost:3002/test-auth')
    console.log('   2. Use as credenciais acima')
    console.log('   3. Verifique os logs no console\n')

  } catch (error) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error)
    process.exit(1)
  }
}

updateAdminPassword()

