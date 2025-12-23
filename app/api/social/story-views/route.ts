import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// POST: Marcar categoria como visualizada
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        }
    )
    
    // Verificar autenticação
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { categoryId } = body

    if (!categoryId) {
      return NextResponse.json({ error: 'categoryId é obrigatório' }, { status: 400 })
    }

    // Inserir ou atualizar visualização (upsert)
    const { error } = await supabase
      .from('story_views')
      .upsert({
        user_id: session.user.id,
        category_id: categoryId,
        viewed_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,category_id'
      })

    if (error) {
      console.error('❌ [STORY VIEWS] Erro ao marcar como vista:', error)
      return NextResponse.json({ error: 'Erro ao marcar categoria como vista' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ [STORY VIEWS] Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// GET: Obter categorias visualizadas pelo usuário
export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        }
    )
    
    // Verificar autenticação
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Buscar todas as categorias visualizadas pelo usuário
    const { data: views, error } = await supabase
      .from('story_views')
      .select('category_id')
      .eq('user_id', session.user.id)

    if (error) {
      console.error('❌ [STORY VIEWS] Erro ao buscar visualizações:', error)
      return NextResponse.json({ error: 'Erro ao buscar visualizações' }, { status: 500 })
    }

    const viewedCategories = new Set(views?.map(v => v.category_id) || [])
    return NextResponse.json({ viewedCategories: Array.from(viewedCategories) })
  } catch (error) {
    console.error('❌ [STORY VIEWS] Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

