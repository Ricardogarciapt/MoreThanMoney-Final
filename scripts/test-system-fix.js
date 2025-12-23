const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Variáveis de ambiente não encontradas')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testSystem() {
  console.log('🧪 Testando sistema completo...\n')
  
  let testsPassed = 0
  let totalTests = 0

  // Teste 1: Conexão com Supabase
  totalTests++
  try {
    const { data, error } = await supabase.from('users').select('count').limit(1)
    if (error) throw error
    console.log('✅ Teste 1: Conexão com Supabase - PASSOU')
    testsPassed++
  } catch (error) {
    console.log('❌ Teste 1: Conexão com Supabase - FALHOU')
    console.error('   Erro:', error.message)
  }

  // Teste 2: Login de membro
  totalTests++
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_MEMBER_EMAIL || 'test@example.com',
      password: process.env.TEST_MEMBER_PASSWORD || 'test123'
    })
    
    if (error) throw error
    
    console.log('✅ Teste 2: Login de membro - PASSOU')
    console.log(`   Usuário: ${data.user.email}`)
    testsPassed++
    
    // Fazer logout
    await supabase.auth.signOut()
  } catch (error) {
    console.log('❌ Teste 2: Login de membro - FALHOU')
    console.error('   Erro:', error.message)
  }

  // Teste 3: Login de admin
  totalTests++
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.TEST_ADMIN_PASSWORD || 'admin123'
    })
    
    if (error) throw error
    
    // Verificar se é admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single()
    
    if (userError || userData?.role !== 'admin') {
      throw new Error('Usuário não é admin')
    }
    
    console.log('✅ Teste 3: Login de admin - PASSOU')
    console.log(`   Admin: ${data.user.email}`)
    testsPassed++
    
    // Fazer logout
    await supabase.auth.signOut()
  } catch (error) {
    console.log('❌ Teste 3: Login de admin - FALHOU')
    console.error('   Erro:', error.message)
  }

  // Teste 4: Verificar tabelas principais
  totalTests++
  try {
    const tables = ['users', 'materials', 'commissions', 'products', 'videos', 'telegram_config']
    let allTablesExist = true
    
    for (const table of tables) {
      const { error } = await supabase.from(table).select('count').limit(1)
      if (error) {
        console.log(`   ❌ Tabela ${table} não existe`)
        allTablesExist = false
      }
    }
    
    if (allTablesExist) {
      console.log('✅ Teste 4: Tabelas principais - PASSOU')
      testsPassed++
    } else {
      throw new Error('Algumas tabelas não existem')
    }
  } catch (error) {
    console.log('❌ Teste 4: Tabelas principais - FALHOU')
    console.error('   Erro:', error.message)
  }

  // Teste 5: Verificar usuários na base
  totalTests++
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, role, user_type')
      .limit(10)
    
    if (error) throw error
    
    console.log('✅ Teste 5: Usuários na base - PASSOU')
    console.log(`   Total de usuários: ${users.length}`)
    users.forEach(user => {
      console.log(`   - ${user.email} (${user.role || user.user_type})`)
    })
    testsPassed++
  } catch (error) {
    console.log('❌ Teste 5: Usuários na base - FALHOU')
    console.error('   Erro:', error.message)
  }

  // Teste 6: Verificar materiais
  totalTests++
  try {
    const { data: materials, error } = await supabase
      .from('materials')
      .select('*')
      .limit(5)
    
    if (error) throw error
    
    console.log('✅ Teste 6: Materiais - PASSOU')
    console.log(`   Total de materiais: ${materials.length}`)
    testsPassed++
  } catch (error) {
    console.log('❌ Teste 6: Materiais - FALHOU')
    console.error('   Erro:', error.message)
  }

  // Teste 7: Verificar produtos
  totalTests++
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .limit(5)
    
    if (error) throw error
    
    console.log('✅ Teste 7: Produtos - PASSOU')
    console.log(`   Total de produtos: ${products.length}`)
    testsPassed++
  } catch (error) {
    console.log('❌ Teste 7: Produtos - FALHOU')
    console.error('   Erro:', error.message)
  }

  // Teste 8: Verificar configuração do Telegram
  totalTests++
  try {
    const { data: telegramConfig, error } = await supabase
      .from('telegram_config')
      .select('*')
      .limit(1)
    
    if (error) throw error
    
    console.log('✅ Teste 8: Configuração Telegram - PASSOU')
    console.log(`   Configurações: ${telegramConfig.length}`)
    testsPassed++
  } catch (error) {
    console.log('❌ Teste 8: Configuração Telegram - FALHOU')
    console.error('   Erro:', error.message)
  }

  // Teste 9: Verificar variáveis de ambiente
  totalTests++
  try {
    const requiredVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHANNEL_ID',
      'YOUTUBE_API_KEY'
    ]
    
    let allVarsExist = true
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        console.log(`   ❌ Variável ${varName} não encontrada`)
        allVarsExist = false
      }
    }
    
    if (allVarsExist) {
      console.log('✅ Teste 9: Variáveis de ambiente - PASSOU')
      testsPassed++
    } else {
      throw new Error('Variáveis de ambiente em falta')
    }
  } catch (error) {
    console.log('❌ Teste 9: Variáveis de ambiente - FALHOU')
    console.error('   Erro:', error.message)
  }

  // Teste 10: Verificar estrutura da tabela users
  totalTests++
  try {
    const { data: userStructure, error } = await supabase
      .from('users')
      .select('*')
      .limit(1)
    
    if (error) throw error
    
    const expectedFields = ['id', 'email', 'name', 'role', 'user_type', 'is_active']
    const actualFields = Object.keys(userStructure[0] || {})
    
    const missingFields = expectedFields.filter(field => !actualFields.includes(field))
    
    if (missingFields.length === 0) {
      console.log('✅ Teste 10: Estrutura da tabela users - PASSOU')
      testsPassed++
    } else {
      throw new Error(`Campos em falta: ${missingFields.join(', ')}`)
    }
  } catch (error) {
    console.log('❌ Teste 10: Estrutura da tabela users - FALHOU')
    console.error('   Erro:', error.message)
  }

  // Resumo final
  console.log('\n📊 RESUMO DOS TESTES')
  console.log('=' * 50)
  console.log(`✅ Testes passados: ${testsPassed}/${totalTests}`)
  console.log(`❌ Testes falhados: ${totalTests - testsPassed}/${totalTests}`)
  console.log(`📈 Taxa de sucesso: ${((testsPassed / totalTests) * 100).toFixed(1)}%`)
  
  if (testsPassed === totalTests) {
    console.log('\n🎉 SISTEMA 100% FUNCIONAL!')
    console.log('🚀 Pronto para produção!')
  } else {
    console.log('\n⚠️  ALGUNS PROBLEMAS DETETADOS')
    console.log('🔧 Verifique os erros acima e corrija antes de ir para produção')
  }

  console.log('\n📋 CREDENCIAIS DE TESTE:')
  console.log('👤 Membro: [email] / [password]')
  console.log('👨‍💼 Admin: [email] / [password]')
}

testSystem() 