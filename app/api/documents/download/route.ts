import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const supabase = getSupabaseAdmin()

// POST - Incrementar downloads
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { documentId } = body

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID obrigatório' }, { status: 400 })
    }

    // Incrementar downloads usando a função SQL
    const { error } = await supabase.rpc('increment_document_downloads', {
      document_id: documentId
    })

    if (error) {
      console.error('❌ [DOCUMENT DOWNLOAD] Erro:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('❌ [DOCUMENT DOWNLOAD] Erro geral:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

