import { NextRequest, NextResponse } from 'next/server'

// Função para buscar preço histórico da Binance (10 de março de 2025)
async function getBinanceHistoricalPrice(symbol: string, targetDate: string): Promise<number | null> {
  try {
    // Converter data para timestamp
    const targetTimestamp = new Date(targetDate).getTime()
    
    // Buscar dados diários próximos à data
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${targetTimestamp - 86400000}&endTime=${targetTimestamp + 86400000}&limit=5`,
      { next: { revalidate: 86400 } } // Cache por 1 dia (dados históricos não mudam)
    )

    if (!response.ok) return null

    const data = await response.json()
    
    if (data.length === 0) return null
    
    // Pegar o preço de fechamento do dia mais próximo
    const closePrice = parseFloat(data[0][4])
    
    return closePrice
  } catch (error) {
    console.error(`Erro ao buscar preço histórico ${symbol}:`, error)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')
    const date = searchParams.get('date') || '2025-03-10'

    if (!symbol) {
      return NextResponse.json({ 
        error: 'Símbolo é obrigatório' 
      }, { status: 400 })
    }

    const price = await getBinanceHistoricalPrice(symbol, date)

    if (price === null) {
      return NextResponse.json({
        error: 'Preço histórico não encontrado',
        symbol,
        date
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        symbol,
        date,
        price
      }
    })
  } catch (error) {
    console.error('Erro na API de preços históricos:', error)
    return NextResponse.json({
      error: 'Erro ao buscar preço histórico',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 })
  }
}

