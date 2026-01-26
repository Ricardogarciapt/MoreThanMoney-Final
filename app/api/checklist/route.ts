import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: Carregar progresso da checklist
export async function GET(request: NextRequest) {
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
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      )
    }

    // Buscar progresso da checklist
    const { data: progress, error } = await supabase
      .from('user_checklist_progress')
      .select('*')
      .eq('user_id', session.user.id)
      .single()

    // Se não existe, retornar estrutura vazia
    if (error && error.code === 'PGRST116') {
      return NextResponse.json({
        success: true,
        progress: {
          checklist_data: {
            sections: []
          },
          total_items: 0,
          completed_items: 0,
          progress_percentage: 0
        }
      })
    }

    if (error) {
      console.error('Erro ao buscar checklist:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      progress
    })
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST: Salvar progresso da checklist
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
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { checklist_data, total_items, completed_items } = body

    // Calcular progresso
    const progress_percentage = total_items > 0 
      ? (completed_items / total_items) * 100 
      : 0

    // Verificar se já existe progresso
    const { data: existing } = await supabase
      .from('user_checklist_progress')
      .select('id')
      .eq('user_id', session.user.id)
      .single()

    let result

    if (existing) {
      // Atualizar progresso existente
      const { data: updated, error } = await supabase
        .from('user_checklist_progress')
        .update({
          checklist_data: checklist_data || {},
          total_items: total_items || 0,
          completed_items: completed_items || 0,
          progress_percentage,
          last_completed_at: completed_items > 0 ? new Date().toISOString() : null
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        console.error('Erro ao atualizar checklist:', error)
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        )
      }

      result = updated
    } else {
      // Criar novo progresso
      const { data: newProgress, error } = await supabase
        .from('user_checklist_progress')
        .insert({
          user_id: session.user.id,
          checklist_data: checklist_data || {},
          total_items: total_items || 0,
          completed_items: completed_items || 0,
          progress_percentage,
          last_completed_at: completed_items > 0 ? new Date().toISOString() : null
        })
        .select()
        .single()

      if (error) {
        console.error('Erro ao criar checklist:', error)
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        )
      }

      result = newProgress
    }

    return NextResponse.json({
      success: true,
      progress: result
    })
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

