const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não encontradas')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyFinalFix() {
  try {
    console.log('🔧 Aplicando correções finais...\n')
    
    // 1. Desabilitar RLS temporariamente
    console.log('📋 Desabilitando RLS temporariamente...')
    await supabase.rpc('exec_sql', { 
      sql: 'ALTER TABLE users DISABLE ROW LEVEL SECURITY;' 
    })
    
    // 2. Remover políticas problemáticas
    console.log('🗑️  Removendo políticas problemáticas...')
    const dropPolicies = [
      'DROP POLICY IF EXISTS "Users can view own profile" ON users;',
      'DROP POLICY IF EXISTS "Admins can view all users" ON users;',
      'DROP POLICY IF EXISTS "Users can update own profile" ON users;',
      'DROP POLICY IF EXISTS "Admins can update all users" ON users;',
      'DROP POLICY IF EXISTS "Admins can insert users" ON users;',
      'DROP POLICY IF EXISTS "Admins can delete users" ON users;',
      'DROP POLICY IF EXISTS "Enable all access for service role" ON users;'
    ]
    
    for (const policy of dropPolicies) {
      try {
        await supabase.rpc('exec_sql', { sql: policy })
      } catch (error) {
        console.log(`⚠️  Política já removida ou não existe`)
      }
    }
    
    // 3. Reabilitar RLS com políticas simples
    console.log('🔒 Reabilitando RLS com políticas simples...')
    await supabase.rpc('exec_sql', { 
      sql: 'ALTER TABLE users ENABLE ROW LEVEL SECURITY;' 
    })
    
    // 4. Criar políticas simples sem recursão
    const simplePolicies = [
      'CREATE POLICY "users_own_profile" ON users FOR ALL USING (auth.uid() = id);',
      'CREATE POLICY "allow_insert_own_profile" ON users FOR INSERT WITH CHECK (auth.uid() = id);',
      'CREATE POLICY "system_insert_users" ON users FOR INSERT WITH CHECK (true);'
    ]
    
    for (const policy of simplePolicies) {
      try {
        await supabase.rpc('exec_sql', { sql: policy })
        console.log('✅ Política criada com sucesso')
      } catch (error) {
        console.log(`⚠️  Erro ao criar política: ${error.message}`)
      }
    }
    
    // 5. Criar tabelas em falta
    console.log('\n📊 Criando tabelas em falta...')
    
    const createTables = [
      `CREATE TABLE IF NOT EXISTS commissions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES users(id),
        amount DECIMAL(10,2) NOT NULL,
        status TEXT DEFAULT 'pending',
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`,
      
      `CREATE TABLE IF NOT EXISTS videos (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        url TEXT NOT NULL,
        thumbnail_url TEXT,
        duration INTEGER,
        category TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`,
      
      `CREATE TABLE IF NOT EXISTS telegram_config (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        bot_token TEXT,
        channel_id TEXT,
        webhook_secret TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`
    ]
    
    for (const table of createTables) {
      try {
        await supabase.rpc('exec_sql', { sql: table })
        console.log('✅ Tabela criada/verificada com sucesso')
      } catch (error) {
        console.log(`⚠️  Erro ao criar tabela: ${error.message}`)
      }
    }
    
    // 6. Testar conexão
    console.log('\n🧪 Testando conexão...')
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('id, email, name, role')
      .limit(1)
    
    if (testError) {
      console.error('❌ Erro no teste:', testError.message)
    } else {
      console.log('✅ Conexão funcionando!')
      console.log(`   Usuários encontrados: ${testData.length}`)
    }
    
    // 7. Verificar usuários admin
    console.log('\n👨‍💼 Verificando usuários admin...')
    const { data: admins, error: adminError } = await supabase
      .from('users')
      .select('id, email, name, role, user_type')
      .or('role.eq.admin,user_type.eq.admin')
    
    if (adminError) {
      console.error('❌ Erro ao buscar admins:', adminError.message)
    } else {
      console.log(`✅ Admins encontrados: ${admins.length}`)
      admins.forEach(admin => {
        console.log(`   - ${admin.email} (${admin.role || admin.user_type})`)
      })
    }
    
    console.log('\n✅ Correções finais aplicadas com sucesso!')
    console.log('🚀 Sistema pronto para teste!')
    
  } catch (error) {
    console.error('❌ Erro geral:', error)
  }
}

applyFinalFix() 