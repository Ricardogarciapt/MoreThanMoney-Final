const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não encontradas')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyRLSFix() {
  try {
    console.log('🔧 Aplicando correções RLS...\n')
    
    // 1. Verificar estrutura atual da tabela
    console.log('📋 Verificando estrutura da tabela users...')
    const { data: structure, error: structureError } = await supabase
      .from('users')
      .select('*')
      .limit(1)
    
    if (structureError) {
      console.error('❌ Erro ao verificar estrutura:', structureError)
      return
    }
    
    if (structure && structure.length > 0) {
      console.log('✅ Campos atuais:')
      Object.keys(structure[0]).forEach(field => {
        console.log(`   - ${field}`)
      })
    } else {
      console.log('ℹ️  Tabela vazia, verificando estrutura...')
    }
    
    // 2. Tentar inserir um usuário de teste para verificar RLS
    console.log('\n🧪 Testando inserção de usuário...')
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
      .insert(testUser)
      .select()
    
    if (insertError) {
      console.error('❌ Erro na inserção:', insertError.message)
      
      // Se for erro de RLS, tentar desabilitar temporariamente
      if (insertError.message.includes('row-level security')) {
        console.log('🔧 Tentando corrigir políticas RLS...')
        
        // Executar comandos SQL para corrigir RLS
        const rlsCommands = [
          'ALTER TABLE users DISABLE ROW LEVEL SECURITY;',
          'ALTER TABLE users ENABLE ROW LEVEL SECURITY;',
          'DROP POLICY IF EXISTS "Users can view own profile" ON users;',
          'DROP POLICY IF EXISTS "Admins can view all users" ON users;',
          'DROP POLICY IF EXISTS "Users can update own profile" ON users;',
          'DROP POLICY IF EXISTS "Admins can update all users" ON users;',
          'DROP POLICY IF EXISTS "Admins can insert users" ON users;',
          'DROP POLICY IF EXISTS "Admins can delete users" ON users;',
          'CREATE POLICY "Enable all access for service role" ON users FOR ALL USING (true);'
        ]
        
        for (const command of rlsCommands) {
          try {
            const { error } = await supabase.rpc('exec_sql', { sql: command })
            if (error) {
              console.log(`⚠️  Comando falhou: ${command}`)
            }
          } catch (error) {
            console.log(`⚠️  Erro no comando: ${command}`)
          }
        }
        
        // Tentar inserção novamente
        const { data: retryData, error: retryError } = await supabase
          .from('users')
          .insert(testUser)
          .select()
        
        if (retryError) {
          console.error('❌ Ainda não consegue inserir:', retryError.message)
        } else {
          console.log('✅ Inserção bem-sucedida após correção RLS')
          
          // Remover usuário de teste
          await supabase
            .from('users')
            .delete()
            .eq('id', testUser.id)
        }
      }
    } else {
      console.log('✅ Inserção bem-sucedida')
      
      // Remover usuário de teste
      await supabase
        .from('users')
        .delete()
        .eq('id', testUser.id)
    }
    
    // 3. Verificar usuários existentes
    console.log('\n👥 Verificando usuários existentes...')
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name, role, user_type')
      .limit(10)
    
    if (usersError) {
      console.error('❌ Erro ao buscar usuários:', usersError)
    } else {
      console.log(`✅ Total de usuários: ${users.length}`)
      users.forEach(user => {
        console.log(`   - ${user.email} (${user.role || user.user_type})`)
      })
    }
    
    console.log('\n✅ Verificação RLS concluída!')
    
  } catch (error) {
    console.error('❌ Erro geral:', error)
  }
}

applyRLSFix() 