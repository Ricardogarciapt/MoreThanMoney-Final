import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const supabaseAdmin = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    // Aceitar tanto 'userId' quanto 'id' como parâmetro
    const userId = searchParams.get('userId') || searchParams.get('id')

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }


    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('❌ [PROFILE API] Erro ao buscar perfil:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!profile) {
      console.warn('⚠️ [PROFILE API] Perfil não encontrado para:', userId)
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json({ profile })
  } catch (error: any) {
    console.error('❌ [PROFILE API] Erro inesperado:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}



