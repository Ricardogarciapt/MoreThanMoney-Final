import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Cliente Supabase Admin (Service Role - bypass RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    // Aceitar tanto 'userId' quanto 'id' como parâmetro
    const userId = searchParams.get('userId') || searchParams.get('id')

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    console.log('🔍 [PROFILE API] Buscando perfil via service role:', userId)

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

    console.log('✅ [PROFILE API] Perfil encontrado:', profile.email)
    return NextResponse.json({ profile })
  } catch (error: any) {
    console.error('❌ [PROFILE API] Erro inesperado:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}



