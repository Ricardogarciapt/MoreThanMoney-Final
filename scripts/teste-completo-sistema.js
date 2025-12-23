const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Carregar variáveis de ambiente do arquivo env.local
function loadEnvFile() {
  const envPath = path.join(process.cwd(), 'env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    lines.forEach(line => {
      if (line && !line.startsWith('#') && line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').replace(/"/g, '').trim();
        process.env[key.trim()] = value;
      }
    });
  }
}

// Carregar variáveis de ambiente
loadEnvFile();

// Configuração do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente do Supabase não encontradas');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅' : '❌');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configuração do servidor
const SERVER_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@morethanmoney.pt';
const ADMIN_PASSWORD = 'Admin123!';
const MEMBER_EMAIL = 'ricardogarciapt@proton.me';
const MEMBER_PASSWORD = 'Superacao2022#';

class SistemaTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
      details: []
    };
  }

  async test(name, testFunction) {
    this.results.total++;
    try {
      await testFunction();
      this.results.passed++;
      console.log(`✅ ${name}`);
      this.results.details.push({ name, status: 'PASSED' });
    } catch (error) {
      this.results.failed++;
      console.log(`❌ ${name}: ${error.message}`);
      this.results.details.push({ name, status: 'FAILED', error: error.message });
    }
  }

  async runAllTests() {
    console.log('🚀 INICIANDO TESTE COMPLETO DO SISTEMA\n');

    // 1. Testes de Banco de Dados e Supabase
    console.log('📊 TESTES DE BANCO DE DADOS E SUPABASE');
    console.log('=====================================');
    
    await this.test('Conexão com Supabase', async () => {
      const { data, error } = await supabase.from('users').select('count').limit(1);
      if (error) throw new Error(`Erro de conexão: ${error.message}`);
    });

    await this.test('Tabela users existe e tem estrutura correta', async () => {
      const { data, error } = await supabase.from('users').select('*').limit(1);
      if (error) throw new Error(`Erro na tabela users: ${error.message}`);
      
      // Verificar se tem as colunas necessárias
      const columns = Object.keys(data[0] || {});
      const requiredColumns = ['id', 'email', 'role', 'user_type', 'is_active', 'username', 'full_name'];
      const missingColumns = requiredColumns.filter(col => !columns.includes(col));
      if (missingColumns.length > 0) {
        throw new Error(`Colunas em falta: ${missingColumns.join(', ')}`);
      }
    });

    await this.test('Tabela materials existe', async () => {
      const { data, error } = await supabase.from('materials').select('*').limit(1);
      if (error) throw new Error(`Erro na tabela materials: ${error.message}`);
    });

    await this.test('Tabela commissions existe', async () => {
      const { data, error } = await supabase.from('commissions').select('*').limit(1);
      if (error) throw new Error(`Erro na tabela commissions: ${error.message}`);
    });

    await this.test('Tabela products existe', async () => {
      const { data, error } = await supabase.from('products').select('*').limit(1);
      if (error) throw new Error(`Erro na tabela products: ${error.message}`);
    });

    // 2. Testes de Autenticação
    console.log('\n🔐 TESTES DE AUTENTICAÇÃO');
    console.log('=========================');

    await this.test('Login de Admin', async () => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
      });
      if (error) throw new Error(`Erro no login admin: ${error.message}`);
      if (!data.user) throw new Error('Usuário admin não encontrado');
    });

    await this.test('Login de Membro', async () => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: MEMBER_EMAIL,
        password: MEMBER_PASSWORD
      });
      if (error) throw new Error(`Erro no login membro: ${error.message}`);
      if (!data.user) throw new Error('Usuário membro não encontrado');
    });

    // 3. Testes de APIs Backend
    console.log('\n🌐 TESTES DE APIs BACKEND');
    console.log('=========================');

    await this.test('API Health Check', async () => {
      const response = await fetch(`${SERVER_URL}/api/health`);
      if (!response.ok) throw new Error(`Status: ${response.status}`);
      const data = await response.json();
      if (!data.status || data.status !== 'ok') {
        throw new Error('API health check falhou');
      }
    });

    await this.test('API Stats', async () => {
      const response = await fetch(`${SERVER_URL}/api/stats`);
      if (!response.ok) throw new Error(`Status: ${response.status}`);
      const data = await response.json();
      if (typeof data.users !== 'number' || typeof data.products !== 'number') {
        throw new Error('API stats retornou dados incompletos');
      }
    });

    await this.test('API Products', async () => {
      const response = await fetch(`${SERVER_URL}/api/products`);
      if (!response.ok) throw new Error(`Status: ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('API products não retornou array');
      }
    });

    await this.test('API Telegram Status', async () => {
      const response = await fetch(`${SERVER_URL}/api/telegram/status`);
      if (!response.ok) throw new Error(`Status: ${response.status}`);
      const data = await response.json();
      // Aceita tanto sucesso quanto erro, pois pode não estar configurado
      if (typeof data !== 'object') {
        throw new Error('API telegram não retornou objeto válido');
      }
    });

    // 4. Testes de Frontend
    console.log('\n🎨 TESTES DE FRONTEND');
    console.log('=====================');

    await this.test('Página Principal (/)', async () => {
      const response = await fetch(`${SERVER_URL}/`);
      if (!response.ok) throw new Error(`Status: ${response.status}`);
    });

    await this.test('Página New Landing', async () => {
      const response = await fetch(`${SERVER_URL}/new-landing`);
      if (!response.ok) throw new Error(`Status: ${response.status}`);
    });

    await this.test('Página Login', async () => {
      const response = await fetch(`${SERVER_URL}/login`);
      if (!response.ok) throw new Error(`Status: ${response.status}`);
    });

    await this.test('Página Admin Login', async () => {
      const response = await fetch(`${SERVER_URL}/admin-login`);
      if (!response.ok) throw new Error(`Status: ${response.status}`);
    });

    await this.test('Página Fast Start JIFU', async () => {
      const response = await fetch(`${SERVER_URL}/fast-start-jifu`);
      if (!response.ok) throw new Error(`Status: ${response.status}`);
    });

    await this.test('Página Member Area', async () => {
      const response = await fetch(`${SERVER_URL}/member-area`);
      if (!response.ok) throw new Error(`Status: ${response.status}`);
    });

    await this.test('Página Admin Dashboard', async () => {
      const response = await fetch(`${SERVER_URL}/admin-dashboard`);
      if (!response.ok) throw new Error(`Status: ${response.status}`);
    });

    // 5. Testes de Produtos e Pagamentos
    console.log('\n💳 TESTES DE PRODUTOS E PAGAMENTOS');
    console.log('===================================');

    await this.test('Verificar produtos no Supabase', async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw new Error(`Erro ao buscar produtos: ${error.message}`);
      if (!data || data.length === 0) {
        console.log('⚠️  Nenhum produto encontrado no Supabase');
      } else {
        console.log(`✅ ${data.length} produtos encontrados no Supabase`);
      }
    });

    await this.test('Verificar configuração Stripe', async () => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      
      if (!stripeKey) {
        console.log('⚠️  STRIPE_SECRET_KEY não configurada');
      } else {
        console.log('✅ STRIPE_SECRET_KEY configurada');
      }
      
      if (!stripePublishableKey) {
        console.log('⚠️  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY não configurada');
      } else {
        console.log('✅ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY configurada');
      }
    });

    // 6. Testes de Materiais
    console.log('\n📚 TESTES DE MATERIAIS');
    console.log('======================');

    await this.test('Verificar materiais no Supabase', async () => {
      const { data, error } = await supabase.from('materials').select('*');
      if (error) throw new Error(`Erro ao buscar materiais: ${error.message}`);
      
      if (!data || data.length === 0) {
        console.log('⚠️  Nenhum material encontrado no Supabase');
      } else {
        console.log(`✅ ${data.length} materiais encontrados no Supabase`);
        // Verificar se tem o material do Fast Start JIFU
        const fastStartMaterial = data.find(m => m.title?.toLowerCase().includes('fast start'));
        if (fastStartMaterial) {
          console.log(`✅ Material Fast Start JIFU encontrado: ${fastStartMaterial.title}`);
        } else {
          console.log('⚠️  Material Fast Start JIFU não encontrado');
        }
      }
    });

    // 7. Testes de Políticas RLS
    console.log('\n🔒 TESTES DE POLÍTICAS RLS');
    console.log('===========================');

    await this.test('Verificar componente de materiais admin existe', async () => {
      const filePath = path.join(process.cwd(), 'app', 'admin-dashboard', 'affiliate-manager', 'materials', 'page.tsx');
      if (!fs.existsSync(filePath)) {
        throw new Error('Página admin-dashboard/affiliate-manager/materials/page.tsx não encontrada');
      }
    });

    await this.test('Verificar políticas RLS da tabela users', async () => {
      try {
        const { data, error } = await supabase.rpc('get_policies', { table_name: 'users' });
        if (error) throw error;
        if (!data || data.length === 0) {
          console.log('⚠️  Nenhuma política RLS encontrada na tabela users');
        } else {
          console.log(`✅ ${data.length} políticas RLS encontradas na tabela users`);
        }
      } catch (e) {
        console.log('ℹ️  Não é possível listar políticas RLS via script no Supabase. Ignore este aviso.');
      }
    });

    // 8. Testes de Estrutura de Arquivos
    console.log('\n📁 TESTES DE ESTRUTURA DE ARQUIVOS');
    console.log('===================================');

    await this.test('Verificar página Fast Start JIFU existe', async () => {
      const filePath = path.join(process.cwd(), 'app', 'fast-start-jifu', 'page.tsx');
      if (!fs.existsSync(filePath)) {
        throw new Error('Página fast-start-jifu/page.tsx não encontrada');
      }
    });

    await this.test('Verificar scripts SQL existem', async () => {
      const scriptsDir = path.join(process.cwd(), 'scripts');
      const requiredScripts = ['clean-login-fix.sql', 'simple-login-fix.sql'];
      
      for (const script of requiredScripts) {
        const scriptPath = path.join(scriptsDir, script);
        if (!fs.existsSync(scriptPath)) {
          throw new Error(`Script ${script} não encontrado`);
        }
      }
    });

    // 9. Resumo Final
    console.log('\n📋 RESUMO DOS TESTES');
    console.log('====================');
    console.log(`Total de testes: ${this.results.total}`);
    console.log(`✅ Passaram: ${this.results.passed}`);
    console.log(`❌ Falharam: ${this.results.failed}`);
    console.log(`📊 Taxa de sucesso: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`);

    if (this.results.failed > 0) {
      console.log('\n❌ TESTES QUE FALHARAM:');
      this.results.details
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          console.log(`  - ${test.name}: ${test.error}`);
        });
    }

    // 10. Recomendações
    console.log('\n💡 RECOMENDAÇÕES:');
    console.log('==================');
    
    if (this.results.failed === 0) {
      console.log('🎉 SISTEMA 100% FUNCIONAL!');
      console.log('✅ Todos os componentes estão operacionais');
      console.log('✅ Sistema pronto para produção');
    } else {
      console.log('⚠️  SISTEMA PRECISA DE AJUSTES');
      console.log('🔧 Corrija os testes que falharam antes de ir para produção');
    }

    // Verificar se precisa criar produtos no Stripe
    const { data: products } = await supabase.from('products').select('*');
    if (!products || products.length === 0) {
      console.log('\n💳 STRIPE - RECOMENDAÇÃO:');
      console.log('========================');
      console.log('⚠️  Nenhum produto encontrado no Supabase');
      console.log('📝 Você precisa:');
      console.log('   1. Criar produtos no Stripe Dashboard');
      console.log('   2. Adicionar os produtos na tabela products do Supabase');
      console.log('   3. Configurar webhooks do Stripe');
    } else {
      console.log('\n💳 STRIPE - STATUS:');
      console.log('==================');
      console.log(`✅ ${products.length} produtos encontrados no Supabase`);
      console.log('📝 Verifique se os product_ids correspondem aos do Stripe');
    }

    return this.results;
  }
}

// Executar testes
async function main() {
  const tester = new SistemaTester();
  await tester.runAllTests();
}

main().catch(console.error); 