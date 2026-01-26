import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// PUT: Atualizar chart
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
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
    const {
      chart_name,
      symbol,
      timeframe,
      theme,
      chart_state,
      drawings_data,
      selected_studies,
      is_favorite
    } = body

    // Atualizar chart
    const updateData: any = {}
    if (chart_name !== undefined) updateData.chart_name = chart_name
    if (symbol !== undefined) updateData.symbol = symbol
    if (timeframe !== undefined) updateData.timeframe = timeframe
    if (theme !== undefined) updateData.theme = theme
    if (chart_state !== undefined) updateData.chart_state = chart_state
    if (drawings_data !== undefined) updateData.drawings_data = drawings_data
    if (selected_studies !== undefined) updateData.selected_studies = selected_studies
    if (is_favorite !== undefined) updateData.is_favorite = is_favorite

    const { data: updatedChart, error } = await supabase
      .from('user_charts')
      .update(updateData)
      .eq('id', params.id)
      .eq('user_id', session.user.id)
      .select()
      .single()

    if (error) {
      console.error('Erro ao atualizar chart:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    if (!updatedChart) {
      return NextResponse.json(
        { success: false, error: 'Chart não encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      chart: updatedChart
    })
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// DELETE: Apagar chart
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
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

    // Apagar chart
    const { error } = await supabase
      .from('user_charts')
      .delete()
      .eq('id', params.id)
      .eq('user_id', session.user.id)

    if (error) {
      console.error('Erro ao apagar chart:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true
    })
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

