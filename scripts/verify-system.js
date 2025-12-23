const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifySystem() {
  console.log('🔍 VERIFICAÇÃO COMPLETA DO SISTEMA MORETHANMONEY\n');
  console.log('='.repeat(60));
  
  let errors = 0;
  let warnings = 0;
  let success = 0;

  // 1. VERIFICAR CONEXÃO COM SUPABASE
  console.log('\n1️⃣ VERIFICANDO CONEXÃO COM SUPABASE...');
  try {
    const { data, error } = await supabase.from('profiles').select('count').limit(1);
    if (error) throw error;
    console.log('   ✅ Conexão com Supabase OK');
    success++;
  } catch (error) {
    console.log('   ❌ Erro na conexão:', error.message);
    errors++;
  }

  // 2. VERIFICAR TABELA PROFILES
  console.log('\n2️⃣ VERIFICANDO TABELA PROFILES...');
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, user_type, trial_expires_at, trial_expired')
      .limit(1);
    
    if (error) throw error;
    
    // Verificar se colunas de trial existem
    if (data && data.length > 0) {
      const hasTrialColumns = data[0].hasOwnProperty('trial_expires_at');
      if (hasTrialColumns) {
        console.log('   ✅ Colunas de trial existem (trial_expires_at, trial_expired)');
        success++;
      } else {
        console.log('   ⚠️ Colunas de trial NÃO existem - Execute trial-profiles-schema.sql');
        warnings++;
      }
    }
  } catch (error) {
    console.log('   ❌ Erro ao verificar tabela profiles:', error.message);
    errors++;
  }

  // 3. VERIFICAR ADMINS
  console.log('\n3️⃣ VERIFICANDO ADMINISTRADORES...');
  try {
    const { data: admins, error } = await supabase
      .from('profiles')
      .select('email, user_type')
      .eq('user_type', 'admin');
    
    if (error) throw error;
    
    if (admins && admins.length > 0) {
      console.log(`   ✅ ${admins.length} admins encontrados:`);
      admins.forEach(admin => {
        console.log(`      - ${admin.email}`);
      });
      success++;
    } else {
      console.log('   ⚠️ Nenhum admin encontrado');
      warnings++;
    }
  } catch (error) {
    console.log('   ❌ Erro ao verificar admins:', error.message);
    errors++;
  }

  // 4. VERIFICAR FUNÇÕES RPC
  console.log('\n4️⃣ VERIFICANDO FUNÇÕES RPC...');
  
  const rpcFunctions = [
    'get_user_email_by_username',
    'check_username_exists',
    'get_user_profile',
    'create_user_profile',
    'update_user_profile'
  ];
  
  for (const funcName of rpcFunctions) {
    try {
      const { error } = await supabase.rpc(funcName, 
        funcName === 'get_user_email_by_username' ? { username_param: 'test' } :
        funcName === 'check_username_exists' ? { username_param: 'test' } :
        funcName === 'get_user_profile' ? { user_id_param: '00000000-0000-0000-0000-000000000000' } :
        {}
      );
      
      if (error && !error.message.includes('not found')) {
        console.log(`   ⚠️ ${funcName}: ${error.message}`);
        warnings++;
      } else {
        console.log(`   ✅ ${funcName} existe`);
        success++;
      }
    } catch (error) {
      console.log(`   ❌ ${funcName}: Erro`);
      errors++;
    }
  }

  // 5. VERIFICAR TABELAS DE ADMIN
  console.log('\n5️⃣ VERIFICANDO TABELAS DE ADMIN...');
  
  const tables = ['site_content', 'activity_logs', 'admin_settings'];
  
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('id').limit(1);
      
      if (error) {
        console.log(`   ⚠️ Tabela ${table} NÃO existe - Execute fix-auth-schema.sql`);
        warnings++;
      } else {
        console.log(`   ✅ Tabela ${table} existe`);
        success++;
      }
    } catch (error) {
      console.log(`   ❌ Erro ao verificar ${table}`);
      errors++;
    }
  }

  // 6. VERIFICAR APIs DO ADMIN
  console.log('\n6️⃣ VERIFICANDO APIs DO ADMIN...');
  
  const apis = [
    'http://localhost:3000/api/admin/users',
    'http://localhost:3000/api/admin/stats',
    'http://localhost:3000/api/admin/sync-users',
    'http://localhost:3000/api/admin/theme',
    'http://localhost:3000/api/admin/settings',
    'http://localhost:3000/api/admin/check-trials'
  ];
  
  for (const api of apis) {
    try {
      const response = await fetch(api);
      const endpoint = api.split('/').pop();
      
      if (response.ok) {
        console.log(`   ✅ ${endpoint} respondendo (${response.status})`);
        success++;
      } else {
        console.log(`   ⚠️ ${endpoint} erro (${response.status})`);
        warnings++;
      }
    } catch (error) {
      console.log(`   ❌ ${api.split('/').pop()}: Servidor não acessível`);
      errors++;
    }
  }

  // 7. VERIFICAR USUÁRIOS TRIAL
  console.log('\n7️⃣ VERIFICANDO USUÁRIOS TRIAL...');
  try {
    const { data: trials, error } = await supabase
      .from('profiles')
      .select('email, user_type, trial_expires_at')
      .in('user_type', ['guest', 'presentation']);
    
    if (error) {
      console.log('   ⚠️ Nenhum trial encontrado (coluna pode não existir)');
      warnings++;
    } else {
      console.log(`   ✅ ${trials?.length || 0} usuários trial encontrados`);
      if (trials && trials.length > 0) {
        trials.forEach(trial => {
          console.log(`      - ${trial.email} (${trial.user_type})`);
        });
      }
      success++;
    }
  } catch (error) {
    console.log('   ❌ Erro ao verificar trials:', error.message);
    errors++;
  }

  // 8. VERIFICAR VARIÁVEIS DE AMBIENTE
  console.log('\n8️⃣ VERIFICANDO VARIÁVEIS DE AMBIENTE...');
  
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
    'NEXT_PUBLIC_SITE_URL'
  ];
  
  requiredEnvVars.forEach(envVar => {
    if (process.env[envVar]) {
      console.log(`   ✅ ${envVar} definida`);
      success++;
    } else {
      console.log(`   ⚠️ ${envVar} NÃO definida`);
      warnings++;
    }
  });
  
  const optionalEnvVars = ['RESEND_API_KEY'];
  optionalEnvVars.forEach(envVar => {
    if (process.env[envVar] && !process.env[envVar].includes('1234567890')) {
      console.log(`   ✅ ${envVar} configurada`);
    } else {
      console.log(`   ⚠️ ${envVar} não configurada (opcional para produção)`);
    }
  });

  // RESUMO FINAL
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 RESUMO DA VERIFICAÇÃO:\n');
  console.log(`   ✅ Sucessos: ${success}`);
  console.log(`   ⚠️  Avisos: ${warnings}`);
  console.log(`   ❌ Erros: ${errors}`);
  
  console.log('\n💡 AÇÕES NECESSÁRIAS:\n');
  
  if (warnings > 0) {
    console.log('   1. Execute supabase/fix-auth-schema.sql no Supabase');
    console.log('   2. Execute supabase/trial-profiles-schema.sql no Supabase');
    console.log('   3. Configure RESEND_API_KEY para produção');
  }
  
  if (errors > 0) {
    console.log('\n   ❌ ATENÇÃO: Erros críticos encontrados!');
    console.log('   Verifique a conexão com Supabase e configurações.');
  } else if (warnings === 0) {
    console.log('\n   🎉 SISTEMA 100% FUNCIONAL!');
    console.log('   Tudo está configurado corretamente.');
  } else {
    console.log('\n   ⚙️ Sistema funcional com algumas configurações pendentes.');
    console.log('   Execute os SQLs listados acima para 100% de funcionalidade.');
  }
  
  console.log('\n' + '='.repeat(60));
  
  return {
    success,
    warnings,
    errors,
    status: errors === 0 ? (warnings === 0 ? 'PERFEITO' : 'BOM') : 'REQUER_ATENÇÃO'
  };
}

verifySystem()
  .then((result) => {
    console.log(`\n✅ Verificação concluída! Status: ${result.status}`);
    process.exit(result.errors > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('\n❌ Erro na verificação:', error);
    process.exit(1);
  });
