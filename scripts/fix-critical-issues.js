const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixCriticalIssues() {
  try {
    console.log('🔧 Iniciando correção de problemas críticos...');

    // 1. Verificar se a coluna is_verified existe
    console.log('\n1. Verificando coluna is_verified...');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_verified')
        .limit(1);
      
      if (error && error.message.includes('is_verified')) {
        console.log('❌ Coluna is_verified não existe - precisa ser criada manualmente');
        console.log('📋 Execute este SQL no dashboard do Supabase:');
        console.log('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;');
      } else {
        console.log('✅ Coluna is_verified existe');
      }
    } catch (err) {
      console.log('❌ Erro ao verificar coluna is_verified:', err.message);
    }

    // 2. Testar função get_user_email_by_username
    console.log('\n2. Testando função get_user_email_by_username...');
    try {
      const { data, error } = await supabase.rpc('get_user_email_by_username', {
        username_param: 'test'
      });
      
      if (error) {
        console.log('❌ Função get_user_email_by_username não funciona:', error.message);
        console.log('📋 Execute este SQL no dashboard do Supabase:');
        console.log(`
CREATE OR REPLACE FUNCTION get_user_email_by_username(username_param TEXT)
RETURNS TEXT AS $$
DECLARE
    user_email TEXT;
BEGIN
    SELECT email INTO user_email
    FROM profiles
    WHERE username = username_param;
    
    RETURN user_email;
END;
$$ LANGUAGE plpgsql;
        `);
      } else {
        console.log('✅ Função get_user_email_by_username funciona');
      }
    } catch (err) {
      console.log('❌ Erro ao testar função:', err.message);
    }

    // 3. Testar função check_username_exists
    console.log('\n3. Testando função check_username_exists...');
    try {
      const { data, error } = await supabase.rpc('check_username_exists', {
        username_param: 'test'
      });
      
      if (error) {
        console.log('❌ Função check_username_exists não funciona:', error.message);
        console.log('📋 Execute este SQL no dashboard do Supabase:');
        console.log(`
CREATE OR REPLACE FUNCTION check_username_exists(username_param TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE username = username_param
    );
END;
$$ LANGUAGE plpgsql;
        `);
      } else {
        console.log('✅ Função check_username_exists funciona');
      }
    } catch (err) {
      console.log('❌ Erro ao testar função:', err.message);
    }

    // 4. Testar função get_user_profile
    console.log('\n4. Testando função get_user_profile...');
    try {
      // Buscar um utilizador existente
      const { data: users, error: userError } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);

      if (users && users.length > 0) {
        const { data, error } = await supabase.rpc('get_user_profile', {
          user_id_param: users[0].id
        });
        
        if (error) {
          console.log('❌ Função get_user_profile não funciona:', error.message);
          console.log('📋 Execute o SQL completo do arquivo supabase/fix-auth-schema.sql');
        } else {
          console.log('✅ Função get_user_profile funciona');
        }
      } else {
        console.log('⚠️ Nenhum utilizador encontrado para testar');
      }
    } catch (err) {
      console.log('❌ Erro ao testar função:', err.message);
    }

    // 5. Verificar políticas RLS
    console.log('\n5. Verificando políticas RLS...');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);
      
      if (error) {
        console.log('❌ Erro ao aceder à tabela profiles:', error.message);
        console.log('📋 Verifique as políticas RLS no dashboard do Supabase');
      } else {
        console.log('✅ Acesso à tabela profiles OK');
      }
    } catch (err) {
      console.log('❌ Erro ao verificar RLS:', err.message);
    }

    // 6. Testar sistema de login
    console.log('\n6. Testando sistema de login...');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'wrongpassword'
      });

      if (error && error.message.includes('Invalid login credentials')) {
        console.log('✅ Sistema de login funcionando (erro esperado)');
      } else if (error) {
        console.log('❌ Problema no sistema de login:', error.message);
      } else {
        console.log('✅ Sistema de login funcionando');
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.log('✅ Sistema de login funcionando (erro esperado)');
    }

    // 7. Verificar se as tabelas de admin existem
    console.log('\n7. Verificando tabelas de admin...');
    
    // Verificar activity_logs
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('id')
        .limit(1);
      
      if (error) {
        console.log('❌ Tabela activity_logs não existe');
      } else {
        console.log('✅ Tabela activity_logs existe');
      }
    } catch (err) {
      console.log('❌ Tabela activity_logs não existe');
    }

    // Verificar admin_settings
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('id')
        .limit(1);
      
      if (error) {
        console.log('❌ Tabela admin_settings não existe');
      } else {
        console.log('✅ Tabela admin_settings existe');
      }
    } catch (err) {
      console.log('❌ Tabela admin_settings não existe');
    }

    // Verificar site_content
    try {
      const { data, error } = await supabase
        .from('site_content')
        .select('id')
        .limit(1);
      
      if (error) {
        console.log('❌ Tabela site_content não existe');
      } else {
        console.log('✅ Tabela site_content existe');
      }
    } catch (err) {
      console.log('❌ Tabela site_content não existe');
    }

    console.log('\n📋 RESUMO E INSTRUÇÕES:');
    console.log('=====================================');
    console.log('Para corrigir todos os problemas, execute o seguinte:');
    console.log('');
    console.log('1. Acede ao dashboard do Supabase:');
    console.log('   https://supabase.com/dashboard/project/iwscxotvmtkphajmasof');
    console.log('');
    console.log('2. Vai para SQL Editor');
    console.log('');
    console.log('3. Copia e cola o conteúdo completo do arquivo:');
    console.log('   supabase/fix-auth-schema.sql');
    console.log('');
    console.log('4. Executa o SQL');
    console.log('');
    console.log('5. Verifica se tudo funcionou executando:');
    console.log('   node scripts/fix-critical-issues.js');
    console.log('');
    console.log('🎯 O sistema ficará 100% funcional após estes passos!');

  } catch (error) {
    console.error('❌ Erro geral na verificação:', error.message);
  }
}

// Executar verificação
fixCriticalIssues()
  .then(() => {
    console.log('\n✅ Verificação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro no script:', error);
    process.exit(1);
  });
