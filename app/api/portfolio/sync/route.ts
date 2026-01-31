import { NextRequest, NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

// Inicializar cliente do Notion
const notion = new Client({ 
  auth: process.env.NOTION_API_KEY 
}) as any

const DATABASE_ID = process.env.NEXT_PUBLIC_NOTION_PORTFOLIO_DATABASE_ID || process.env.NOTION_PORTFOLIO_DATABASE_ID || ''

interface NotionAsset {
  symbol: string
  name: string
  entry_price: number
  current_price?: number
  target_1?: number
  target_2?: number
  target_3?: number
  stop_loss?: number
  category: 'crypto' | 'stocks' | 'forex' | 'commodity'
  status: 'active' | 'closed' | 'watching'
}

// Função para buscar preço de crypto via CoinGecko
async function getCryptoPrice(symbol: string): Promise<number | null> {
  try {
    const symbolMap: { [key: string]: string } = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'SOL': 'solana',
      'ADA': 'cardano',
      'DOT': 'polkadot',
      'LINK': 'chainlink',
      'MATIC': 'matic-network',
      'AVAX': 'avalanche-2',
      'ATOM': 'cosmos',
      'UNI': 'uniswap',
      'XRP': 'ripple',
      'BNB': 'binancecoin',
      'DOGE': 'dogecoin',
      'LTC': 'litecoin',
      'BCH': 'bitcoin-cash',
      'ALGO': 'algorand',
      'VET': 'vechain',
      'FIL': 'filecoin',
      'ICP': 'internet-computer',
      'NEAR': 'near',
      'SAND': 'the-sandbox',
      'MANA': 'decentraland',
      'AXS': 'axie-infinity',
      'THETA': 'theta-token',
      'AAVE': 'aave',
      'MKR': 'maker',
      'CAKE': 'pancakeswap-token',
      'CRV': 'curve-dao-token',
      'SNX': 'havven',
      'COMP': 'compound-governance-token',
      'SUSHI': 'sushi',
      'YFI': 'yearn-finance',
      'RUNE': 'thorchain',
      'FTM': 'fantom',
      'ONE': 'harmony',
      'ZIL': 'zilliqa',
      'ENJ': 'enjincoin',
      'CHZ': 'chiliz',
      'BAT': 'basic-attention-token',
      'ZRX': '0x',
      'LRC': 'loopring',
      'GRT': 'the-graph',
      'QNT': 'quant-network',
      'APE': 'apecoin',
      '1INCH': '1inch',
      'WAVES': 'waves',
      'NEO': 'neo',
      'DASH': 'dash',
      'XMR': 'monero',
      'ZEC': 'zcash',
      'SUI': 'sui',
      'CELESTIA': 'celestia',
      'TIA': 'celestia',
      'ASTER': 'aster',
      'JUPITER': 'jupiter-exchange-solana',
      'JUP': 'jupiter-exchange-solana'
    }
    
    const coinId = symbolMap[symbol.toUpperCase()] || symbol.toLowerCase()
    
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      { 
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 }
      }
    )

    if (!response.ok) return null

    const data = await response.json()
    return data[coinId]?.usd || null
  } catch (error) {
    console.error(`Erro ao buscar preço de ${symbol}:`, error)
    return null
  }
}

// Função para buscar preço de ação via Yahoo Finance (alternativa)
async function getStockPrice(symbol: string): Promise<number | null> {
  try {
    // Usar API alternativa gratuita
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`,
      { next: { revalidate: 60 } }
    )

    if (!response.ok) return null

    const data = await response.json()
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    return price || null
  } catch (error) {
    console.error(`Erro ao buscar preço de ${symbol}:`, error)
    return null
  }
}

// Função para buscar preço via OpenAI (fallback)
async function getPriceViaOpenAI(symbol: string, category: string): Promise<number | null> {
  try {
    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) return null

    const prompt = `What is the current market price of ${symbol} (${category})? Respond ONLY with the numeric price in USD, no other text.`
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 50
      })
    })

    if (!response.ok) return null

    const data = await response.json()
    const priceText = data.choices?.[0]?.message?.content?.trim()
    const price = parseFloat(priceText?.replace(/[^0-9.]/g, ''))
    
    return isNaN(price) ? null : price
  } catch (error) {
    console.error(`Erro ao buscar preço via OpenAI para ${symbol}:`, error)
    return null
  }
}

// Função principal para buscar preço com fallbacks
async function getAssetPrice(symbol: string, category: string): Promise<number | null> {
  let price: number | null = null

  // Tentar CoinGecko para crypto
  if (category === 'crypto') {
    price = await getCryptoPrice(symbol)
    if (price) return price
  }

  // Tentar Yahoo Finance para stocks
  if (category === 'stocks') {
    price = await getStockPrice(symbol)
    if (price) return price
  }

  // Fallback para OpenAI
  price = await getPriceViaOpenAI(symbol, category)
  
  return price
}

export async function GET(request: NextRequest) {
  try {
    if (!DATABASE_ID) {
      return NextResponse.json({ 
        error: 'Notion Database ID não configurado' 
      }, { status: 500 })
    }

    // Buscar dados do Notion
    // @ts-ignore - Notion client types may be outdated
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      sorts: [
        {
          property: 'Nome',
          direction: 'ascending'
        }
      ]
    })

    // Processar e enriquecer dados com preços atuais
    const assets: NotionAsset[] = []

    for (const page of response.results) {
      try {
        const props: any = (page as any).properties
        
        // Extrair dados do Notion
        const symbol = props['Símbolo']?.rich_text?.[0]?.plain_text || ''
        const name = props['Nome']?.title?.[0]?.plain_text || ''
        const entry_price = props['Preço de Entrada']?.number || 0
        const target_1 = props['Target 1']?.number
        const target_2 = props['Target 2']?.number
        const target_3 = props['Target 3']?.number
        const stop_loss = props['Stop Loss']?.number
        const category = props['Categoria']?.select?.name?.toLowerCase() || 'crypto'
        const status = props['Status']?.select?.name?.toLowerCase() || 'active'

        if (!symbol || !name) continue

        // Buscar preço atual com múltiplos fallbacks
        const current_price = await getAssetPrice(symbol, category)

        assets.push({
          symbol,
          name,
          entry_price,
          current_price: current_price || entry_price,
          target_1,
          target_2,
          target_3,
          stop_loss,
          category: category as 'crypto' | 'stocks' | 'forex' | 'commodity',
          status: status as 'active' | 'closed' | 'watching'
        })
      } catch (error) {
        console.error('Erro ao processar ativo:', error)
        continue
      }
    }

    // Calcular métricas do portfolio
    const totalInvestment = assets.reduce((sum, asset) => sum + asset.entry_price, 0)
    const currentValue = assets.reduce((sum, asset) => sum + (asset.current_price || asset.entry_price), 0)
    const totalPNL = currentValue - totalInvestment
    const totalPNLPercent = (totalPNL / totalInvestment) * 100

    // Agrupar por categoria
    const byCategory = assets.reduce((acc, asset) => {
      if (!acc[asset.category]) {
        acc[asset.category] = []
      }
      acc[asset.category].push(asset)
      return acc
    }, {} as Record<string, NotionAsset[]>)

    return NextResponse.json({
      success: true,
      data: {
        assets,
        byCategory,
        metrics: {
          totalInvestment,
          currentValue,
          totalPNL,
          totalPNLPercent,
          totalAssets: assets.length,
          activeAssets: assets.filter(a => a.status === 'active').length
        },
        lastUpdated: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Erro na API de sincronização:', error)
    return NextResponse.json({ 
      error: 'Erro ao sincronizar portfolio',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 })
  }
}
