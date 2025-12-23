#!/usr/bin/env node

/**
 * Script de diagnóstico completo do sistema de autenticação
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log('\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║         DIAGNÓSTICO COMPLETO DE AUTENTICAÇÃO                  ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

console.log('📋 1. VERIFICANDO VARIÁVEIS DE AMBIENTE...\n')
console.log(`NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✅' : '❌'}`)
console.log(`SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? '✅' : '❌'}`)
console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✅' : '❌'}`)

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('\n❌ Variáveis de ambiente não configuradas!')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function main() {
  try {
    // 2. Verificar conexão com Supabase
    console.log('\n📋 2. TESTANDO CONEXÃO COM SUPABASE...\n')
    
    const { data, error } = await supabase.from('profiles').select('count').limit(1)
    if (error) throw error
    console.log('✅ Conexão com Supabase OK\n')

    // 3. Listar providers OAuth configurados
    console.log('📋 3. PROVIDERS OAUTH CONFIGURADOS...\n')
    
    // Não há endpoint direto para listar providers, mas podemos verificar a configuração
    console.log('ℹ️  Para verificar providers OAuth:')
    console.log('   1. Acesse: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/auth/providers')
    console.log('   2. Verifique se Google está habilitado')
    console.log('   3. Verifique Redirect URLs\n')

    // 4. Verificar admin
    console.log('📋 4. VERIFICANDO USUÁRIO ADMIN...\n')
    
    const adminEmail = 'ricardogarciapt@proton.me'
    
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers()
    if (listError) throw listError
    
    const adminUser = authUsers.users.find(u => u.email === adminEmail)
    
    if (adminUser) {
      console.log(`✅ Admin encontrado:`)
      console.log(`   ID: ${adminUser.id}`)
      console.log(`   Email: ${adminUser.email}`)
      console.log(`   Email confirmado: ${adminUser.email_confirmed_at ? '✅' : '❌'}`)
      console.log(`   Último login: ${adminUser.last_sign_in_at || 'Nunca'}`)
      
      // Verificar perfil
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', adminUser.id)
        .single()
      
      if (profile) {
        console.log(`\n   Perfil:`)
        console.log(`   - Username: ${profile.username}`)
        console.log(`   - Tipo: ${profile.user_type}`)
        console.log(`   - Ativo: ${profile.is_active ? '✅' : '❌'}`)
      } else {
        console.log(`\n   ⚠️ Perfil não encontrado!`)
      }
    } else {
      console.log(`❌ Admin não encontrado!`)
    }

    // 5. Testar login com credenciais
    console.log('\n📋 5. TESTANDO LOGIN COM EMAIL/PASSWORD...\n')
    
    const testClient = createClient(supabaseUrl, supabaseAnonKey)
    
    const { data: loginData, error: loginError } = await testClient.auth.signInWithPassword({
      email: adminEmail,
      password: 'Superacao2022#'
    })
    
    if (loginError) {
      console.log(`❌ Erro no login: ${loginError.message}`)
    } else {
      console.log(`✅ Login bem-sucedido!`)
      console.log(`   Sessão criada: ${!!loginData.session}`)
      console.log(`   User ID: ${loginData.user?.id}`)
    }

    // 6. Verificar configuração OAuth
    console.log('\n📋 6. VERIFICANDO CONFIGURAÇÃO OAUTH...\n')
    
    console.log('⚠️  URLs que devem estar configuradas no Google OAuth:')
    console.log('   Authorized JavaScript origins:')
    console.log('   - http://localhost:3002')
    console.log('   - https://seu-dominio.com')
    console.log('')
    console.log('   Authorized redirect URIs:')
    console.log('   - http://localhost:3002/auth/callback')
    console.log('   - https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback')
    console.log('   - https://seu-dominio.com/auth/callback')

    // 7. Verificar estrutura da tabela profiles
    console.log('\n📋 7. VERIFICANDO ESTRUTURA DA TABELA PROFILES...\n')
    
    const { data: profileSample } = await supabase
      .from('profiles')
      .select('*')
      .limit(1)
      .single()
    
    if (profileSample) {
      console.log('✅ Colunas na tabela profiles:')
      Object.keys(profileSample).forEach(col => {
        console.log(`   - ${col}`)
      })
    }

    // 8. Resumo de problemas comuns
    console.log('\n╔═══════════════════════════════════════════════════════════════╗')
    console.log('║              PROBLEMAS COMUNS E SOLUÇÕES                      ║')
    console.log('╚═══════════════════════════════════════════════════════════════╝\n')
    
    console.log('❌ PROBLEMA 1: Google OAuth fica "processando"')
    console.log('   ✅ SOLUÇÃO:')
    console.log('      1. Verifique Redirect URLs no Supabase')
    console.log('      2. Adicione: http://localhost:3002/auth/callback')
    console.log('      3. No Google Console, adicione mesmas URLs\n')
    
    console.log('❌ PROBLEMA 2: "Credenciais inválidas" no login')
    console.log('   ✅ SOLUÇÃO:')
    console.log('      1. Verifique se email está confirmado (✅ acima)')
    console.log('      2. Teste com credenciais:')
    console.log('         Email: ricardogarciapt@proton.me')
    console.log('         Senha: Superacao2022#\n')
    
    console.log('❌ PROBLEMA 3: Perfil não encontrado após login')
    console.log('   ✅ SOLUÇÃO:')
    console.log('      1. AuthContext cria perfil automaticamente')
    console.log('      2. Callback também cria se não existir')
    console.log('      3. Verifique logs no console do navegador\n')

    console.log('╔═══════════════════════════════════════════════════════════════╗')
    console.log('║                    TESTES RECOMENDADOS                        ║')
    console.log('╚═══════════════════════════════════════════════════════════════╝\n')
    
    console.log('🧪 TESTE 1: Login com Email/Password')
    console.log('   URL: http://localhost:3002/test-auth')
    console.log('   Email: ricardogarciapt@proton.me')
    console.log('   Senha: Superacao2022#\n')
    
    console.log('🧪 TESTE 2: Login com Google')
    console.log('   URL: http://localhost:3002/login')
    console.log('   Clique em "Continuar com Google"')
    console.log('   Veja logs no console (F12)\n')
    
    console.log('🧪 TESTE 3: Verificar Callback')
    console.log('   Após login Google, você será redirecionado para:')
    console.log('   http://localhost:3002/auth/callback?code=...')
    console.log('   Veja logs detalhados no console\n')

    console.log('✅ DIAGNÓSTICO CONCLUÍDO!\n')

  } catch (error) {
    console.error('\n❌ ERRO NO DIAGNÓSTICO:', error.message)
    console.error(error)
    process.exit(1)
  }
}

main()

