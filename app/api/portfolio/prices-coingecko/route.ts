import { NextRequest, NextResponse } from 'next/server'

// Mapeamento de símbolos Binance para CoinGecko IDs
const SYMBOL_TO_COINGECKO: Record<string, string> = {
  'ADAUSDT': 'cardano',
  'XRPUSDT': 'ripple',
  'DOTUSDT': 'polkadot',
  'MATICUSDT': 'matic-network',
  'LINKUSDT': 'chainlink',
  'AVAXUSDT': 'avalanche-2',
  'VETUSDT': 'vechain',
  'ARBUSDT': 'arbitrum',
  'OPUSDT': 'optimism',
  'GRTUSDT': 'the-graph',
  'HBARUSDT': 'hedera-hashgraph',
  'KASUSDT': 'kaspa',
  'JUPUSDT': 'jupiter-exchange-solana',
  'ALGOUSDT': 'algorand',
  'IMXUSDT': 'immutable-x',
  'ONDOUSDT': 'ondo-finance',
  'JTOUSDT': 'jito-governance-token',
  'AEROUSDT': 'aerodrome-finance',
  'ILVUSDT': 'illuvium',
  'FLOWUSDT': 'flow',
  'USDTUSDT': 'tether',
  'BTCUSDT': 'bitcoin',
  'ETHUSDT': 'ethereum',
  'SOLUSDT': 'solana',
  'BNBUSDT': 'binancecoin'
}

// Cache de preços (5 minutos)
const priceCache = new Map<string, { price: number; timestamp: number }>()
const CACHE_DURATION = 300000 // 5 minutos

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbols = searchParams.get('symbols')?.split(',') || []

    if (symbols.length === 0) {
      return NextResponse.json(
        { error: 'Símbolos são obrigatórios' },
        { status: 400 }
      )
    }

    console.log(`💰 [COINGECKO] Buscando preços para ${symbols.length} ativos...`)

    const prices: Record<string, number | null> = {}

    // Verificar cache primeiro
    const uncachedSymbols: string[] = []
    
    for (const symbol of symbols) {
      const cached = priceCache.get(symbol)
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        prices[symbol] = cached.price
        console.log(`💾 [COINGECKO] Cache hit: ${symbol} = $${cached.price}`)
      } else {
        uncachedSymbols.push(symbol)
      }
    }

    // Buscar preços não cacheados
    if (uncachedSymbols.length > 0) {
      // Converter símbolos para IDs CoinGecko
      const coingeckoIds = uncachedSymbols
        .map(s => SYMBOL_TO_COINGECKO[s])
        .filter(Boolean)

      if (coingeckoIds.length > 0) {
        try {
          // API CoinGecko (free tier, sem API key)
          const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds.join(',')}&vs_currencies=usd`,
            {
              next: { revalidate: 300 },
              headers: {
                'Accept': 'application/json'
              }
            }
          )

          if (response.ok) {
            const data = await response.json()

            // Mapear de volta para símbolos
            for (const symbol of uncachedSymbols) {
              const coingeckoId = SYMBOL_TO_COINGECKO[symbol]
              if (coingeckoId && data[coingeckoId]) {
                const price = data[coingeckoId].usd
                prices[symbol] = price
                priceCache.set(symbol, { price, timestamp: Date.now() })
                console.log(`✅ [COINGECKO] ${symbol} = $${price}`)
              } else {
                prices[symbol] = null
                console.log(`⚠️ [COINGECKO] ${symbol} não encontrado`)
              }
            }
          } else {
            console.error(`❌ [COINGECKO] Erro HTTP ${response.status}`)
            // Fallback para null em caso de erro
            uncachedSymbols.forEach(s => prices[s] = null)
          }
        } catch (error) {
          console.error('❌ [COINGECKO] Erro na API:', error)
          uncachedSymbols.forEach(s => prices[s] = null)
        }
      } else {
        console.warn('⚠️ [COINGECKO] Nenhum símbolo válido para buscar')
        uncachedSymbols.forEach(s => prices[s] = null)
      }
    }

    console.log(`✅ [COINGECKO] Retornando ${Object.keys(prices).length} preços`)

    return NextResponse.json({
      success: true,
      prices,
      source: 'CoinGecko',
      cached: symbols.length - uncachedSymbols.length,
      fetched: uncachedSymbols.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ [COINGECKO] Erro:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar preços', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// Endpoint para limpar cache (útil para debug)
export async function DELETE() {
  priceCache.clear()
  console.log('🗑️ [COINGECKO] Cache limpo')
  return NextResponse.json({ success: true, message: 'Cache limpo' })
}

