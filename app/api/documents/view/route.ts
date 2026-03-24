import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const supabase = getSupabaseAdmin()

// POST - Incrementar visualizações
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { documentId } = body

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID obrigatório' }, { status: 400 })
    }

    // Incrementar views usando a função SQL
    const { error } = await supabase.rpc('increment_document_views', {
      document_id: documentId
    })

    if (error) {
      console.error('❌ [DOCUMENT VIEW] Erro:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('❌ [DOCUMENT VIEW] Erro geral:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

