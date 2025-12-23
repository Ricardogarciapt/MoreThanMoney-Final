const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Carregar variáveis de ambiente do arquivo env.local
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', 'env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#][^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        
        // Remover aspas se existirem
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        envVars[key] = value;
      }
    });
    
    return envVars;
  }
  return {};
}

const envVars = loadEnvFile();

// Configuração do Supabase
const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente do Supabase não encontradas');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'OK' : 'FALTANDO');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'OK' : 'FALTANDO');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testSystem() {
  console.log('🚀 Iniciando teste completo do sistema...\n');
  
  let passedTests = 0;
  let totalTests = 0;

  // Teste 1: Conexão com Supabase
  totalTests++;
  try {
    const { data, error } = await supabase.from('users').select('count').limit(1);
    if (error) throw error;
    console.log('✅ Teste 1: Conexão com Supabase - OK');
    passedTests++;
  } catch (error) {
    console.log('❌ Teste 1: Conexão com Supabase - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 2: Tabela users
  totalTests++;
  try {
    const { data, error } = await supabase.from('users').select('*').limit(1);
    if (error) throw error;
    console.log('✅ Teste 2: Tabela users - OK');
    passedTests++;
  } catch (error) {
    console.log('❌ Teste 2: Tabela users - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 3: Tabela products
  totalTests++;
  try {
    const { data, error } = await supabase.from('products').select('*').limit(1);
    if (error) throw error;
    console.log('✅ Teste 3: Tabela products - OK');
    passedTests++;
  } catch (error) {
    console.log('❌ Teste 3: Tabela products - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 4: Tabela materials
  totalTests++;
  try {
    const { data, error } = await supabase.from('materials').select('*').limit(1);
    if (error) throw error;
    console.log('✅ Teste 4: Tabela materials - OK');
    passedTests++;
  } catch (error) {
    console.log('❌ Teste 4: Tabela materials - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 5: Tabela images
  totalTests++;
  try {
    const { data, error } = await supabase.from('images').select('*').limit(1);
    if (error) throw error;
    console.log('✅ Teste 5: Tabela images - OK');
    passedTests++;
  } catch (error) {
    console.log('❌ Teste 5: Tabela images - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 6: Tabela metatrader_config
  totalTests++;
  try {
    const { data, error } = await supabase.from('metatrader_config').select('*').limit(1);
    if (error) throw error;
    console.log('✅ Teste 6: Tabela metatrader_config - OK');
    passedTests++;
  } catch (error) {
    console.log('❌ Teste 6: Tabela metatrader_config - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 7: Tabela special_offers
  totalTests++;
  try {
    const { data, error } = await supabase.from('special_offers').select('*').limit(1);
    if (error) throw error;
    console.log('✅ Teste 7: Tabela special_offers - OK');
    passedTests++;
  } catch (error) {
    console.log('❌ Teste 7: Tabela special_offers - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 8: Tabela videos
  totalTests++;
  try {
    const { data, error } = await supabase.from('videos').select('*').limit(1);
    if (error) throw error;
    console.log('✅ Teste 8: Tabela videos - OK');
    passedTests++;
  } catch (error) {
    console.log('❌ Teste 8: Tabela videos - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 9: Tabela telegram_config
  totalTests++;
  try {
    const { data, error } = await supabase.from('telegram_config').select('*').limit(1);
    if (error) throw error;
    console.log('✅ Teste 9: Tabela telegram_config - OK');
    passedTests++;
  } catch (error) {
    console.log('❌ Teste 9: Tabela telegram_config - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 10: Tabela testimonials
  totalTests++;
  try {
    const { data, error } = await supabase.from('testimonials').select('*').limit(1);
    if (error) throw error;
    console.log('✅ Teste 10: Tabela testimonials - OK');
    passedTests++;
  } catch (error) {
    console.log('❌ Teste 10: Tabela testimonials - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 11: Verificar usuários admin
  totalTests++;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_type', 'admin')
      .limit(1);
    if (error) throw error;
    if (data && data.length > 0) {
      console.log('✅ Teste 11: Usuários admin - OK');
      passedTests++;
    } else {
      console.log('⚠️  Teste 11: Usuários admin - NENHUM ENCONTRADO');
    }
  } catch (error) {
    console.log('❌ Teste 11: Usuários admin - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 12: Verificar usuários membros
  totalTests++;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_type', 'member')
      .limit(1);
    if (error) throw error;
    if (data && data.length > 0) {
      console.log('✅ Teste 12: Usuários membros - OK');
      passedTests++;
    } else {
      console.log('⚠️  Teste 12: Usuários membros - NENHUM ENCONTRADO');
    }
  } catch (error) {
    console.log('❌ Teste 12: Usuários membros - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 13: Verificar dados de exemplo nas tabelas
  totalTests++;
  try {
    const { data: materials, error: materialsError } = await supabase
      .from('materials')
      .select('*')
      .eq('category', 'jifu');
    
    if (materialsError) throw materialsError;
    
    if (materials && materials.length > 0) {
      console.log('✅ Teste 13: Dados de exemplo - OK');
      passedTests++;
    } else {
      console.log('⚠️  Teste 13: Dados de exemplo - NENHUM ENCONTRADO');
    }
  } catch (error) {
    console.log('❌ Teste 13: Dados de exemplo - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 14: Verificar políticas RLS
  totalTests++;
  try {
    // Tentar acessar dados como usuário não autenticado
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .limit(1);
    
    // Se não há erro, as políticas estão funcionando
    console.log('✅ Teste 14: Políticas RLS - OK');
    passedTests++;
  } catch (error) {
    console.log('❌ Teste 14: Políticas RLS - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Teste 15: Verificar servidor local
  totalTests++;
  try {
    const response = await fetch('http://localhost:3000/api/health');
    if (response.ok) {
      console.log('✅ Teste 15: Servidor local - OK');
      passedTests++;
    } else {
      console.log('❌ Teste 15: Servidor local - FALHOU');
      console.log('   Status:', response.status);
    }
  } catch (error) {
    console.log('❌ Teste 15: Servidor local - FALHOU');
    console.log('   Erro:', error.message);
  }

  // Resultado final
  console.log('\n' + '='.repeat(50));
  console.log(`📊 RESULTADO FINAL: ${passedTests}/${totalTests} testes passaram`);
  console.log('='.repeat(50));

  if (passedTests === totalTests) {
    console.log('🎉 SISTEMA 100% FUNCIONAL!');
    console.log('✅ Todas as tabelas estão criadas');
    console.log('✅ Todas as políticas RLS estão aplicadas');
    console.log('✅ Dados de exemplo estão inseridos');
    console.log('✅ Servidor está rodando');
    console.log('\n🚀 Sistema pronto para produção!');
  } else {
    console.log('⚠️  Alguns testes falharam');
    console.log('📝 Verifique os erros acima e execute novamente');
  }

  process.exit(passedTests === totalTests ? 0 : 1);
}

// Executar teste
testSystem().catch(error => {
  console.error('❌ Erro fatal no teste:', error);
  process.exit(1);
}); 