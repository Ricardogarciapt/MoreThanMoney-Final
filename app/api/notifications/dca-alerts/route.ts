import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      { next: { revalidate: 0 } }
    )
    if (!response.ok) return null
    const data = await response.json()
    return parseFloat(data.price)
  } catch {
    return null
  }
}

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

    // Buscar alertas do usuário
    const { data: alerts, error } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar alertas:', error)
      return NextResponse.json({ error: 'Erro ao buscar alertas' }, { status: 500 })
    }

    return NextResponse.json({ alerts })
  } catch (error) {
    console.error('Erro na API de alertas:', error)
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
    const { symbol, alert_type, target_value, symbol_type } = body

    if (!symbol || !alert_type || target_value == null) {
      return NextResponse.json(
        { error: 'symbol, alert_type e target_value são obrigatórios' },
        { status: 400 }
      )
    }

    const currentPrice = await getCurrentPrice(symbol)
    if (!currentPrice) {
      return NextResponse.json(
        { error: `Não foi possível obter preço atual para ${symbol}` },
        { status: 400 }
      )
    }

    // Criar alerta
    const { data: newAlert, error } = await supabase
      .from('price_alerts')
      .insert({
        user_id: session.user.id,
        symbol,
        symbol_type: symbol_type || 'crypto',
        alert_type, // 'price_above', 'price_below', 'take_profit', 'stop_loss', 'dca_opportunity'
        target_value,
        current_price: currentPrice,
        is_active: true
      })
      .select()
      .single()

    if (error) {
      console.error('Erro ao criar alerta:', error)
      return NextResponse.json({ error: 'Erro ao criar alerta' }, { status: 500 })
    }

    return NextResponse.json({ alert: newAlert })
  } catch (error) {
    console.error('Erro na API de alertas:', error)
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
      return NextResponse.json({ error: 'ID do alerta é obrigatório' }, { status: 400 })
    }

    // Deletar alerta
    const { error } = await supabase
      .from('price_alerts')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id)

    if (error) {
      console.error('Erro ao deletar alerta:', error)
      return NextResponse.json({ error: 'Erro ao deletar alerta' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro na API de alertas:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

