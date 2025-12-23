#!/usr/bin/env node

/**
 * Verificar configuração do Google OAuth
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

console.log('\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║         VERIFICAÇÃO GOOGLE OAUTH                              ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

console.log('📋 1. VARIÁVEIS DE AMBIENTE:\n')
console.log(`NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✅' : '❌'}`)
console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✅' : '❌'}`)
console.log(`GOOGLE_CLIENT_ID: ${googleClientId ? '✅' : '❌'}`)
console.log(`GOOGLE_CLIENT_SECRET: ${googleClientSecret ? '✅' : '❌'}`)

if (googleClientId) {
  console.log(`\n✅ Client ID: ${googleClientId}`)
}

console.log('\n📋 2. TESTANDO LOGIN COM GOOGLE...\n')

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testGoogleOAuth() {
  try {
    // Tentar iniciar OAuth
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/auth/callback`,
      },
    })

    if (error) {
      console.log('❌ ERRO ao iniciar Google OAuth:')
      console.log(`   Mensagem: ${error.message}`)
      console.log(`   Status: ${error.status}`)
      
      if (error.message.includes('not enabled')) {
        console.log('\n⚠️  PROBLEMA IDENTIFICADO:')
        console.log('   O Google Provider NÃO está habilitado no Supabase!\n')
        console.log('🔧 SOLUÇÃO:')
        console.log('   1. Acesse: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/auth/providers')
        console.log('   2. Clique em "Google"')
        console.log('   3. Enable Sign in with Google: ON')
        console.log('   4. Client ID: 922427186545-r6n4dcvpdu02mrk04pqaammd8rtb4qlm.apps.googleusercontent.com')
        console.log('   5. Client Secret: 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')
        console.log('   6. Save\n')
      }
      
      if (error.message.includes('redirect')) {
        console.log('\n⚠️  PROBLEMA IDENTIFICADO:')
        console.log('   Redirect URI não está configurado!\n')
        console.log('🔧 SOLUÇÃO:')
        console.log('   Adicione no Google Console:')
        console.log('   - http://localhost:3000/auth/callback')
        console.log('   - https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback')
        console.log('   - https://morethanmoney.pt/auth/callback\n')
      }
      
      return
    }

    if (data.url) {
      console.log('✅ Google OAuth URL gerada com sucesso!')
      console.log(`   URL: ${data.url.substring(0, 80)}...`)
      console.log('\n✅ OAuth está configurado corretamente!')
    }

  } catch (err) {
    console.log('❌ ERRO INESPERADO:', err.message)
  }
}

testGoogleOAuth()

console.log('\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║              INSTRUÇÕES PARA RESOLVER                         ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

console.log('Se o login com Google fica "processando", o problema é:')
console.log('')
console.log('❌ CAUSA: Google Provider NÃO está habilitado no Supabase')
console.log('')
console.log('✅ SOLUÇÃO (PASSO A PASSO):')
console.log('')
console.log('1. ABRA O SUPABASE DASHBOARD:')
console.log('   🔗 https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/auth/providers')
console.log('')
console.log('2. PROCURE "Google" NA LISTA DE PROVIDERS')
console.log('')
console.log('3. CLIQUE EM "Google"')
console.log('')
console.log('4. CONFIGURE:')
console.log('   ✅ Enable Sign in with Google: ATIVAR (toggle ON)')
console.log('   ✅ Client ID (Google): 922427186545-r6n4dcvpdu02mrk04pqaammd8rtb4qlm.apps.googleusercontent.com')
console.log('   ✅ Client Secret (Google): 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')
console.log('')
console.log('5. CLIQUE EM "SAVE"')
console.log('')
console.log('6. REINICIE O SERVIDOR:')
console.log('   Ctrl+C no terminal')
console.log('   npm run dev')
console.log('')
console.log('7. TESTE NOVAMENTE:')
console.log('   http://localhost:3000/login')
console.log('   Clique em "Continuar com Google"')
console.log('')
console.log('═══════════════════════════════════════════════════════════════\n')

