import { NextRequest, NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

// Inicializar cliente do Notion
const notion = new Client({ 
  auth: process.env.NEXT_PUBLIC_NOTION_API_KEY 
})

const DATABASE_ID = process.env.NEXT_PUBLIC_NOTION_PORTFOLIO_DATABASE_ID || ''

console.log('🔑 [NOTION SCRAPE] Inicializando...')
console.log('🔑 [NOTION SCRAPE] API Key:', process.env.NEXT_PUBLIC_NOTION_API_KEY ? 'Configurado ✅' : 'FALTANDO ❌')
console.log('🔑 [NOTION SCRAPE] Database ID:', DATABASE_ID || 'FALTANDO ❌')

interface NotionAsset {
  id: string
  categoria: string
  nome: string
  symbol: string
  percentual: number
  investimento_inicial: number
  reforco_periodico: number
  reforco_total: number
  potencial_crescimento_percent: number
  potencial_crescimento_valor: number
  tipo: 'crypto' | 'etf'
}

// Função para extrair texto de propriedade rich_text
function getRichText(property: any): string {
  return property?.rich_text?.[0]?.plain_text || ''
}

// Função para extrair texto de propriedade title
function getTitle(property: any): string {
  return property?.title?.[0]?.plain_text || ''
}

// Função para buscar preço da Binance
async function getBinancePrice(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      { next: { revalidate: 60 } }
    )
    if (!response.ok) return null
    const data = await response.json()
    return parseFloat(data.price)
  } catch (error) {
    console.error(`Erro ao buscar preço ${symbol}:`, error)
    return null
  }
}

// Função para buscar preço de ETF
async function getETFPrice(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`,
      { next: { revalidate: 60 } }
    )
    if (!response.ok) return null
    const data = await response.json()
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice || null
  } catch (error) {
    console.error(`Erro ao buscar preço ${symbol}:`, error)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!DATABASE_ID) {
      return NextResponse.json({ 
        error: 'Notion Database ID não configurado',
        note: 'Usando dados locais em vez de scraping'
      }, { status: 500 })
    }

    console.log('🔍 Iniciando scraping do Notion...')
    console.log('📊 Database ID:', DATABASE_ID)

    // Buscar dados do Notion
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      page_size: 100
    })

    console.log(`✅ Encontradas ${response.results.length} entradas no Notion`)

    const cryptoAssets: NotionAsset[] = []
    const etfAssets: NotionAsset[] = []

    // Processar cada página do Notion
    for (const page of response.results) {
      try {
        const props: any = (page as any).properties
        
        // Extrair dados
        const categoria = getRichText(props['Categoria']) || getTitle(props['Categoria']) || ''
        const nome = getTitle(props['Nome']) || getTitle(props['Criptomoeda']) || getTitle(props['ETF']) || ''
        const percentual = props['Percentual']?.number || 0
        const investimento_inicial = props['Investimento Inicial']?.number || props['Investimento Inicial (€)']?.number || 0
        
        // Determinar se é crypto ou ETF baseado na categoria ou nome da coluna
        let symbol = ''
        let tipo: 'crypto' | 'etf' = 'crypto'
        let reforco_periodico = 0
        let reforco_total = 0
        
        // Tentar identificar o tipo
        if (props['Criptomoeda']) {
          tipo = 'crypto'
          const cryptoName = getTitle(props['Criptomoeda'])
          symbol = getRichText(props['Símbolo']) || cryptoName.toUpperCase() + 'USDT'
          reforco_periodico = props['Reforço Mensal']?.number || props['Reforço Mensal (€)']?.number || 0
          reforco_total = props['Reforço Anual']?.number || props['Reforço Anual (€)']?.number || 0
        } else if (props['ETF']) {
          tipo = 'etf'
          const etfName = getTitle(props['ETF'])
          symbol = getRichText(props['Símbolo']) || etfName
          reforco_periodico = props['Reforço Semanal']?.number || 0
          reforco_total = props['Reforço Total']?.number || props['Reforço Total (€)']?.number || 0
        }

        const potencial_crescimento_percent = props['Potencial de Crescimento (%)']?.number || props['Crescimento Esperado (%)']?.number || 0
        const potencial_crescimento_valor = props['Potencial de Crescimento (€)']?.number || props['Crescimento Esperado (€)']?.number || 0

        if (!nome || !symbol) continue

        const asset: NotionAsset = {
          id: page.id,
          categoria,
          nome,
          symbol,
          percentual,
          investimento_inicial,
          reforco_periodico,
          reforco_total,
          potencial_crescimento_percent,
          potencial_crescimento_valor,
          tipo
        }

        if (tipo === 'crypto') {
          cryptoAssets.push(asset)
        } else {
          etfAssets.push(asset)
        }
      } catch (error) {
        console.error('Erro ao processar página:', error)
        continue
      }
    }

    console.log(`✅ Processados ${cryptoAssets.length} cryptos e ${etfAssets.length} ETFs`)

    // Buscar preços em paralelo
    console.log('💰 Buscando preços...')
    
    const cryptoWithPrices = await Promise.all(
      cryptoAssets.map(async (asset) => {
        const currentPrice = await getBinancePrice(asset.symbol)
        const totalInvested = asset.investimento_inicial + asset.reforco_total
        
        return {
          ...asset,
          current_price: currentPrice,
          total_invested: totalInvested,
          criptomoeda: asset.nome,
          reforco_mensal: asset.reforco_periodico,
          reforco_anual: asset.reforco_total
        }
      })
    )

    const etfWithPrices = await Promise.all(
      etfAssets.map(async (asset) => {
        const currentPrice = await getETFPrice(asset.symbol)
        const totalInvested = asset.investimento_inicial + asset.reforco_total
        
        return {
          ...asset,
          current_price: currentPrice,
          total_invested: totalInvested,
          etf: asset.nome,
          reforco_semanal: asset.reforco_periodico,
          reforco_total_5anos: asset.reforco_total,
          crescimento_esperado_percent: asset.potencial_crescimento_percent,
          crescimento_esperado_valor: asset.potencial_crescimento_valor
        }
      })
    )

    console.log('✅ Preços atualizados!')

    return NextResponse.json({
      success: true,
      data: {
        crypto: {
          assets: cryptoWithPrices,
          total_assets: cryptoWithPrices.length
        },
        etf: {
          assets: etfWithPrices,
          total_assets: etfWithPrices.length
        },
        scraping_info: {
          source: 'Notion Database',
          database_id: DATABASE_ID,
          total_pages: response.results.length,
          crypto_found: cryptoAssets.length,
          etf_found: etfAssets.length
        }
      },
      last_sync: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Erro no scraping do Notion:', error)
    
    // Fallback para dados locais
    console.log('⚠️ Usando dados locais como fallback')
    
    return NextResponse.json({
      error: 'Erro ao fazer scraping do Notion',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
      fallback: true,
      note: 'Usando dados locais do portfolio-data.ts'
    }, { status: 500 })
  }
}

