/**
 * Dados de referência do projeto wger (categorias, equipamento, músculos).
 * Ficheiros em data/wger/ – usados para filtros na UI e mapeamento para o schema Supabase.
 * Schema: scripts/create-wger-inspired-schema.sql
 * Apenas para uso no servidor (API routes); lê ficheiros de data/wger via path.
 */

import path from 'path'
import fs from 'fs'

export type SchemaCategory = 'strength' | 'cardio' | 'flexibility' | 'endurance' | 'hiit' | 'sports' | 'other'
export type SchemaEquipment = 'bodyweight' | 'dumbbells' | 'barbell' | 'machine' | 'cable' | 'kettlebell' | 'resistance_band' | 'other' | 'none'

export interface WgerCategory {
  pk: number
  name: string
}

export interface WgerEquipment {
  pk: number
  name: string
}

export interface WgerMuscle {
  pk: number
  name: string
  name_en: string
  is_front: boolean
}

export interface WgerMappings {
  categoryToEnum: Record<string, SchemaCategory>
  equipmentToEnum: Record<string, SchemaEquipment>
}

const dataDir = () => path.join(process.cwd(), 'data', 'wger')

let categoriesCache: WgerCategory[] | null = null
let equipmentCache: WgerEquipment[] | null = null
let musclesCache: WgerMuscle[] | null = null
let mappingsCache: WgerMappings | null = null

function parseCategory(raw: { model: string; pk: number; fields: { name: string } }): WgerCategory {
  return { pk: raw.pk, name: raw.fields.name }
}

function parseEquipment(raw: { model: string; pk: number; fields: { name: string } }): WgerEquipment {
  return { pk: raw.pk, name: raw.fields.name }
}

function parseMuscle(raw: { model: string; pk: number; fields: { name: string; name_en: string; is_front: boolean } }): WgerMuscle {
  return {
    pk: raw.pk,
    name: raw.fields.name,
    name_en: raw.fields.name_en || '',
    is_front: raw.fields.is_front ?? true,
  }
}

function readJson<T>(filename: string): T | null {
  try {
    const p = path.join(dataDir(), filename)
    const raw = fs.readFileSync(p, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Categorias de exercício (wger). Para dropdowns e filtros. */
export function getWgerCategories(): WgerCategory[] {
  if (categoriesCache) return categoriesCache
  const data = readJson<Array<{ model: string; pk: number; fields: { name: string } }>>('categories.json')
  categoriesCache = data ? data.map(parseCategory) : []
  return categoriesCache
}

/** Equipamento (wger). Para dropdowns e filtros. */
export function getWgerEquipment(): WgerEquipment[] {
  if (equipmentCache) return equipmentCache
  const data = readJson<Array<{ model: string; pk: number; fields: { name: string } }>>('equipment.json')
  equipmentCache = data ? data.map(parseEquipment) : []
  return equipmentCache
}

/** Músculos (wger). Para exibição e seleção. */
export function getWgerMuscles(): WgerMuscle[] {
  if (musclesCache) return musclesCache
  const data = readJson<Array<{ model: string; pk: number; fields: { name: string; name_en: string; is_front: boolean } }>>('muscles.json')
  musclesCache = data ? data.map(parseMuscle) : []
  return musclesCache
}

/** Mapeamento nome wger → enum do schema Supabase. */
export function getWgerMappings(): WgerMappings {
  if (mappingsCache) return mappingsCache
  mappingsCache = readJson<WgerMappings>('mappings.json') || { categoryToEnum: {}, equipmentToEnum: {} }
  return mappingsCache
}

/** Converte nome de categoria wger para enum da tabela exercises. */
export function wgerCategoryToSchema(name: string): SchemaCategory {
  const m = getWgerMappings().categoryToEnum[name]
  return m || 'other'
}

/** Converte nome de equipamento wger para enum da tabela exercises. */
export function wgerEquipmentToSchema(name: string): SchemaEquipment {
  const m = getWgerMappings().equipmentToEnum[name]
  return m || 'none'
}
