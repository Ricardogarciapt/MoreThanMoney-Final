import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data, error } = await supabase
      .from('site_content')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { type, category, title, description, url, content, file_url, file_name, file_size, is_active, order_index, metadata } = body

    // Validar campos obrigatórios
    if (!type || !category || !title) {
      return NextResponse.json({ 
        error: 'Campos obrigatórios: type, category, title' 
      }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('site_content')
      .update({
        type,
        category,
        title,
        description: description || null,
        url: url || null,
        content: content || null,
        file_url: file_url || null,
        file_name: file_name || null,
        file_size: file_size || null,
        is_active: is_active ?? true,
        order_index: order_index ?? 0,
        metadata: metadata ?? {},
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('❌ [ADMIN CONTENT] Erro ao atualizar:', error)
      
      if (error.code === 'PGRST116') {
        return NextResponse.json({ 
          error: 'Conteúdo não encontrado',
          code: 'NOT_FOUND'
        }, { status: 404 })
      }
      
      return NextResponse.json({ 
        error: error.message || 'Erro ao atualizar conteúdo',
        code: error.code || null
      }, { status: 500 })
    }

    return NextResponse.json({ data, success: true })
  } catch (error: any) {
    console.error('❌ [ADMIN CONTENT] Erro:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error.message 
    }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error } = await supabase
      .from('site_content')
      .delete()
      .eq('id', params.id)

    if (error) {
      console.error('❌ [ADMIN CONTENT] Erro ao deletar:', error)
      
      if (error.code === 'PGRST116') {
        return NextResponse.json({ 
          error: 'Conteúdo não encontrado',
          code: 'NOT_FOUND'
        }, { status: 404 })
      }
      
      return NextResponse.json({ 
        error: error.message || 'Erro ao deletar conteúdo',
        code: error.code || null
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Conteúdo removido com sucesso' 
    })
  } catch (error: any) {
    console.error('❌ [ADMIN CONTENT] Erro:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error.message 
    }, { status: 500 })
  }
}
