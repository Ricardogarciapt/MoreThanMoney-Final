import { NextRequest, NextResponse } from 'next/server'
import { Client } from '@notionhq/client'
import { fetchCryptoUsdBest } from '@/lib/crypto-usd'

const NOTION_KEY =
  process.env.NOTION_API_KEY?.trim() ||
  process.env.NEXT_PUBLIC_NOTION_API_KEY?.trim() ||
  ''
const DATABASE_ID =
  process.env.NOTION_PORTFOLIO_DATABASE_ID?.trim() ||
  process.env.NEXT_PUBLIC_NOTION_PORTFOLIO_DATABASE_ID?.trim() ||
  ''

// Inicializar cliente do Notion (preferir NOTION_API_KEY no servidor)
const notion = new Client({ auth: NOTION_KEY })

console.log('🔑 [NOTION SCRAPE] Inicializando...')
console.log('🔑 [NOTION SCRAPE] API Key:', NOTION_KEY ? 'Configurado ✅' : 'FALTANDO ❌')
console.log('🔑 [NOTION SCRAPE] Database ID:', DATABASE_ID ? 'Configurado ✅' : 'FALTANDO ❌')

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
  /** Preço de entrada no Notion, se existir coluna */
  entry_price_notion?: number | null
}

const CRYPTO_NAME_TO_TICKER: Record<string, string> = {
  CARDANO: 'ADA',
  RIPPLE: 'XRP',
  POLKADOT: 'DOT',
  POLYGON: 'MATIC',
  CHAINLINK: 'LINK',
  AVALANCHE: 'AVAX',
  VECHAIN: 'VET',
  ARBITRUM: 'ARB',
  OPTIMISM: 'OP',
  THEGRAPH: 'GRT',
  HEDERA: 'HBAR',
  KASPA: 'KAS',
  JUPITER: 'JUP',
  ALGORAND: 'ALGO',
  IMMUTABLE: 'IMX',
  TETHER: 'USDT',
  ONDO: 'ONDO',
  FLOW: 'FLOW',
}

function normalizeBinanceSymbol(rawSymbol: string, fallbackName?: string): string {
  const cleaned = (rawSymbol || '')
    .toUpperCase()
    .replace(/^BINANCE:/, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim()

  const fallback = (fallbackName || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim()

  const candidate = cleaned || CRYPTO_NAME_TO_TICKER[fallback] || fallback
  if (!candidate) return ''
  if (candidate.endsWith('USDT')) return candidate
  const mapped = CRYPTO_NAME_TO_TICKER[candidate] || candidate
  return mapped.endsWith('USDT') ? mapped : `${mapped}USDT`
}

// Função para extrair texto de propriedade rich_text
function getRichText(property: any): string {
  return property?.rich_text?.[0]?.plain_text || ''
}

// Função para extrair texto de propriedade title
function getTitle(property: any): string {
  return property?.title?.[0]?.plain_text || ''
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
        note: 'Usando dados locais em vez de scraping',
      }, { status: 500 })
    }

    if (!NOTION_KEY) {
      return NextResponse.json(
        {
          error: 'Notion API key não configurada',
          note: 'Defina NOTION_API_KEY ou NEXT_PUBLIC_NOTION_API_KEY na Vercel',
        },
        { status: 500 }
      )
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
          symbol = normalizeBinanceSymbol(getRichText(props['Símbolo']), cryptoName)
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

        const entryFromNotion =
          props['Preço de Entrada']?.number ??
          props['Preço de entrada']?.number ??
          props['Entry Price']?.number ??
          props['Preço Entrada']?.number ??
          null

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
          tipo,
          entry_price_notion: entryFromNotion,
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
        const currentPrice = await fetchCryptoUsdBest(asset.symbol)
        const totalInvested = asset.investimento_inicial + asset.reforco_total
        const entryPrice =
          typeof asset.entry_price_notion === 'number' && asset.entry_price_notion > 0
            ? asset.entry_price_notion
            : currentPrice && currentPrice > 0
              ? currentPrice * 0.92
              : 1
        const quantity = totalInvested / entryPrice
        const currentValue =
          currentPrice != null && currentPrice > 0 ? quantity * currentPrice : totalInvested
        const pnl = currentValue - totalInvested
        const pnlPercent = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0

        return {
          ...asset,
          current_price: currentPrice,
          entry_price: entryPrice,
          quantity,
          total_invested: totalInvested,
          current_value: currentValue,
          pnl,
          pnl_percent: pnlPercent,
          criptomoeda: asset.nome,
          reforco_mensal: asset.reforco_periodico,
          reforco_anual: asset.reforco_total,
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

