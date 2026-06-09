import { NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

interface NotionAsset {
  symbol: string
  name: string
  entry_price?: number
  target_1?: number
  target_2?: number
  target_3?: number
  stop_loss?: number
  status: "active" | "closed" | "watching"
  category: "crypto" | "stocks" | "forex"
}

export async function GET() {
  try {
    // URL do Notion público
    const notionUrl = "https://harmonious-comma-e85.notion.site/Portefolio-Cripto-e-Stocks-76557dddfbc348aba2f6e24ea1f5133e"
    
    // Mock data baseado no portfólio MTM
    // Em produção, você usaria a API oficial do Notion ou web scraping
    const mockAssets: NotionAsset[] = [
      {
        symbol: "BTCUSD",
        name: "Bitcoin",
        entry_price: 42000,
        target_1: 45000,
        target_2: 48000,
        target_3: 52000,
        stop_loss: 39000,
        status: "active",
        category: "crypto"
      },
      {
        symbol: "ETHUSD",
        name: "Ethereum",
        entry_price: 2800,
        target_1: 3000,
        target_2: 3200,
        target_3: 3500,
        stop_loss: 2600,
        status: "active",
        category: "crypto"
      },
      {
        symbol: "SOLUSD",
        name: "Solana",
        entry_price: 95,
        target_1: 105,
        target_2: 115,
        target_3: 130,
        stop_loss: 88,
        status: "active",
        category: "crypto"
      },
      {
        symbol: "XAUUSD",
        name: "Gold",
        entry_price: 2030,
        target_1: 2080,
        target_2: 2120,
        target_3: 2180,
        stop_loss: 1990,
        status: "active",
        category: "forex"
      },
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        entry_price: 185,
        target_1: 195,
        target_2: 205,
        target_3: 220,
        stop_loss: 175,
        status: "active",
        category: "stocks"
      },
      {
        symbol: "NVDA",
        name: "NVIDIA",
        entry_price: 480,
        target_1: 520,
        target_2: 560,
        target_3: 600,
        stop_loss: 450,
        status: "active",
        category: "stocks"
      },
    ]

    // Calcular performance simulada
    const assetsWithPerformance = mockAssets.map(asset => {
      // Simular preço atual com variação aleatória
      const variation = (Math.random() - 0.5) * 0.1 // -5% a +5%
      const currentPrice = asset.entry_price! * (1 + variation)
      const performance_7d = ((Math.random() - 0.3) * 10) // -3% a +7%
      const performance_30d = ((Math.random() - 0.2) * 20) // -4% a +16%
      const performance_ytd = ((Math.random()) * 30) // 0% a +30%

      return {
        ...asset,
        current_price: currentPrice,
        performance_7d,
        performance_30d,
        performance_ytd,
        status: currentPrice >= (asset.target_3 || Infinity) ? "closed" : "active"
      }
    })

    return NextResponse.json({
      success: true,
      data: assetsWithPerformance,
      lastUpdated: new Date().toISOString(),
      source: notionUrl
    })
  } catch (error: any) {
    console.error("Erro ao buscar portfólio Notion:", error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

