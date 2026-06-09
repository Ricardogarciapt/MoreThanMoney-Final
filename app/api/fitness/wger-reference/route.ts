import { NextResponse } from 'next/server'
import { getWgerCategories, getWgerEquipment, getWgerMuscles, getWgerMappings } from '@/lib/wger-data'

/**
 * GET: Dados de referência do wger (categorias, equipamento, músculos, mapeamentos).
 * Usado pela UI para filtros e dropdowns; mapeamentos convertem para o schema Supabase.
 */
export async function GET() {
  try {
    const categories = getWgerCategories()
    const equipment = getWgerEquipment()
    const muscles = getWgerMuscles()
    const mappings = getWgerMappings()
    return NextResponse.json({
      categories,
      equipment,
      muscles,
      mappings,
    })
  } catch (error) {
    console.error('❌ [WGER REFERENCE] Erro:', error)
    return NextResponse.json(
      { error: 'Erro ao carregar referência wger' },
      { status: 500 }
    )
  }
}
