#!/usr/bin/env node

/**
 * Script de Verificação do Supabase
 * Verifica todas as conexões e integridade do banco de dados
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('\n🔍 Iniciando verificação do Supabase...\n')

// Verificar variáveis de ambiente
console.log('📋 Verificando variáveis de ambiente:')
console.log(`  ✓ NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✅' : '❌'}`)
console.log(`  ✓ NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✅' : '❌'}`)
console.log(`  ✓ SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? '✅' : '❌'}`)

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('\n❌ Variáveis de ambiente necessárias não encontradas!')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null

async function verifyTables() {
  console.log('\n📊 Verificando tabelas:')
  
  const tables = ['profiles', 'admin_settings']
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1)
      
      if (error) {
        console.log(`  ❌ ${table}: ${error.message}`)
      } else {
        console.log(`  ✅ ${table}: OK`)
      }
    } catch (err) {
      console.log(`  ❌ ${table}: ${err.message}`)
    }
  }
}

async function verifyRPCFunctions() {
  console.log('\n🔧 Verificando funções RPC:')
  
  const functions = [
    'get_user_email_by_username',
    'create_user_profile',
    'update_user_profile'
  ]
  
  for (const func of functions) {
    try {
      const { error } = await supabase.rpc(func, {})
      
      if (error && !error.message.includes('required argument')) {
        console.log(`  ❌ ${func}: ${error.message}`)
      } else {
        console.log(`  ✅ ${func}: OK`)
      }
    } catch (err) {
      console.log(`  ⚠️  ${func}: ${err.message}`)
    }
  }
}

async function verifyAuth() {
  console.log('\n🔐 Verificando autenticação:')
  
  try {
    const { data, error } = await supabase.auth.getSession()
    
    if (error) {
      console.log(`  ❌ Sessão: ${error.message}`)
    } else {
      console.log(`  ✅ Sistema de autenticação: OK`)
    }
  } catch (err) {
    console.log(`  ❌ Autenticação: ${err.message}`)
  }
}

async function verifyAdminSettings() {
  console.log('\n⚙️  Verificando configurações de admin:')
  
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('*')
      .limit(1)
    
    if (error) {
      console.log(`  ❌ admin_settings: ${error.message}`)
      console.log(`  💡 Execute: npm run db:init para criar a tabela`)
    } else if (!data || data.length === 0) {
      console.log(`  ⚠️  admin_settings: Tabela vazia (será criada na primeira configuração)`)
    } else {
      console.log(`  ✅ admin_settings: OK`)
    }
  } catch (err) {
    console.log(`  ❌ admin_settings: ${err.message}`)
  }
}

async function verifyStorageBuckets() {
  console.log('\n📦 Verificando Storage:')
  
  if (!supabaseAdmin) {
    console.log(`  ⚠️  Service Role Key não encontrada, pulando verificação de storage`)
    return
  }
  
  try {
    const { data, error } = await supabaseAdmin.storage.listBuckets()
    
    if (error) {
      console.log(`  ❌ Storage: ${error.message}`)
    } else {
      console.log(`  ✅ Storage buckets: ${data.length} encontrados`)
      data.forEach(bucket => {
        console.log(`     - ${bucket.name}`)
      })
    }
  } catch (err) {
    console.log(`  ❌ Storage: ${err.message}`)
  }
}

async function main() {
  try {
    await verifyTables()
    await verifyRPCFunctions()
    await verifyAuth()
    await verifyAdminSettings()
    await verifyStorageBuckets()
    
    console.log('\n✅ Verificação concluída!\n')
  } catch (error) {
    console.error('\n❌ Erro durante verificação:', error)
    process.exit(1)
  }
}

main()

