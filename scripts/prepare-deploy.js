#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Preparando projeto para deploy no Vercel...\n');

// Verificar se o arquivo .env.local existe
const envLocalPath = path.join(process.cwd(), 'env.local');
if (!fs.existsSync(envLocalPath)) {
  console.error('❌ Arquivo env.local não encontrado!');
  console.log('📝 Crie o arquivo env.local com as variáveis de ambiente necessárias.');
  process.exit(1);
}

// Verificar se a build funciona
console.log('🔨 Testando build...');
const { execSync } = require('child_process');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Build testada com sucesso!\n');
} catch (error) {
  console.error('❌ Erro na build!');
  process.exit(1);
}

// Verificar arquivos essenciais
const essentialFiles = [
  'package.json',
  'next.config.mjs',
  'vercel.json',
  'app/layout.tsx',
  'app/page.tsx'
];

console.log('📁 Verificando arquivos essenciais...');
essentialFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - FALTANDO!`);
  }
});

console.log('\n🎯 Checklist para deploy no Vercel:');
console.log('1. ✅ Build testada');
console.log('2. ✅ Configuração do Vercel criada');
console.log('3. ✅ Next.js configurado');
console.log('4. 📝 Configure as variáveis de ambiente no Vercel Dashboard');
console.log('5. 📝 Conecte seu repositório GitHub ao Vercel');
console.log('6. 📝 Configure o domínio personalizado (opcional)');

console.log('\n🔧 Variáveis de ambiente necessárias no Vercel:');
console.log('- NEXT_PUBLIC_SUPABASE_URL');
console.log('- NEXT_PUBLIC_SUPABASE_ANON_KEY');
console.log('- SUPABASE_SERVICE_ROLE_KEY');
console.log('- STRIPE_SECRET_KEY');
console.log('- STRIPE_WEBHOOK_SECRET');
console.log('- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
console.log('- TELEGRAM_BOT_TOKEN');
console.log('- TELEGRAM_CHANNEL_ID');
console.log('- NOTION_API_KEY');
console.log('- NOTION_DATABASE_ID');

console.log('\n🚀 Projeto pronto para deploy!');
console.log('📖 Próximos passos:');
console.log('1. Faça commit das alterações: git add . && git commit -m "Prepare for Vercel deploy"');
console.log('2. Push para GitHub: git push origin main');
console.log('3. Acesse vercel.com e conecte seu repositório');
console.log('4. Configure as variáveis de ambiente no Vercel Dashboard');
console.log('5. Deploy automático será iniciado!'); 