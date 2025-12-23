#!/usr/bin/env node

/**
 * Script para corrigir autenticação e sincronizar auth.users com profiles
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não configuradas!')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅' : '❌')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗')
  console.log('║         FIX AUTENTICAÇÃO - SUPABASE                           ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝\n')

  try {
    // 1. Listar usuários do auth
    console.log('📋 1. LISTANDO USUÁRIOS DO AUTH...\n')
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      console.error('❌ Erro ao listar usuários:', authError.message)
      return
    }

    console.log(`✅ Total de usuários no auth: ${authUsers.users.length}\n`)
    authUsers.users.forEach((user, i) => {
      console.log(`${i + 1}. ${user.email}`)
      console.log(`   ID: ${user.id}`)
      console.log(`   Confirmado: ${user.email_confirmed_at ? '✅' : '❌'}`)
      console.log(`   Criado em: ${new Date(user.created_at).toLocaleString('pt-PT')}`)
      console.log(`   Nome: ${user.user_metadata?.full_name || user.user_metadata?.name || 'N/A'}`)
      console.log('')
    })

    // 2. Listar perfis
    console.log('📋 2. LISTANDO PERFIS...\n')
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (profilesError) {
      console.error('❌ Erro ao listar perfis:', profilesError.message)
      return
    }

    console.log(`✅ Total de perfis: ${profiles.length}\n`)
    profiles.forEach((profile, i) => {
      console.log(`${i + 1}. ${profile.email}`)
      console.log(`   ID: ${profile.id}`)
      console.log(`   Username: ${profile.username}`)
      console.log(`   Tipo: ${profile.user_type}`)
      console.log(`   Ativo: ${profile.is_active ? '✅' : '❌'}`)
      console.log('')
    })

    // 3. Encontrar usuários sem perfil
    console.log('🔍 3. VERIFICANDO USUÁRIOS SEM PERFIL...\n')
    const usersWithoutProfile = []
    
    for (const user of authUsers.users) {
      const hasProfile = profiles.some(p => p.id === user.id)
      if (!hasProfile) {
        usersWithoutProfile.push(user)
      }
    }

    if (usersWithoutProfile.length > 0) {
      console.log(`⚠️ Encontrados ${usersWithoutProfile.length} usuários sem perfil:\n`)
      usersWithoutProfile.forEach((user, i) => {
        console.log(`${i + 1}. ${user.email} (ID: ${user.id})`)
      })
      console.log('')

      // 4. Criar perfis faltantes
      console.log('📝 4. CRIANDO PERFIS FALTANTES...\n')
      
      for (const user of usersWithoutProfile) {
        let username = user.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()
        
        if (!username || username.length < 3) {
          username = `user${Date.now()}`
        }

        // Verificar se username já existe
        let usernameExists = profiles.some(p => p.username === username)
        let attempts = 0
        while (usernameExists && attempts < 10) {
          username = `${username}${Math.floor(Math.random() * 100)}`
          usernameExists = profiles.some(p => p.username === username)
          attempts++
        }

        const profileData = {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || 'Utilizador',
          username: username,
          user_type: 'member',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }

        const { error: insertError } = await supabase
          .from('profiles')
          .insert([profileData])

        if (insertError) {
          console.error(`❌ Erro ao criar perfil para ${user.email}:`, insertError.message)
        } else {
          console.log(`✅ Perfil criado para ${user.email} (username: ${username})`)
          profiles.push(profileData) // Adicionar à lista local
        }
      }
      console.log('')
    } else {
      console.log('✅ Todos os usuários já possuem perfis!\n')
    }

    // 5. Confirmar emails não confirmados
    console.log('📧 5. CONFIRMANDO EMAILS NÃO CONFIRMADOS...\n')
    
    let confirmedCount = 0
    for (const user of authUsers.users) {
      if (!user.email_confirmed_at) {
        const { error: confirmError } = await supabase.auth.admin.updateUserById(
          user.id,
          { email_confirm: true }
        )

        if (confirmError) {
          console.error(`❌ Erro ao confirmar email de ${user.email}:`, confirmError.message)
        } else {
          console.log(`✅ Email confirmado para ${user.email}`)
          confirmedCount++
        }
      }
    }

    if (confirmedCount > 0) {
      console.log(`\n✅ ${confirmedCount} emails confirmados com sucesso!\n`)
    } else {
      console.log('✅ Todos os emails já estavam confirmados!\n')
    }

    // 6. Resumo final
    console.log('╔═══════════════════════════════════════════════════════════════╗')
    console.log('║                    RESUMO FINAL                               ║')
    console.log('╚═══════════════════════════════════════════════════════════════╝\n')
    console.log(`📊 Total de usuários no auth: ${authUsers.users.length}`)
    console.log(`📊 Total de perfis: ${profiles.length}`)
    console.log(`📊 Perfis criados: ${usersWithoutProfile.length}`)
    console.log(`📊 Emails confirmados: ${confirmedCount}`)
    console.log('\n✅ SCRIPT CONCLUÍDO COM SUCESSO!\n')

  } catch (error) {
    console.error('\n❌ ERRO FATAL:', error.message)
    console.error(error)
    process.exit(1)
  }
}

main()

