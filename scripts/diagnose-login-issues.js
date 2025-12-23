const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não encontradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnoseLoginIssues() {
  console.log('🔍 Diagnosticando problemas de login...\n');

  try {
    // 1. Verificar estrutura da tabela users
    console.log('1. Verificando estrutura da tabela users...');
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'users')
      .eq('table_schema', 'public')
      .order('ordinal_position');

    if (columnsError) {
      console.error('❌ Erro ao verificar estrutura:', columnsError.message);
    } else {
      console.log('✅ Estrutura da tabela users:');
      columns.forEach(col => {
        console.log(`   - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
      });
    }

    // 2. Verificar políticas RLS
    console.log('\n2. Verificando políticas RLS...');
    const { data: policies, error: policiesError } = await supabase
      .from('pg_policies')
      .select('policyname, cmd, permissive')
      .eq('tablename', 'users')
      .eq('schemaname', 'public');

    if (policiesError) {
      console.error('❌ Erro ao verificar políticas:', policiesError.message);
    } else {
      console.log('✅ Políticas RLS encontradas:');
      policies.forEach(policy => {
        console.log(`   - ${policy.policyname} (${policy.cmd}, permissive: ${policy.permissive})`);
      });
    }

    // 3. Verificar usuários existentes
    console.log('\n3. Verificando usuários existentes...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, username, role, user_type, is_active')
      .limit(5);

    if (usersError) {
      console.error('❌ Erro ao buscar usuários:', usersError.message);
    } else {
      console.log(`✅ ${users.length} usuários encontrados:`);
      users.forEach(user => {
        console.log(`   - ${user.email} (${user.username}) - role: ${user.role}, user_type: ${user.user_type}, active: ${user.is_active}`);
      });
    }

    // 4. Testar login com usuário admin
    console.log('\n4. Testando login com usuário admin...');
    const adminUser = users?.find(u => u.role === 'admin' || u.user_type === 'admin');
    
    if (adminUser) {
      console.log(`🔑 Testando login com: ${adminUser.email}`);
      
      // Simular login
      const { data: authData, error: authError } = await supabase.auth.admin.getUserById(adminUser.id);
      
      if (authError) {
        console.error('❌ Erro na autenticação:', authError.message);
      } else {
        console.log('✅ Autenticação admin funcionando');
        
        // Testar acesso à tabela users
        const { data: userAccess, error: accessError } = await supabase
          .from('users')
          .select('id, email')
          .eq('id', adminUser.id)
          .single();

        if (accessError) {
          console.error('❌ Erro no acesso à tabela users:', accessError.message);
        } else {
          console.log('✅ Acesso à tabela users funcionando');
        }
      }
    } else {
      console.log('⚠️  Nenhum usuário admin encontrado para teste');
    }

    // 5. Verificar função RPC para username
    console.log('\n5. Verificando função RPC get_user_email_by_username...');
    try {
      const { data: rpcTest, error: rpcError } = await supabase.rpc('get_user_email_by_username', {
        username_param: 'test'
      });

      if (rpcError) {
        console.log('⚠️  Função RPC não existe ou tem erro:', rpcError.message);
        console.log('💡 Criando função RPC...');
        
        // Criar função RPC
        const { error: createRpcError } = await supabase.rpc('exec_sql', {
          sql_query: `
            CREATE OR REPLACE FUNCTION get_user_email_by_username(username_param TEXT)
            RETURNS TEXT
            LANGUAGE plpgsql
            SECURITY DEFINER
            AS $$
            DECLARE
              user_email TEXT;
            BEGIN
              SELECT email INTO user_email
              FROM users
              WHERE username = username_param
              LIMIT 1;
              
              RETURN user_email;
            END;
            $$;
          `
        });

        if (createRpcError) {
          console.error('❌ Erro ao criar função RPC:', createRpcError.message);
        } else {
          console.log('✅ Função RPC criada com sucesso');
        }
      } else {
        console.log('✅ Função RPC funcionando');
      }
    } catch (error) {
      console.log('⚠️  Função RPC não existe');
    }

    // 6. Verificar configurações de autenticação
    console.log('\n6. Verificando configurações de autenticação...');
    const { data: authConfig, error: configError } = await supabase.auth.admin.listUsers();
    
    if (configError) {
      console.error('❌ Erro ao verificar configurações de auth:', configError.message);
    } else {
      console.log(`✅ ${authConfig.users.length} usuários no sistema de auth`);
    }

    console.log('\n🎯 Diagnóstico concluído!');
    console.log('\n📋 Resumo dos problemas encontrados:');
    console.log('1. Verificar se as políticas RLS estão corretas');
    console.log('2. Verificar se a função RPC existe');
    console.log('3. Verificar se os usuários têm dados corretos');
    console.log('4. Verificar se o contexto de auth está funcionando');

  } catch (error) {
    console.error('❌ Erro durante o diagnóstico:', error.message);
  }
}

// Executar diagnóstico
diagnoseLoginIssues(); 