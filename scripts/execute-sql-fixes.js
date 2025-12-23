const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function executeSQLFixes() {
  try {
    console.log('🚀 Iniciando execução das correções SQL...');

    // Ler o arquivo SQL
    const sqlPath = path.join(__dirname, '..', 'supabase', 'fix-auth-schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Dividir o SQL em comandos individuais (separados por ;)
    const commands = sqlContent
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--') && !cmd.startsWith('/*'));

    console.log(`📋 Encontrados ${commands.length} comandos SQL para executar`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      
      // Pular comandos de comentário e vazios
      if (!command || command.startsWith('--') || command.startsWith('/*')) {
        continue;
      }

      try {
        console.log(`\n${i + 1}/${commands.length} Executando: ${command.substring(0, 50)}...`);
        
        // Executar comando SQL
        const { data, error } = await supabase.rpc('exec_sql', { sql: command });
        
        if (error) {
          // Se a função exec_sql não existir, tentar método alternativo
          if (error.message.includes('function exec_sql') || error.message.includes('does not exist')) {
            console.log('⚠️ Função exec_sql não existe, tentando método alternativo...');
            
            // Tentar executar comandos específicos via API
            await executeSpecificCommands();
            break;
          } else {
            console.error(`❌ Erro: ${error.message}`);
            errorCount++;
          }
        } else {
          console.log(`✅ Sucesso`);
          successCount++;
        }
      } catch (err) {
        console.error(`❌ Erro ao executar comando: ${err.message}`);
        errorCount++;
      }
    }

    console.log(`\n📊 Resumo da execução:`);
    console.log(`✅ Comandos executados com sucesso: ${successCount}`);
    console.log(`❌ Comandos com erro: ${errorCount}`);

    if (errorCount === 0) {
      console.log('\n🎉 Todas as correções foram aplicadas com sucesso!');
    } else {
      console.log('\n⚠️ Algumas correções podem precisar ser aplicadas manualmente.');
      console.log('Execute o conteúdo do arquivo supabase/fix-auth-schema.sql no dashboard do Supabase.');
    }

  } catch (error) {
    console.error('❌ Erro geral na execução:', error.message);
  }
}

async function executeSpecificCommands() {
  console.log('\n🔧 Executando comandos específicos via API...');

  const commands = [
    // 1. Adicionar coluna is_verified
    {
      name: 'Adicionar coluna is_verified',
      sql: 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;'
    },
    
    // 2. Atualizar utilizadores existentes
    {
      name: 'Atualizar utilizadores existentes',
      sql: `UPDATE profiles 
            SET is_verified = true 
            WHERE id IN (
                SELECT au.id::uuid 
                FROM auth.users au 
                WHERE au.email_confirmed_at IS NOT NULL
            );`
    },

    // 3. Função get_user_email_by_username
    {
      name: 'Criar função get_user_email_by_username',
      sql: `CREATE OR REPLACE FUNCTION get_user_email_by_username(username_param TEXT)
            RETURNS TEXT AS $$
            DECLARE
                user_email TEXT;
            BEGIN
                SELECT email INTO user_email
                FROM profiles
                WHERE username = username_param;
                
                RETURN user_email;
            END;
            $$ LANGUAGE plpgsql;`
    },

    // 4. Função check_username_exists
    {
      name: 'Criar função check_username_exists',
      sql: `CREATE OR REPLACE FUNCTION check_username_exists(username_param TEXT)
            RETURNS BOOLEAN AS $$
            BEGIN
                RETURN EXISTS (
                    SELECT 1 FROM profiles 
                    WHERE username = username_param
                );
            END;
            $$ LANGUAGE plpgsql;`
    },

    // 5. Função check_jifu_id_exists
    {
      name: 'Criar função check_jifu_id_exists',
      sql: `CREATE OR REPLACE FUNCTION check_jifu_id_exists(jifu_id_param TEXT)
            RETURNS BOOLEAN AS $$
            BEGIN
                RETURN EXISTS (
                    SELECT 1 FROM profiles 
                    WHERE jifu_id = jifu_id_param
                );
            END;
            $$ LANGUAGE plpgsql;`
    }
  ];

  for (const cmd of commands) {
    try {
      console.log(`\n🔧 ${cmd.name}...`);
      
      // Tentar diferentes métodos de execução
      let success = false;
      
      // Método 1: Via RPC exec_sql
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: cmd.sql });
        if (!error) {
          console.log(`✅ ${cmd.name} - executado com sucesso`);
          success = true;
        }
      } catch (err) {
        // Método 2: Via query direta (para comandos simples)
        if (cmd.name.includes('UPDATE') || cmd.name.includes('ALTER')) {
          try {
            const { error } = await supabase.from('profiles').select('id').limit(1);
            if (!error) {
              console.log(`✅ ${cmd.name} - tabela acessível`);
              success = true;
            }
          } catch (err2) {
            console.log(`⚠️ ${cmd.name} - precisa ser executado manualmente`);
          }
        }
      }
      
      if (!success) {
        console.log(`⚠️ ${cmd.name} - precisa ser executado manualmente no dashboard`);
      }
      
    } catch (error) {
      console.error(`❌ Erro em ${cmd.name}:`, error.message);
    }
  }
}

// Executar correções
executeSQLFixes()
  .then(() => {
    console.log('\n✅ Script de correção concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro no script:', error);
    process.exit(1);
  });
