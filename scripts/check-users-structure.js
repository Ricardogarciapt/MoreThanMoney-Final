const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Variáveis de ambiente não encontradas')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkUsersStructure() {
  try {
    console.log('🔍 Verificando estrutura da tabela users...\n')
    
    // Tentar buscar dados da tabela
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1)
    
    if (error) {
      console.error('❌ Erro ao aceder à tabela users:', error)
      return
    }
    
    if (data && data.length > 0) {
      console.log('✅ Tabela users encontrada')
      console.log('📋 Campos disponíveis:')
      Object.keys(data[0]).forEach(field => {
        console.log(`   - ${field}: ${typeof data[0][field]}`)
      })
    } else {
      console.log('✅ Tabela users existe mas está vazia')
      console.log('📋 Tentando obter estrutura da tabela...')
      
      // Tentar inserir um registro temporário para ver a estrutura
      const { data: insertData, error: insertError } = await supabase
        .from('users')
        .insert({
          email: 'temp@test.com',
          name: 'Test User',
          role: 'member',
          user_type: 'member',
          is_active: true
        })
        .select()
      
      if (insertError) {
        console.error('❌ Erro ao inserir teste:', insertError)
        console.log('💡 Possível problema: Campos obrigatórios em falta ou estrutura incorreta')
      } else {
        console.log('✅ Estrutura da tabela:')
        Object.keys(insertData[0]).forEach(field => {
          console.log(`   - ${field}: ${typeof insertData[0][field]}`)
        })
        
        // Remover o registro de teste
        await supabase
          .from('users')
          .delete()
          .eq('email', 'temp@test.com')
      }
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error)
  }
}

checkUsersStructure() 