#!/usr/bin/env node
/**
 * Seed de exercícios wger para a Supabase.
 * Utiliza data/wger/exercises-seed.json e grava na tabela public.exercises.
 *
 * Uso: npm run seed:wger  (carrega .env.local)
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_ANON_KEY)
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
if (existsSync(join(projectRoot, '.env.local'))) {
  config({ path: join(projectRoot, '.env.local') })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou ANON_KEY)')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  const seedPath = join(projectRoot, 'data', 'wger', 'exercises-seed.json')
  let raw
  try {
    raw = readFileSync(seedPath, 'utf8')
  } catch (e) {
    console.error('❌ Ficheiro não encontrado:', seedPath)
    process.exit(1)
  }

  const exercises = JSON.parse(raw)
  if (!Array.isArray(exercises) || exercises.length === 0) {
    console.error('❌ Nenhum exercício em exercises-seed.json')
    process.exit(1)
  }

  const rows = exercises.map((ex) => ({
    name: ex.name,
    description: ex.description || null,
    category: ex.category || 'other',
    equipment: ex.equipment || 'none',
    muscles_primary: ex.muscles_primary || [],
    muscles_secondary: ex.muscles_secondary || [],
    instructions: ex.instructions || null,
    is_public: true,
    created_by: null,
  }))

  const { error } = await supabase.from('exercises').insert(rows)

  if (error) {
    console.error('❌ Erro Supabase:', error.message)
    process.exit(1)
  }

  console.log('✅ Seed concluído: exercícios inseridos/atualizados a partir de data/wger/exercises-seed.json')
}

main()
