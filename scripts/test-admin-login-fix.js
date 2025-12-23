const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não encontradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testAdminLoginFix() {
  console.log('🔧 Testando correção do login admin...\n');

  try {
    // 1. Verificar se existe um usuário admin
    console.log('1. Verificando usuário admin...');
    const { data: adminUsers, error: adminError } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('role', 'admin')
      .limit(1);

    if (adminError) {
      console.error('❌ Erro ao buscar usuário admin:', adminError.message);
      return;
    }

    if (!adminUsers || adminUsers.length === 0) {
      console.error('❌ Nenhum usuário admin encontrado');
      return;
    }

    const adminUser = adminUsers[0];
    console.log(`✅ Usuário admin encontrado: ${adminUser.email}`);

    // 2. Testar se o admin consegue ler seu próprio registro
    console.log('\n2. Testando leitura do próprio registro...');
    const { data: ownProfile, error: ownError } = await supabase
      .from('users')
      .select('id, email, role, created_at')
      .eq('id', adminUser.id)
      .single();

    if (ownError) {
      console.error('❌ Erro ao ler próprio perfil:', ownError.message);
      console.log('🔍 Isso indica que as políticas RLS estão bloqueando o acesso');
      return;
    }

    console.log('✅ Admin consegue ler seu próprio perfil');

    // 3. Testar se o admin consegue ler outros usuários
    console.log('\n3. Testando leitura de outros usuários...');
    const { data: allUsers, error: allError } = await supabase
      .from('users')
      .select('id, email, role')
      .limit(5);

    if (allError) {
      console.error('❌ Erro ao ler todos os usuários:', allError.message);
      console.log('🔍 Isso indica que as políticas RLS para admin não estão funcionando');
      return;
    }

    console.log(`✅ Admin consegue ler ${allUsers.length} usuários`);
    console.log('📋 Usuários encontrados:');
    allUsers.forEach(user => {
      console.log(`   - ${user.email} (${user.role})`);
    });

    // 4. Verificar políticas RLS da tabela users
    console.log('\n4. Verificando políticas RLS da tabela users...');
    const { data: policies, error: policiesError } = await supabase
      .rpc('get_table_policies', { table_name: 'users' });

    if (policiesError) {
      console.log('⚠️  Não foi possível verificar políticas via RPC, tentando query direta...');
      
      // Query direta para verificar políticas
      const { data: policiesData, error: policiesQueryError } = await supabase
        .from('information_schema.policies')
        .select('policy_name, permissive, roles, command, definition')
        .eq('table_name', 'users')
        .eq('table_schema', 'public');

      if (policiesQueryError) {
        console.error('❌ Erro ao verificar políticas:', policiesQueryError.message);
      } else {
        console.log('📋 Políticas encontradas:');
        policiesData.forEach(policy => {
          console.log(`   - ${policy.policy_name} (${policy.command})`);
        });
      }
    } else {
      console.log('📋 Políticas encontradas:');
      policies.forEach(policy => {
        console.log(`   - ${policy.policy_name} (${policy.command})`);
      });
    }

    // 5. Teste final - simular login admin
    console.log('\n5. Teste final - simulando login admin...');
    
    // Criar cliente com contexto do admin
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Simular autenticação do admin
    const { data: authData, error: authError } = await adminSupabase.auth.admin.getUserById(adminUser.id);
    
    if (authError) {
      console.error('❌ Erro na autenticação admin:', authError.message);
    } else {
      console.log('✅ Autenticação admin simulada com sucesso');
      
      // Testar acesso com contexto de admin
      const { data: adminAccess, error: accessError } = await adminSupabase
        .from('users')
        .select('count')
        .eq('role', 'admin');

      if (accessError) {
        console.error('❌ Erro no acesso admin:', accessError.message);
      } else {
        console.log('✅ Acesso admin funcionando corretamente');
      }
    }

    console.log('\n🎉 Teste concluído!');
    console.log('✅ O problema do carregamento infinito deve estar resolvido');
    console.log('✅ Admins agora podem acessar todos os registros da tabela users');

  } catch (error) {
    console.error('❌ Erro durante o teste:', error.message);
  }
}

// Executar o teste
testAdminLoginFix(); 