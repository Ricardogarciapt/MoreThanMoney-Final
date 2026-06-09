import { NextRequest, NextResponse } from 'next/server'

// Cache de preços para evitar chamadas excessivas
const priceCache = new Map<string, { price: number; timestamp: number }>()
const CACHE_DURATION = 60000 // 1 minuto

// Mapeamento de símbolos para IDs do CoinGecko
const COINGECKO_MAP: { [key: string]: string } = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDT': 'tether',
  'BNB': 'binancecoin',
  'XRP': 'ripple',
  'SOL': 'solana',
  'ADA': 'cardano',
  'DOGE': 'dogecoin',
  'MATIC': 'matic-network',
  'DOT': 'polkadot',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'AVAX': 'avalanche-2',
  'ATOM': 'cosmos',
  'LTC': 'litecoin',
  'BCH': 'bitcoin-cash',
  'NEAR': 'near',
  'ALGO': 'algorand',
  'FTM': 'fantom',
  'SAND': 'the-sandbox',
  'MANA': 'decentraland',
  'AXS': 'axie-infinity',
  'AAVE': 'aave',
  'XLM': 'stellar',
  'VET': 'vechain',
  'ICP': 'internet-computer',
  'FIL': 'filecoin',
  'HBAR': 'hedera-hashgraph',
  'EOS': 'eos',
  'THETA': 'theta-token',
  'XTZ': 'tezos',
  'APE': 'apecoin',
  'QNT': 'quant-network',
  'GRT': 'the-graph',
  'MKR': 'maker',
  'EGLD': 'elrond-erd-2',
  'RUNE': 'thorchain',
  'STX': 'blockstack',
  'KCS': 'kucoin-shares',
  'CAKE': 'pancakeswap-token',
  'CRV': 'curve-dao-token',
  'ZEC': 'zcash',
  'ENJ': 'enjincoin',
  'CHZ': 'chiliz',
  'SUSHI': 'sushi',
  'BAT': 'basic-attention-token',
  'COMP': 'compound-governance-token',
  'YFI': 'yearn-finance',
  'SNX': 'havven',
  '1INCH': '1inch',
  'LRC': 'loopring',
  'ZIL': 'zilliqa',
  'DASH': 'dash',
  'XMR': 'monero',
  'WAVES': 'waves',
  'NEO': 'neo',
  'QTUM': 'qtum',
  'OMG': 'omisego',
  'ZRX': '0x',
  'ICX': 'icon',
  'ONT': 'ontology',
  'IOTA': 'iota',
  'BTT': 'bittorrent',
  'HOT': 'holotoken',
  'CELO': 'celo',
  'ONE': 'harmony',
  'KLAY': 'klay-token',
  'TFUEL': 'theta-fuel',
  'ANKR': 'ankr',
  'CKB': 'nervos-network',
  'RVN': 'ravencoin',
  'SC': 'siacoin',
  'DGB': 'digibyte',
  'LSK': 'lisk',
  'STORJ': 'storj',
  'REN': 'republic-protocol',
  'SKL': 'skale',
  'OCEAN': 'ocean-protocol',
  'INJ': 'injective-protocol',
  'AUDIO': 'audius',
  'BAND': 'band-protocol',
  'CELR': 'celer-network',
  'RSR': 'reserve-rights-token',
  'IOTX': 'iotex',
  'SXP': 'swipe',
  'DENT': 'dent',
  'WRX': 'wazirx',
  'FUN': 'funfair',
  'ARPA': 'arpa-chain',
  'CTSI': 'cartesi',
  'DUSK': 'dusk-network',
  'MDT': 'measurable-data-token',
  'STMX': 'storm',
  'WAN': 'wanchain',
  'KEY': 'selfkey',
  'TROY': 'troy',
  'VITE': 'vite',
  'FTT': 'ftx-token'
}

async function getCryptoPrice(symbol: string): Promise<number | null> {
  try {
    const coinId = COINGECKO_MAP[symbol.toUpperCase()] || symbol.toLowerCase()
    
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      { 
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 } // Cache por 60 segundos
      }
    )

    if (!response.ok) {
      console.error(`Erro ao buscar preço de ${symbol}:`, response.statusText)
      return null
    }

    const data = await response.json()
    return data[coinId]?.usd || null
  } catch (error) {
    console.error(`Erro ao buscar preço de ${symbol}:`, error)
    return null
  }
}

async function getStockPrice(symbol: string): Promise<number | null> {
  try {
    // Usar Yahoo Finance alternativo ou Twelve Data API
    // Por enquanto, retornamos null para implementar outra solução
    // Você pode usar Alpha Vantage, Twelve Data, ou Yahoo Finance API
    
    // Exemplo com Alpha Vantage (requer API key):
    // const apiKey = process.env.ALPHA_VANTAGE_API_KEY
    // const response = await fetch(
    //   `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
    // )
    
    return null
  } catch (error) {
    console.error(`Erro ao buscar preço de ação ${symbol}:`, error)
    return null
  }
}

async function getForexPrice(pair: string): Promise<number | null> {
  try {
    // Usar uma API de Forex como exchangerate-api.com
    const [base, quote] = pair.split('/')
    
    if (!base || !quote) return null
    
    const response = await fetch(
      `https://api.exchangerate-api.com/v4/latest/${base}`,
      { next: { revalidate: 300 } } // Cache por 5 minutos
    )

    if (!response.ok) return null

    const data = await response.json()
    return data.rates[quote] || null
  } catch (error) {
    console.error(`Erro ao buscar preço de forex ${pair}:`, error)
    return null
  }
}

async function getCommodityPrice(symbol: string): Promise<number | null> {
  try {
    // Commodities podem ser obtidas via APIs específicas
    // Por enquanto, usar CoinGecko para ouro, prata, etc.
    const commodityMap: { [key: string]: string } = {
      'XAUUSD': 'tether-gold',
      'XAGUSD': 'pax-gold',
      'OIL': 'petroleum',
      'GAS': 'gas'
    }
    
    const coinId = commodityMap[symbol.toUpperCase()]
    if (!coinId) return null
    
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      { next: { revalidate: 300 } }
    )

    if (!response.ok) return null

    const data = await response.json()
    return data[coinId]?.usd || null
  } catch (error) {
    console.error(`Erro ao buscar preço de commodity ${symbol}:`, error)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbols = searchParams.get('symbols')?.split(',') || []
    const type = searchParams.get('type') || 'crypto' // crypto, stock, forex, commodity

    if (symbols.length === 0) {
      return NextResponse.json({ error: 'Símbolos são obrigatórios' }, { status: 400 })
    }

    const prices: { [key: string]: number | null } = {}

    for (const symbol of symbols) {
      const cacheKey = `${type}:${symbol}`
      const cached = priceCache.get(cacheKey)
      
      // Verificar cache
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        prices[symbol] = cached.price
        continue
      }

      // Buscar preço conforme o tipo
      let price: number | null = null
      
      switch (type.toLowerCase()) {
        case 'crypto':
          price = await getCryptoPrice(symbol)
          break
        case 'stock':
          price = await getStockPrice(symbol)
          break
        case 'forex':
          price = await getForexPrice(symbol)
          break
        case 'commodity':
          price = await getCommodityPrice(symbol)
          break
        default:
          // Tentar crypto como padrão
          price = await getCryptoPrice(symbol)
      }

      if (price !== null) {
        priceCache.set(cacheKey, { price, timestamp: Date.now() })
        prices[symbol] = price
      } else {
        prices[symbol] = null
      }
    }

    return NextResponse.json({ prices })
  } catch (error) {
    console.error('Erro na API de preços:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { assets } = body // Array de { symbol, type }

    if (!Array.isArray(assets)) {
      return NextResponse.json({ error: 'Assets deve ser um array' }, { status: 400 })
    }

    const prices: { [key: string]: number | null } = {}

    for (const asset of assets) {
      const { symbol, type = 'crypto' } = asset
      const cacheKey = `${type}:${symbol}`
      const cached = priceCache.get(cacheKey)
      
      // Verificar cache
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        prices[symbol] = cached.price
        continue
      }

      // Buscar preço conforme o tipo
      let price: number | null = null
      
      switch (type.toLowerCase()) {
        case 'crypto':
          price = await getCryptoPrice(symbol)
          break
        case 'stock':
          price = await getStockPrice(symbol)
          break
        case 'forex':
          price = await getForexPrice(symbol)
          break
        case 'commodity':
          price = await getCommodityPrice(symbol)
          break
        default:
          price = await getCryptoPrice(symbol)
      }

      if (price !== null) {
        priceCache.set(cacheKey, { price, timestamp: Date.now() })
        prices[symbol] = price
      } else {
        prices[symbol] = null
      }
    }

    return NextResponse.json({ prices })
  } catch (error) {
    console.error('Erro na API de preços:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
