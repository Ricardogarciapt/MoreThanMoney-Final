const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Variáveis de ambiente não encontradas!');
    console.error('Certifique-se de que NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY estão definidas no .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function upsertUser() {
    const email = 'ricardogarciapt@proton.me';
    const password = 'Superacao2022#';
    const fullName = 'Ricardo Garcia';

    try {
        console.log('🔄 Verificando se o usuário já existe...');
        
        // Verificar se o usuário já existe
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            throw checkError;
        }

        if (existingUser) {
            console.log('✅ Usuário encontrado, atualizando dados...');
            
            // Atualizar usuário existente
            const { data: updatedUser, error: updateError } = await supabase
                .from('users')
                .update({
                    full_name: fullName,
                    role: 'admin',
                    is_active: true,
                    is_vip: true,
                    vip_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 ano
                    updated_at: new Date().toISOString()
                })
                .eq('email', email)
                .select()
                .single();

            if (updateError) {
                throw updateError;
            }

            console.log('✅ Usuário atualizado com sucesso!');
            console.log('📋 Dados do usuário:');
            console.log(JSON.stringify(updatedUser, null, 2));

        } else {
            console.log('🆕 Usuário não encontrado, criando novo...');
            
            // Criar novo usuário via Supabase Auth
            const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
                email: email,
                password: password,
                email_confirm: true,
                user_metadata: {
                    full_name: fullName
                }
            });

            if (authError) {
                throw authError;
            }

            console.log('✅ Usuário criado no Auth, adicionando dados na tabela users...');

            // Adicionar dados na tabela users
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert({
                    id: authUser.user.id,
                    email: email,
                    full_name: fullName,
                    role: 'admin',
                    is_active: true,
                    is_vip: true,
                    vip_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 ano
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();

            if (insertError) {
                throw insertError;
            }

            console.log('✅ Novo usuário criado com sucesso!');
            console.log('📋 Dados do usuário:');
            console.log(JSON.stringify(newUser, null, 2));
        }

        // Verificar se tudo foi criado corretamente
        console.log('\n🔍 Verificando dados finais...');
        
        const { data: finalUser, error: finalError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (finalError) {
            throw finalError;
        }

        console.log('✅ Verificação final:');
        console.log(`📧 Email: ${finalUser.email}`);
        console.log(`👤 Nome: ${finalUser.full_name}`);
        console.log(`🔑 Role: ${finalUser.role}`);
        console.log(`✅ Ativo: ${finalUser.is_active}`);
        console.log(`⭐ VIP: ${finalUser.is_vip}`);
        console.log(`📅 VIP expira em: ${finalUser.vip_expires_at}`);
        console.log(`🆔 ID: ${finalUser.id}`);

        console.log('\n🎉 Processo concluído com sucesso!');
        console.log('🔐 Credenciais de login:');
        console.log(`   Email: ${email}`);
        console.log(`   Senha: ${password}`);

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error('Detalhes:', error);
        process.exit(1);
    }
}

// Executar o script
upsertUser(); 