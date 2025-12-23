const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'env.local') });

console.log('🚀 Iniciando sincronização de utilizadores...');
console.log('📧 Email admin configurado:', process.env.DEFAULT_ADMIN_EMAIL);
console.log('🔗 Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);

try {
  // Executar o script TypeScript
  execSync('npx tsx scripts/sync-users.ts', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
} catch (error) {
  console.error('❌ Erro ao executar sincronização:', error.message);
  process.exit(1);
}
