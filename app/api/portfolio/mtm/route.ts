import { NextRequest, NextResponse } from 'next/server'
import { cryptoPortfolio, etfPortfolio, portfolioTotals } from '@/lib/portfolio-data'
import { getSupabaseAnonServerClient } from '@/lib/supabase-admin-client'

// Cache para evitar múltiplas chamadas
const priceCache = new Map<string, { price: number; timestamp: number }>()
const CACHE_DURATION = 120000 // 2 minutos

const BINANCE_SYMBOL_ALIASES: Record<string, string> = {
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
}

function normalizeBinanceSymbol(rawSymbol: string): string {
  if (!rawSymbol) return rawSymbol

  const symbol = rawSymbol
    .toUpperCase()
    .replace(/^BINANCE:/, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim()

  if (!symbol) return rawSymbol

  if (symbol.endsWith('USDT')) return symbol

  const mapped = BINANCE_SYMBOL_ALIASES[symbol] || symbol
  return mapped.endsWith('USDT') ? mapped : `${mapped}USDT`
}

// Função para buscar preço da Binance
async function getBinancePrice(symbol: string): Promise<number | null> {
  try {
    const normalizedSymbol = normalizeBinanceSymbol(symbol)

    // Verificar cache
    const cached = priceCache.get(normalizedSymbol)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`💰 [BINANCE] Cache hit: ${normalizedSymbol} = $${cached.price}`)
      return cached.price
    }

    console.log(`🔍 [BINANCE] Buscando preço: ${symbol} -> ${normalizedSymbol}`)
    
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${normalizedSymbol}`,
      { 
        next: { revalidate: 120 }
      }
    )

    if (!response.ok) {
      console.error(`❌ [BINANCE] Erro HTTP ${response.status} para ${normalizedSymbol}`)
      return null
    }

    const data = await response.json()
    const price = parseFloat(data.price)
    
    console.log(`✅ [BINANCE] ${normalizedSymbol} = $${price}`)
    
    // Atualizar cache
    priceCache.set(normalizedSymbol, { price, timestamp: Date.now() })
    
    return price
  } catch (error) {
    console.error(`❌ [BINANCE] Erro ao buscar preço ${symbol}:`, error)
    return null
  }
}

// Função para buscar preço de ETF via Yahoo Finance
async function getETFPrice(symbol: string): Promise<number | null> {
  try {
    // Verificar cache
    const cached = priceCache.get(symbol)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.price
    }

    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`,
      { next: { revalidate: 120 } }
    )

    if (!response.ok) return null

    const data = await response.json()
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    
    if (price) {
      // Atualizar cache
      priceCache.set(symbol, { price, timestamp: Date.now() })
      return price
    }
    
    return null
  } catch (error) {
    console.error(`Erro ao buscar preço ${symbol}:`, error)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // 'crypto' ou 'etf' ou 'all'

    console.log('📊 [API MTM] Iniciando busca de portfolio, type:', type)

    let result: any = {}
    let useNotion = false

    // Tentar buscar dados do Notion primeiro
    try {
      console.log('🔍 [API MTM] Tentando buscar dados do Notion...')
      console.log('🔑 [API MTM] NEXT_PUBLIC_NOTION_API_KEY:', process.env.NEXT_PUBLIC_NOTION_API_KEY ? 'Configurado' : 'FALTANDO!')
      console.log('🔑 [API MTM] NEXT_PUBLIC_NOTION_PORTFOLIO_DATABASE_ID:', process.env.NEXT_PUBLIC_NOTION_PORTFOLIO_DATABASE_ID ? 'Configurado' : 'FALTANDO!')
      
      const notionResponse = await fetch(`${request.nextUrl.origin}/api/portfolio/notion-scrape`)
      
      console.log('📡 [API MTM] Notion scrape status:', notionResponse.status)
      
      if (notionResponse.ok) {
        const notionData = await notionResponse.json()
        console.log('📦 [API MTM] Notion data:', { success: notionData.success, hasCrypto: !!notionData.data?.crypto, hasETF: !!notionData.data?.etf })
        
        if (notionData.success) {
          console.log('✅ [API MTM] Dados do Notion obtidos com sucesso!')
          useNotion = true
          
          if (type === 'crypto' || type === 'all' || !type) {
            result.crypto = notionData.data.crypto
          }
          
          if (type === 'etf' || type === 'all' || !type) {
            result.etf = notionData.data.etf
          }
          
          if (type === 'all' || !type) {
            result.scraping_info = notionData.data.scraping_info
          }
        }
      } else {
        console.log('⚠️ [API MTM] Notion scrape falhou, status:', notionResponse.status)
      }
    } catch (notionError) {
      console.error('❌ [API MTM] Erro ao buscar do Notion:', notionError)
    }

    // Se Notion falhou, tentar buscar dos dados ADMIN do Supabase
    let useAdminData = false
    if (!useNotion) {
      try {
        console.log('📊 [API MTM] Tentando buscar dados ADMIN do Supabase...')
        
        const supabaseClient = getSupabaseAnonServerClient()

        if (type === 'crypto' || type === 'all' || !type) {
          const { data: adminCrypto, error: cryptoErr } = await supabaseClient
            .from('admin_crypto_portfolio')
            .select('*')
            .order('percentual', { ascending: false })

          if (!cryptoErr && adminCrypto && adminCrypto.length > 0) {
            console.log(`✅ [API MTM] ${adminCrypto.length} crypto da tabela ADMIN`)
            
            const cryptoWithPrices = await Promise.all(
              adminCrypto.map(async (asset: any) => {
                const currentPrice = await getBinancePrice(asset.symbol)
                const entryPrice = asset.entry_price || currentPrice || 1
                const totalInvested = asset.investimento_inicial + asset.reforco_anual
                const quantity = totalInvested / entryPrice
                const currentValue = currentPrice ? quantity * currentPrice : totalInvested
                const pnl = currentValue - totalInvested
                const pnlPercent = (pnl / totalInvested) * 100

                return {
                  ...asset,
                  current_price: currentPrice,
                  quantity,
                  total_invested: totalInvested,
                  current_value: currentValue,
                  pnl,
                  pnl_percent: pnlPercent
                }
              })
            )

            result.crypto = {
              assets: cryptoWithPrices,
              totals: {
                investimento_total: adminCrypto.reduce((sum: number, a: any) => sum + a.investimento_inicial, 0),
                reforco_mensal: adminCrypto.reduce((sum: number, a: any) => sum + a.reforco_mensal, 0),
                reforco_anual: adminCrypto.reduce((sum: number, a: any) => sum + a.reforco_anual, 0),
                crescimento_potencial: adminCrypto.reduce((sum: number, a: any) => sum + a.potencial_crescimento_valor, 0),
                percentual_total: adminCrypto.reduce((sum: number, a: any) => sum + a.percentual, 0)
              }
            }
            useAdminData = true
          }
        }

        if (type === 'etf' || type === 'all' || !type) {
          const { data: adminETF, error: etfErr } = await supabaseClient
            .from('admin_etf_portfolio')
            .select('*')
            .order('percentual', { ascending: false })

          if (!etfErr && adminETF && adminETF.length > 0) {
            console.log(`✅ [API MTM] ${adminETF.length} ETF da tabela ADMIN`)
            
            const etfWithPrices = await Promise.all(
              adminETF.map(async (asset: any) => {
                const currentPrice = await getETFPrice(asset.symbol)
                const entryPrice = asset.entry_price || currentPrice || 1
                const totalInvested = asset.investimento_inicial + asset.reforco_total_5anos
                const quantity = totalInvested / entryPrice
                const currentValue = currentPrice ? quantity * currentPrice : totalInvested
                const pnl = currentValue - totalInvested
                const pnlPercent = (pnl / totalInvested) * 100

                return {
                  ...asset,
                  current_price: currentPrice,
                  quantity,
                  total_invested: totalInvested,
                  current_value: currentValue,
                  pnl,
                  pnl_percent: pnlPercent
                }
              })
            )

            result.etf = {
              assets: etfWithPrices,
              totals: {
                investimento_total: adminETF.reduce((sum: number, a: any) => sum + a.investimento_inicial, 0),
                reforco_semanal: adminETF.reduce((sum: number, a: any) => sum + a.reforco_semanal, 0),
                reforco_total_5anos: adminETF.reduce((sum: number, a: any) => sum + a.reforco_total_5anos, 0),
                crescimento_esperado: adminETF.reduce((sum: number, a: any) => sum + a.crescimento_esperado_valor, 0),
                percentual_total: adminETF.reduce((sum: number, a: any) => sum + a.percentual, 0)
              }
            }
            useAdminData = true
          }
        }

        if (useAdminData) {
          console.log('✅ [API MTM] Dados ADMIN carregados com sucesso!')
        }
      } catch (adminError) {
        console.error('❌ [API MTM] Erro ao buscar dados ADMIN:', adminError)
      }
    }

    // Fallback para dados locais se Notion E Admin falharem
    if (!useNotion && !useAdminData) {
      console.log('📂 [API MTM] Usando dados locais (portfolio-data.ts)...')
      
      // Buscar dados de Crypto
      if (type === 'crypto' || type === 'all' || !type) {
        const cryptoWithPrices = await Promise.all(
          cryptoPortfolio.map(async (asset) => {
            const currentPrice = await getBinancePrice(asset.symbol)
            
            // Calcular métricas com entry_price correto
            const entryPrice = asset.entry_price || currentPrice || 1
            const totalInvested = asset.investimento_inicial + asset.reforco_anual
            
            // Quantidade de tokens comprados com o investimento
            const quantity = totalInvested / entryPrice
            
            // Valor atual baseado na quantidade e preço atual
            const currentValue = currentPrice ? quantity * currentPrice : totalInvested
            const pnl = currentValue - totalInvested
            const pnlPercent = (pnl / totalInvested) * 100
            
            return {
              ...asset,
              entry_price: entryPrice,
              current_price: currentPrice,
              quantity,
              total_invested: totalInvested,
              current_value: currentValue,
              pnl,
              pnl_percent: pnlPercent
            }
          })
        )

        result.crypto = {
          assets: cryptoWithPrices,
          totals: portfolioTotals.crypto,
          summary: {
            total_assets: cryptoWithPrices.length,
            total_invested: portfolioTotals.crypto.investimento_total + portfolioTotals.crypto.reforco_anual,
            projected_growth: portfolioTotals.crypto.crescimento_potencial
          }
        }
      }
    }

    // Buscar dados de ETF
    if (type === 'etf' || type === 'all' || !type) {
      const etfWithPrices = await Promise.all(
        etfPortfolio.map(async (asset) => {
          const currentPrice = await getETFPrice(asset.symbol)
          
          // Calcular métricas com entry_price correto
          const entryPrice = asset.entry_price || currentPrice || 1
          const totalInvested = asset.investimento_inicial + asset.reforco_total_5anos
          
          // Quantidade de shares compradas com o investimento
          const quantity = totalInvested / entryPrice
          
          // Valor atual baseado na quantidade e preço atual
          const currentValue = currentPrice ? quantity * currentPrice : totalInvested
          const pnl = currentValue - totalInvested
          const pnlPercent = (pnl / totalInvested) * 100
          
          return {
            ...asset,
            entry_price: entryPrice,
            current_price: currentPrice,
            quantity,
            total_invested: totalInvested,
            current_value: currentValue,
            pnl,
            pnl_percent: pnlPercent
          }
        })
      )

      result.etf = {
        assets: etfWithPrices,
        totals: portfolioTotals.etf,
        summary: {
          total_assets: etfWithPrices.length,
          total_invested: portfolioTotals.etf.investimento_inicial + portfolioTotals.etf.reforco_total_5anos,
          projected_growth: portfolioTotals.etf.crescimento_esperado
        }
      }
    }

    // Totais gerais
    if (type === 'all' || !type) {
      result.grand_total = {
        ...portfolioTotals.total,
        last_updated: new Date().toISOString()
      }
    }

    const source = useNotion ? 'Notion Database' : useAdminData ? 'Admin Panel (Supabase)' : 'Dados Locais (Fallback)'
    console.log('✅ [API MTM] Retornando dados - Fonte:', source)
    console.log('📊 [API MTM] Crypto assets:', result.crypto?.assets?.length || 0)
    console.log('📊 [API MTM] ETF assets:', result.etf?.assets?.length || 0)

    return NextResponse.json({
      success: true,
      data: result,
      source,
      last_sync: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ [API MTM] Erro na API MTM Portfolio:', error)
    return NextResponse.json({
      error: 'Erro ao carregar portfólio MTM',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 })
  }
}

