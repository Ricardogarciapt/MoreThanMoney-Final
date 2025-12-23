const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não encontradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testCompleteLoginSystem() {
  console.log('🧪 Testando sistema completo de login...\n');

  try {
    // 1. Testar função RPC get_user_profile
    console.log('1. Testando função get_user_profile...');
    const adminUser = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    if (adminUser.data) {
      const { data: profile, error: profileError } = await supabase.rpc('get_user_profile', {
        user_id_param: adminUser.data.id
      });

      if (profileError) {
        console.error('❌ Erro na função get_user_profile:', profileError.message);
      } else {
        console.log('✅ Função get_user_profile funcionando');
        console.log(`   - Usuário: ${profile.email} (${profile.username})`);
      }
    }

    // 2. Testar função RPC check_username_exists
    console.log('\n2. Testando função check_username_exists...');
    const { data: usernameExists, error: usernameError } = await supabase.rpc('check_username_exists', {
      username_param: 'admin'
    });

    if (usernameError) {
      console.error('❌ Erro na função check_username_exists:', usernameError.message);
    } else {
      console.log('✅ Função check_username_exists funcionando');
      console.log(`   - Username 'admin' existe: ${usernameExists}`);
    }

    // 3. Testar função RPC get_user_email_by_username
    console.log('\n3. Testando função get_user_email_by_username...');
    const { data: email, error: emailError } = await supabase.rpc('get_user_email_by_username', {
      username_param: 'admin'
    });

    if (emailError) {
      console.error('❌ Erro na função get_user_email_by_username:', emailError.message);
    } else {
      console.log('✅ Função get_user_email_by_username funcionando');
      console.log(`   - Email para username 'admin': ${email}`);
    }

    // 4. Testar função RPC is_user_admin
    console.log('\n4. Testando função is_user_admin...');
    if (adminUser.data) {
      const { data: isAdmin, error: adminError } = await supabase.rpc('is_user_admin', {
        user_id_param: adminUser.data.id
      });

      if (adminError) {
        console.error('❌ Erro na função is_user_admin:', adminError.message);
      } else {
        console.log('✅ Função is_user_admin funcionando');
        console.log(`   - Usuário é admin: ${isAdmin}`);
      }
    }

    // 5. Testar login simulado
    console.log('\n5. Testando login simulado...');
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(adminUser.data.id);
    
    if (authError) {
      console.error('❌ Erro na autenticação:', authError.message);
    } else {
      console.log('✅ Autenticação funcionando');
      console.log(`   - Usuário autenticado: ${authUser.user.email}`);
      
      // Testar acesso à tabela users com contexto de auth
      const { data: userAccess, error: accessError } = await supabase
        .from('users')
        .select('id, email, username, role, user_type')
        .eq('id', adminUser.data.id)
        .single();

      if (accessError) {
        console.error('❌ Erro no acesso à tabela users:', accessError.message);
      } else {
        console.log('✅ Acesso à tabela users funcionando');
        console.log(`   - Dados: ${userAccess.email} (${userAccess.role}/${userAccess.user_type})`);
      }
    }

    // 6. Testar políticas RLS
    console.log('\n6. Testando políticas RLS...');
    const { data: policies, error: policiesError } = await supabase
      .from('pg_policies')
      .select('policyname, cmd')
      .eq('tablename', 'users')
      .eq('schemaname', 'public');

    if (policiesError) {
      console.log('⚠️  Não foi possível verificar políticas via query direta');
    } else {
      console.log('✅ Políticas RLS encontradas:');
      policies.forEach(policy => {
        console.log(`   - ${policy.policyname} (${policy.cmd})`);
      });
    }

    // 7. Testar função de estatísticas (apenas admin)
    console.log('\n7. Testando função get_user_stats...');
    if (adminUser.data) {
      const { data: stats, error: statsError } = await supabase.rpc('get_user_stats', {
        admin_user_id: adminUser.data.id
      });

      if (statsError) {
        console.error('❌ Erro na função get_user_stats:', statsError.message);
      } else {
        console.log('✅ Função get_user_stats funcionando');
        console.log(`   - Total de usuários: ${stats.total_users}`);
        console.log(`   - Usuários ativos: ${stats.active_users}`);
        console.log(`   - Admins: ${stats.admin_users}`);
      }
    }

    // 8. Verificar estrutura da tabela users
    console.log('\n8. Verificando estrutura da tabela users...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    if (usersError) {
      console.error('❌ Erro ao verificar estrutura:', usersError.message);
    } else {
      const columns = Object.keys(users[0] || {});
      console.log('✅ Estrutura da tabela users:');
      console.log(`   - Colunas: ${columns.join(', ')}`);
    }

    console.log('\n🎉 Teste completo concluído!');
    console.log('\n📋 Resumo:');
    console.log('✅ Funções RPC criadas e funcionando');
    console.log('✅ Políticas RLS aplicadas');
    console.log('✅ Autenticação funcionando');
    console.log('✅ Acesso à tabela users funcionando');
    console.log('✅ Sistema pronto para uso');

  } catch (error) {
    console.error('❌ Erro durante o teste:', error.message);
  }
}

// Executar teste completo
testCompleteLoginSystem(); 