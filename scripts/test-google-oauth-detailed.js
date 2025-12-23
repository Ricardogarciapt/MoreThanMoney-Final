#!/usr/bin/env node

/**
 * Teste detalhado do Google OAuth
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log('\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║         TESTE DETALHADO - GOOGLE OAUTH                        ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testGoogleOAuth() {
  try {
    console.log('🔍 Tentando iniciar Google OAuth...\n')
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000/auth/callback',
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    })

    if (error) {
      console.log('❌ ERRO DETECTADO:\n')
      console.log(`Mensagem: ${error.message}`)
      console.log(`Status: ${error.status || 'N/A'}`)
      console.log(`Código: ${error.code || 'N/A'}`)
      
      console.log('\n╔═══════════════════════════════════════════════════════════════╗')
      console.log('║              DIAGNÓSTICO DO ERRO                              ║')
      console.log('╚═══════════════════════════════════════════════════════════════╝\n')
      
      if (error.message.includes('not enabled') || error.message.includes('disabled')) {
        console.log('🔴 PROBLEMA: Google Provider NÃO está habilitado no Supabase!\n')
        console.log('✅ SOLUÇÃO:\n')
        console.log('1. Acesse: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/auth/providers\n')
        console.log('2. Procure "Google" na lista de providers\n')
        console.log('3. Clique em "Google"\n')
        console.log('4. Configure:\n')
        console.log('   ┌─────────────────────────────────────────────────────────┐')
        console.log('   │ ✅ Enable Sign in with Google: [ON] ← ATIVAR ESTE!     │')
        console.log('   │                                                          │')
        console.log('   │ Client ID (Google):                                     │')
        console.log('   │ 922427186545-r6n4dcvpdu02mrk04pqaammd8rtb4qlm...        │')
        console.log('   │                                                          │')
        console.log('   │ Client Secret (Google):                                 │')
        console.log('   │ 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                     │')
        console.log('   │                                                          │')
        console.log('   │ [SAVE] ← CLICAR AQUI DEPOIS                             │')
        console.log('   └─────────────────────────────────────────────────────────┘\n')
        console.log('5. Aguarde confirmação de "Settings saved"\n')
        console.log('6. Teste novamente em: http://localhost:3000/login\n')
      } else if (error.message.includes('redirect')) {
        console.log('🔴 PROBLEMA: Redirect URI não está configurado!\n')
        console.log('✅ SOLUÇÃO:\n')
        console.log('Configure no Supabase Dashboard:\n')
        console.log('Site URL: http://localhost:3000\n')
        console.log('Redirect URLs:\n')
        console.log('- http://localhost:3000/**\n')
        console.log('- https://morethanmoney.pt/**\n')
      } else {
        console.log('🔴 ERRO DESCONHECIDO:\n')
        console.log('Por favor, verifique:\n')
        console.log('1. Se o Google Provider está habilitado no Supabase\n')
        console.log('2. Se as credenciais estão corretas\n')
        console.log('3. Se as URLs de redirect estão configuradas\n')
      }
      
      return
    }

    if (data && data.url) {
      console.log('✅ SUCESSO! Google OAuth está funcionando!\n')
      console.log(`URL gerada: ${data.url.substring(0, 100)}...\n`)
      console.log('╔═══════════════════════════════════════════════════════════════╗')
      console.log('║              GOOGLE OAUTH CONFIGURADO!                        ║')
      console.log('╚═══════════════════════════════════════════════════════════════╝\n')
      console.log('✅ O Google OAuth está habilitado e funcionando no Supabase!\n')
      console.log('🧪 TESTE NO NAVEGADOR:\n')
      console.log('1. http://localhost:3000/login\n')
      console.log('2. Clique em "Continuar com Google"\n')
      console.log('3. Deve redirecionar para o Google\n')
      console.log('4. Selecione sua conta\n')
      console.log('5. Aguarde callback\n')
    } else {
      console.log('⚠️ Resposta inesperada do Supabase:\n')
      console.log(JSON.stringify({ data, error }, null, 2))
    }

  } catch (err) {
    console.log('\n❌ EXCEÇÃO CAPTURADA:\n')
    console.log(err.message)
    console.log(err)
  }
}

testGoogleOAuth()

