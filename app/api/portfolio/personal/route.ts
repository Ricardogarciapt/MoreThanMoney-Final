import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET() {
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
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Buscar ativos pessoais do usuário
    const { data: assets, error } = await supabase
      .from('personal_portfolio')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar portfólio pessoal:', error)
      return NextResponse.json({ error: 'Erro ao buscar portfólio' }, { status: 500 })
    }

    return NextResponse.json({ assets })
  } catch (error) {
    console.error('Erro na API de portfólio pessoal:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const {
      symbol,
      name,
      quantity,
      purchase_price,
      buy_price,
      current_price,
      asset_type,
      notes,
    } = body

    const pp = purchase_price ?? buy_price
    if (!symbol || !name || pp == null || quantity == null) {
      return NextResponse.json(
        { error: 'symbol, name, quantity e purchase_price são obrigatórios' },
        { status: 400 }
      )
    }

    // Adicionar ativo ao portfólio pessoal
    const { data: newAsset, error } = await supabase
      .from('personal_portfolio')
      .insert({
        user_id: session.user.id,
        symbol,
        name,
        purchase_price: pp,
        quantity,
        current_price: current_price ?? pp,
        asset_type: asset_type || 'crypto',
        notes: notes ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('Erro ao adicionar ativo:', error)
      return NextResponse.json({ error: 'Erro ao adicionar ativo' }, { status: 500 })
    }

    return NextResponse.json({ asset: newAsset })
  } catch (error) {
    console.error('Erro na API de portfólio pessoal:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
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
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const {
      id,
      symbol,
      name,
      quantity,
      purchase_price,
      buy_price,
      current_price,
      asset_type,
      notes,
    } = body

    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
    }

    const pp = purchase_price ?? buy_price

    // Atualizar ativo do portfólio pessoal
    const { data: updatedAsset, error } = await supabase
      .from('personal_portfolio')
      .update({
        symbol,
        name,
        ...(pp != null ? { purchase_price: pp } : {}),
        quantity,
        current_price,
        ...(asset_type != null ? { asset_type } : {}),
        ...(notes !== undefined ? { notes } : {}),
      })
      .eq('id', id)
      .eq('user_id', session.user.id)
      .select()
      .single()

    if (error) {
      console.error('Erro ao atualizar ativo:', error)
      return NextResponse.json({ error: 'Erro ao atualizar ativo' }, { status: 500 })
    }

    return NextResponse.json({ asset: updatedAsset })
  } catch (error) {
    console.error('Erro na API de portfólio pessoal:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
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
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID do ativo é obrigatório' }, { status: 400 })
    }

    // Remover ativo do portfólio pessoal
    const { error } = await supabase
      .from('personal_portfolio')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id)

    if (error) {
      console.error('Erro ao remover ativo:', error)
      return NextResponse.json({ error: 'Erro ao remover ativo' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro na API de portfólio pessoal:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
