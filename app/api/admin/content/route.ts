import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { SiteContent } from "@/lib/admin-types"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
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
      console.warn('Site content table might not exist:', error.message)
      return NextResponse.json({ data: [] })
    }

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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
        created_by: 'admin' // TODO: Get from auth
      })
      .select()
      .single()

    if (error) {
      console.error('❌ [ADMIN CONTENT] Erro ao inserir:', error)
      return NextResponse.json({ 
        error: error.message,
        details: error.details || null
      }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error: any) {
    console.error('❌ [ADMIN CONTENT] Erro:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error.message 
    }, { status: 500 })
  }
}
