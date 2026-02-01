import { NextRequest, NextResponse } from "next/server"
import type { SiteContent } from "@/lib/admin-types"
import { getSupabaseAdmin, requireAdmin, validateRequiredFields } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  // Verificar acesso admin
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const type = searchParams.get('type')

    let query = supabase
      .from('site_content')
      .select('*')
      .order('order_index', { ascending: true })

    if (category) {
      query = query.eq('category', category)
    }
    if (type) {
      query = query.eq('type', type)
    }

    const { data, error } = await query

    if (error) {
      console.error('❌ [ADMIN CONTENT] Erro ao buscar conteúdos:', error)
      // Se a tabela não existir, retornar array vazio em vez de erro
      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
        console.warn('⚠️ [ADMIN CONTENT] Tabela site_content não existe ainda')
        return NextResponse.json({ data: [] })
      }
      return NextResponse.json({ 
        error: error.message || 'Erro ao buscar conteúdos',
        data: [] 
      }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    console.error('❌ [ADMIN CONTENT] Erro:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error.message,
      data: []
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Verificar acesso admin
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const { type, category, title, description, url, content, file_url, file_name, file_size, is_active, order_index, metadata } = body

    // Validação de campos obrigatórios
    const validation = validateRequiredFields(body, ['type', 'category', 'title'])
    if (!validation.valid) {
      return NextResponse.json({ 
        error: validation.error,
        missing: validation.missing
      }, { status: 400 })
    }

    // Validação de valores permitidos
    const validTypes = ['link', 'video', 'file', 'text', 'image']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ 
        error: `Tipo inválido: ${type}. Valores permitidos: ${validTypes.join(', ')}` 
      }, { status: 400 })
    }

    const validCategories = ['navbar', 'footer', 'landing', 'education', 'trading', 'general']
    if (!validCategories.includes(category)) {
      return NextResponse.json({ 
        error: `Categoria inválida: ${category}. Valores permitidos: ${validCategories.join(', ')}` 
      }, { status: 400 })
    }

    // Validação de tamanho de título
    if (title.length > 255) {
      return NextResponse.json({ 
        error: 'Título muito longo (máximo 255 caracteres)' 
      }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('site_content')
      .insert({
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
        created_by: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('❌ [ADMIN CONTENT] Erro ao inserir:', error)
      
      // Se a tabela não existir, retornar erro mais claro
      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
        return NextResponse.json({ 
          error: 'Tabela site_content não existe. Cria a tabela no Supabase primeiro.',
          code: 'TABLE_NOT_FOUND'
        }, { status: 500 })
      }
      
      return NextResponse.json({ 
        error: error.message || 'Erro ao criar conteúdo',
        details: error.details || null,
        code: error.code || null
      }, { status: 500 })
    }

    return NextResponse.json({ data, success: true }, { status: 201 })
  } catch (error: any) {
    console.error('❌ [ADMIN CONTENT] Erro:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error.message 
    }, { status: 500 })
  }
}
