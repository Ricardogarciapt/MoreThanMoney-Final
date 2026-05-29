import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { data: signals, error } = await supabase
      .from('telegram_signals')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar sinais:', error)
      return NextResponse.json({ error: 'Erro ao buscar sinais' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      signals: signals || [],
      total: signals?.length || 0
    })
  } catch (error) {
    console.error('Erro geral:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const signal = await request.json()

    // Aqui você salvaria o sinal no banco de dados
    console.log("Novo sinal recebido:", signal)

    return NextResponse.json({
      success: true,
      message: "Sinal processado com sucesso",
    })
  } catch (error) {
    console.error("Erro ao processar sinal:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao processar sinal",
      },
      { status: 500 },
    )
  }
}
