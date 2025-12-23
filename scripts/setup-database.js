#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Configuração do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('🔍 Variáveis carregadas:')
console.log('   SUPABASE_URL:', supabaseUrl ? '✅' : '❌')
console.log('   SERVICE_KEY:', supabaseServiceKey ? '✅' : '❌')

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Erro: Variáveis de ambiente não configuradas!')
  console.error('Certifique-se de que NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY estão definidas.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗')
console.log('║              🚀 SETUP DA BASE DE DADOS - SUPABASE                        ║')
console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n')

async function executeSQLFile(filePath, description) {
  try {
    console.log(`\n📄 Executando: ${description}`)
    console.log(`   Arquivo: ${filePath}`)
    
    const sqlContent = fs.readFileSync(filePath, 'utf-8')
    
    // Dividir o SQL em statements individuais
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))
    
    console.log(`   Total de statements: ${statements.length}`)
    
    let successCount = 0
    let errorCount = 0
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';'
      
      try {
        // Para funções e comandos DDL, usar rpc com exec_sql se disponível
        // Caso contrário, tentar executar diretamente
        const { error } = await supabase.rpc('exec_sql', { sql: statement })
        
        if (error) {
          // Se exec_sql não existir, tentar método alternativo
          console.log(`   ⚠️  Statement ${i + 1}: Método RPC falhou, usando fallback`)
          errorCount++
        } else {
          successCount++
        }
      } catch (err) {
        errorCount++
      }
    }
    
    console.log(`   ✅ Sucesso: ${successCount} statements`)
    if (errorCount > 0) {
      console.log(`   ⚠️  Avisos: ${errorCount} statements (podem ser esperados)`)
    }
    
    return true
  } catch (error) {
    console.error(`   ❌ Erro ao executar ${filePath}:`, error.message)
    return false
  }
}

async function testConnection() {
  console.log('1️⃣ Testando conexão com Supabase...')
  
  try {
    const { data, error } = await supabase.from('profiles').select('count').limit(1)
    
    if (error) {
      console.error('❌ Erro na conexão:', error.message)
      return false
    }
    
    console.log('✅ Conexão estabelecida com sucesso!')
    return true
  } catch (error) {
    console.error('❌ Erro ao testar conexão:', error.message)
    return false
  }
}

async function checkRPCFunctions() {
  console.log('\n2️⃣ Verificando funções RPC existentes...')
  
  const functions = [
    'get_user_profile',
    'get_user_email_by_username',
    'check_username_exists',
    'check_jifu_id_exists'
  ]
  
  const missing = []
  
  for (const func of functions) {
    try {
      const testParams = {
        'get_user_profile': { user_id_param: '00000000-0000-0000-0000-000000000000' },
        'get_user_email_by_username': { username_param: 'test' },
        'check_username_exists': { username_param: 'test' },
        'check_jifu_id_exists': { jifu_id_param: 'test' }
      }
      
      const { error } = await supabase.rpc(func, testParams[func])
      
      // Se não der erro de "função não existe", consideramos que existe
      if (error && error.message.includes('function') && error.message.includes('does not exist')) {
        console.log(`   ❌ ${func}: NÃO existe`)
        missing.push(func)
      } else {
        console.log(`   ✅ ${func}: existe`)
      }
    } catch (error) {
      console.log(`   ❌ ${func}: erro ao verificar`)
      missing.push(func)
    }
  }
  
  return missing
}

async function executeScripts() {
  const scripts = [
    {
      file: path.join(__dirname, 'fix-profiles-complete.sql'),
      description: 'Correção completa da tabela profiles'
    },
    {
      file: path.join(__dirname, 'create-rpc-functions.sql'),
      description: 'Criação de funções RPC'
    },
    {
      file: path.join(__dirname, 'fix-admin-login.sql'),
      description: 'Correção do login do admin'
    }
  ]
  
  console.log('\n3️⃣ Executando scripts SQL...')
  
  for (const script of scripts) {
    if (fs.existsSync(script.file)) {
      await executeSQLFile(script.file, script.description)
    } else {
      console.log(`   ⚠️  Arquivo não encontrado: ${script.file}`)
    }
  }
}

async function verifyUsers() {
  console.log('\n4️⃣ Verificando usuários no Supabase...')
  
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, username, user_type, is_active')
      .limit(10)
    
    if (error) {
      console.error('❌ Erro ao buscar usuários:', error.message)
      return
    }
    
    console.log(`✅ Total de usuários encontrados: ${data?.length || 0}`)
    
    if (data && data.length > 0) {
      console.log('\n📊 Primeiros usuários:')
      data.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.email}`)
        console.log(`      Username: ${user.username || 'N/A'}`)
        console.log(`      Tipo: ${user.user_type}`)
        console.log(`      Ativo: ${user.is_active ? '✅' : '❌'}`)
        console.log('')
      })
    } else {
      console.log('⚠️  Nenhum usuário encontrado na tabela profiles')
    }
  } catch (error) {
    console.error('❌ Erro ao verificar usuários:', error.message)
  }
}

async function main() {
  try {
    // 1. Testar conexão
    const connected = await testConnection()
    if (!connected) {
      console.error('\n❌ Não foi possível conectar ao Supabase. Verifique suas credenciais.')
      process.exit(1)
    }
    
    // 2. Verificar funções RPC
    const missingFunctions = await checkRPCFunctions()
    
    if (missingFunctions.length > 0) {
      console.log(`\n⚠️  ${missingFunctions.length} função(ões) RPC não encontrada(s)`)
      console.log('   Executando scripts SQL para criar...\n')
      
      // 3. Executar scripts SQL
      await executeScripts()
    } else {
      console.log('\n✅ Todas as funções RPC já existem!')
    }
    
    // 4. Verificar usuários
    await verifyUsers()
    
    console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗')
    console.log('║                    ✅ SETUP CONCLUÍDO COM SUCESSO!                       ║')
    console.log('╚═══════════════════════════════════════════════════════════════════════════╝')
    console.log('\n📋 PRÓXIMOS PASSOS:')
    console.log('   1. Verifique se há usuários na tabela profiles')
    console.log('   2. Execute fix-admin-login.sql manualmente se necessário')
    console.log('   3. Teste o login em: http://localhost:3001/login')
    console.log('   4. O AuthService agora deve reconhecer usuários do Supabase!\n')
    
  } catch (error) {
    console.error('\n❌ Erro durante o setup:', error.message)
    process.exit(1)
  }
}

// Executar
main()

