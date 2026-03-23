import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'
import { cryptoPortfolio, etfPortfolio } from '@/lib/portfolio-data'

interface DCAOpportunity {
  symbol: string
  name: string
  current_price: number
  avg_price_last_7d: number
  avg_price_last_30d: number
  discount_percent: number
  recommendation: 'Forte Compra' | 'Compra' | 'Aguardar' | 'Não Reforçar'
  suggested_amount: number
  /** Percentagem do reforço mensal sugerida para este ativo (0-25). */
  suggested_percent: number
  rationale: string
  confidence: number
  entry_zones: {
    optimal: number
    good: number
    fair: number
  }
  take_profits: number[]
  stop_loss: number
}

// Normalizar símbolo para formato Binance (ex: BTC -> BTCUSDT)
function normalizeBinanceSymbol(symbol: string): string {
  if (!symbol || typeof symbol !== 'string') return symbol
  const aliases: Record<string, string> = {
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

  const cleaned = symbol
    .toUpperCase()
    .replace(/^BINANCE:/, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim()

  if (!cleaned) return symbol
  if (cleaned.endsWith('USDT')) return cleaned

  const mapped = aliases[cleaned] || cleaned
  return mapped.endsWith('USDT') ? mapped : `${mapped}USDT`
}

// Função para buscar dados históricos da Binance
async function getBinanceHistoricalPrices(symbol: string, interval: string, limit: number) {
  const binanceSymbol = normalizeBinanceSymbol(symbol)
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`,
      { next: { revalidate: 300 } }
    )

    if (!response.ok) return null

    const data = await response.json()
    return data
  } catch (error) {
    console.error(`Erro ao buscar histórico ${symbol}:`, error)
    return null
  }
}

// Função para calcular média de preços
function calculateAveragePrice(candles: any[]): number {
  if (!candles || candles.length === 0) return 0
  
  const sum = candles.reduce((acc, candle) => {
    const closePrice = parseFloat(candle[4])
    return acc + closePrice
  }, 0)
  
  return sum / candles.length
}

// Função para analisar oportunidades DCA (com fallback robusto)
async function analyzeDCAOpportunity(
  symbol: string, 
  name: string, 
  plannedInvestment: number,
  entryPrice?: number,
  baseUrl?: string
): Promise<DCAOpportunity | null> {
  const binanceSymbol = normalizeBinanceSymbol(symbol)
  try {
    console.log(`🔍 [DCA] Analisando ${symbol} (${binanceSymbol})...`)
    
    // Buscar dados semanais (1w candles para análise semanal)
    const candlesWeekly = await getBinanceHistoricalPrices(binanceSymbol, '1w', 12) // 12 semanas
    
    // Buscar dados de 7 dias (1d candles)
    const candles7d = await getBinanceHistoricalPrices(binanceSymbol, '1d', 7) // 7 dias
    
    // Buscar dados de 30 dias (1d candles)
    const candles30d = await getBinanceHistoricalPrices(binanceSymbol, '1d', 30) // 30 dias

    // FALLBACK: Se dados históricos falharem MAS temos entry_price, usar método simplificado
    if (!candlesWeekly || !candles7d || !candles30d) {
      console.log(`⚠️ [DCA] Dados históricos indisponíveis para ${symbol}, usando fallback...`)
      
      if (!entryPrice) {
        console.log(`❌ [DCA] Sem entry_price para ${symbol}, ignorando`)
        return null
      }
      
      // Buscar preço atual via CoinGecko (símbolo normalizado para o mapa ADAUSDT, etc.)
      const priceApiUrl = `${baseUrl || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/portfolio/prices-coingecko?symbols=${binanceSymbol}`
      const priceResponse = await fetch(priceApiUrl, { next: { revalidate: 60 } })
      
      if (!priceResponse.ok) {
        console.log(`❌ [DCA] Falha ao buscar preço para ${symbol} (${priceResponse.status})`)
        return null
      }
      
      const priceData = await priceResponse.json()
      const currentPrice = priceData.prices?.[binanceSymbol] ?? priceData.prices?.[symbol]
      
      if (!currentPrice || currentPrice === 0) {
        console.log(`❌ [DCA] Preço inválido para ${symbol}`)
        return null
      }
      
      console.log(`✅ [DCA] Usando fallback para ${symbol}: entry=$${entryPrice}, current=$${currentPrice}`)
      
      // Cálculo simplificado: desconto vs entry_price
      const discountVsEntry = ((entryPrice - currentPrice) / entryPrice) * 100
      
      // Usar entry_price como "média" de referência
      const avgDiscount = discountVsEntry
      const avg7d = entryPrice * 1.05 // Simular 5% acima do entry
      const avg30d = entryPrice * 1.08 // Simular 8% acima do entry
      
      let recommendation: DCAOpportunity['recommendation']
      let confidence: number
      let suggestedAmount: number
      let suggestedPercent: number
      let rationale: string
      
      if (avgDiscount >= 15) {
        recommendation = 'Forte Compra'
        confidence = 85
        suggestedAmount = plannedInvestment * 2
        suggestedPercent = 20
        rationale = `Excelente oportunidade! Preço ${avgDiscount.toFixed(1)}% abaixo do entry price. Momento ideal para reforço agressivo.`
      } else if (avgDiscount >= 10) {
        recommendation = 'Compra'
        confidence = 70
        suggestedAmount = plannedInvestment * 1.5
        suggestedPercent = 15
        rationale = `Boa oportunidade! Preço ${avgDiscount.toFixed(1)}% abaixo do entry price. Considerar reforço.`
      } else if (avgDiscount >= 5) {
        recommendation = 'Aguardar'
        confidence = 55
        suggestedAmount = plannedInvestment * 0.5
        suggestedPercent = 5
        rationale = `Leve desconto de ${avgDiscount.toFixed(1)}%. Manter reforço planeado.`
      } else {
        recommendation = 'Não Reforçar'
        confidence = 30
        suggestedAmount = 0
        suggestedPercent = 0
        rationale = `Preço ${Math.abs(avgDiscount).toFixed(1)}% ${avgDiscount < 0 ? 'ACIMA' : 'próximo'} do entry price. Aguardar correção antes de reforçar.`
      }
      
      const entryZones = {
        optimal: currentPrice * 0.95,
        good: currentPrice * 0.97,
        fair: currentPrice * 0.99
      }
      
      const takeProfits = [
        currentPrice * 1.2,
        currentPrice * 1.5,
        currentPrice * 2.0
      ]
      
      const stopLoss = currentPrice * 0.85
      
      return {
        symbol,
        name,
        current_price: currentPrice,
        avg_price_last_7d: avg7d,
        avg_price_last_30d: avg30d,
        discount_percent: avgDiscount,
        recommendation,
        suggested_amount: suggestedAmount,
        suggested_percent: suggestedPercent,
        rationale,
        confidence,
        entry_zones: entryZones,
        take_profits: takeProfits,
        stop_loss: stopLoss
      }
    }
    
    // MÉTODO ORIGINAL (com dados históricos da Binance)

    // Preço atual
    const currentPrice = parseFloat(candles7d[candles7d.length - 1][4])
    
    // Médias
    const avgWeekly = calculateAveragePrice(candlesWeekly) // Média semanal (12 semanas)
    const avg7d = calculateAveragePrice(candles7d)
    const avg30d = calculateAveragePrice(candles30d)
    
    // Calcular desconto em relação às médias (foco na média semanal)
    const discountWeekly = ((avgWeekly - currentPrice) / avgWeekly) * 100
    const discount7d = ((avg7d - currentPrice) / avg7d) * 100
    const discount30d = ((avg30d - currentPrice) / avg30d) * 100
    
    // Desconto médio ponderado (mais peso para média semanal)
    const avgDiscount = (discountWeekly * 0.5) + (discount7d * 0.3) + (discount30d * 0.2)
    
    let recommendation: DCAOpportunity['recommendation']
    let confidence: number
    let suggestedAmount: number
    let suggestedPercent: number
    let rationale: string
    
    if (avgDiscount >= 15) {
      recommendation = 'Forte Compra'
      confidence = 90
      suggestedAmount = plannedInvestment * 2
      suggestedPercent = 20
      rationale = `Excelente oportunidade! Preço ${avgDiscount.toFixed(1)}% abaixo da média. Momento ideal para reforço agressivo.`
    } else if (avgDiscount >= 10) {
      recommendation = 'Compra'
      confidence = 75
      suggestedAmount = plannedInvestment * 1.5
      suggestedPercent = 15
      rationale = `Boa oportunidade de compra com ${avgDiscount.toFixed(1)}% de desconto. Reforço recomendado acima do planeado.`
    } else if (avgDiscount >= 5) {
      recommendation = 'Compra'
      confidence = 60
      suggestedAmount = plannedInvestment
      suggestedPercent = 10
      rationale = `Leve desconto de ${avgDiscount.toFixed(1)}%. Manter reforço planeado.`
    } else if (avgDiscount >= -5) {
      recommendation = 'Aguardar'
      confidence = 40
      suggestedAmount = plannedInvestment * 0.5
      suggestedPercent = 5
      rationale = `Preço próximo da média (${avgDiscount.toFixed(1)}%). Considerar aguardar por melhor ponto de entrada.`
    } else {
      recommendation = 'Não Reforçar'
      confidence = 30
      suggestedAmount = 0
      suggestedPercent = 0
      rationale = `Preço ${Math.abs(avgDiscount).toFixed(1)}% ACIMA da média. Aguardar correção antes de reforçar.`
    }
    
    // Calcular zonas de entrada
    const entryZones = {
      optimal: avg30d * 0.85, // 15% abaixo da média de 30 dias
      good: avg30d * 0.90, // 10% abaixo
      fair: avg30d * 0.95 // 5% abaixo
    }
    
    // Calcular take profits baseado no potencial de crescimento
    const takeProfits = [
      currentPrice * 1.20, // +20%
      currentPrice * 1.50, // +50%
      currentPrice * 2.00, // +100%
    ]
    
    // Stop loss: 15% abaixo do preço atual
    const stopLoss = currentPrice * 0.85
    
    return {
      symbol,
      name,
      current_price: currentPrice,
      avg_price_last_7d: avg7d,
      avg_price_last_30d: avg30d,
      discount_percent: avgDiscount,
      recommendation,
      suggested_amount: suggestedAmount,
      suggested_percent: suggestedPercent,
      rationale,
      confidence,
      entry_zones: entryZones,
      take_profits: takeProfits,
      stop_loss: stopLoss
    }
  } catch (error) {
    console.error(`Erro ao analisar ${symbol}:`, error)
    return null
  }
}

// Função para criar notificação de Forte Compra
async function createStrongBuyNotification(opportunity: DCAOpportunity) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        }
    )
    
    // Buscar todos os usuários (apenas VIP e Admin para não spammar)
    const { data: users } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .or('user_type.eq.admin,member_category.eq.vip')

    if (!users || users.length === 0) return

    // Criar notificação para cada usuário
    const notifications = users.map(user => ({
      user_id: user.id,
      type: 'dca_opportunity',
      title: `🚀 Forte Compra: ${opportunity.name}`,
      message: `Oportunidade DCA! ${opportunity.name} com ${opportunity.discount_percent.toFixed(1)}% de desconto! Preço: $${opportunity.current_price.toFixed(4)}. Sugestão: ${opportunity.suggested_percent}% do reforço.`,
      read: false
    }))

    await supabase
      .from('notifications')
      .insert(notifications)

    console.log(`📢 Notificações de Forte Compra criadas para ${users.length} usuários (${opportunity.symbol})`)
  } catch (error) {
    console.error('Erro ao criar notificações:', error)
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'all' // 'crypto', 'etf', 'all'

    let opportunities: DCAOpportunity[] = []

    // Base URL para chamadas internas (fallback CoinGecko)
    const baseUrl = request?.url ? new URL(request.url).origin : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')

    // Analisar Cryptos - BUSCAR DO ADMIN PANEL (Supabase) com service role para evitar RLS
    if (type === 'crypto' || type === 'all') {
      console.log('📊 [DCA SMART] Buscando crypto assets do Admin Panel...')
      
      const supabaseAdmin = getSupabaseAdmin()
      
      const { data: adminCrypto, error } = await supabaseAdmin
        .from('admin_crypto_portfolio')
        .select('symbol, criptomoeda, reforco_mensal, entry_price')
        .neq('symbol', 'USDTUSDT')
        .order('percentual', { ascending: false })
      
      if (error) {
        console.error('❌ [DCA SMART] Erro ao buscar do admin:', error)
        console.log('⚠️ [DCA SMART] Usando dados locais como fallback')
        
        // Fallback para dados locais
        const cryptoOpportunities = await Promise.all(
          cryptoPortfolio
            .filter(asset => asset.symbol !== 'USDTUSDT')
            .map(asset => analyzeDCAOpportunity(asset.symbol, asset.criptomoeda, asset.reforco_mensal, asset.entry_price, baseUrl))
        )
        opportunities.push(...cryptoOpportunities.filter(o => o !== null) as DCAOpportunity[])
      } else if (adminCrypto && adminCrypto.length > 0) {
        console.log(`✅ [DCA SMART] ${adminCrypto.length} crypto do Admin Panel`)
        
        const cryptoOpportunities = await Promise.all(
          adminCrypto.map(asset => 
            analyzeDCAOpportunity(asset.symbol, asset.criptomoeda, asset.reforco_mensal, asset.entry_price, baseUrl)
          )
        )
        opportunities.push(...cryptoOpportunities.filter(o => o !== null) as DCAOpportunity[])
      } else {
        console.log('⚠️ [DCA SMART] Admin Panel vazio, usando dados locais')
        
        const cryptoOpportunities = await Promise.all(
          cryptoPortfolio
            .filter(asset => asset.symbol !== 'USDTUSDT')
            .map(asset => analyzeDCAOpportunity(asset.symbol, asset.criptomoeda, asset.reforco_mensal, asset.entry_price, baseUrl))
        )
        opportunities.push(...cryptoOpportunities.filter(o => o !== null) as DCAOpportunity[])
      }
    }

    console.log(`📊 [DCA SMART] Total de oportunidades analisadas: ${opportunities.length}`)
    console.log(`🔍 [DCA SMART] Breakdown:`)
    opportunities.forEach(o => {
      console.log(`   ${o.symbol}: ${o.recommendation} (${o.discount_percent.toFixed(1)}%)`)
    })

    // Categorizar oportunidades
    const categorized = {
      strong_buys: opportunities.filter(o => o.recommendation === 'Forte Compra'),
      buys: opportunities.filter(o => o.recommendation === 'Compra'),
      waits: opportunities.filter(o => o.recommendation === 'Aguardar'),
      no_reinforce: opportunities.filter(o => o.recommendation === 'Não Reforçar')
    }

    // Criar notificações apenas para Forte Compra
    if (categorized.strong_buys.length > 0) {
      console.log(`🚀 [DCA SMART] ${categorized.strong_buys.length} Forte Compra detectadas, criando notificações...`)
      
      for (const opp of categorized.strong_buys) {
        await createStrongBuyNotification(opp)
      }
    }

    // Resumo
    const summary = {
      total_assets_analyzed: opportunities.length,
      strong_buy_count: categorized.strong_buys.length,
      buy_count: categorized.buys.length,
      total_suggested_investment: categorized.strong_buys.reduce((sum, o) => sum + o.suggested_amount, 0) + 
                                   categorized.buys.reduce((sum, o) => sum + o.suggested_amount, 0),
      best_opportunity: categorized.strong_buys[0] || categorized.buys[0] || null,
      notifications_created: categorized.strong_buys.length
    }

    console.log(`✅ [DCA SMART] Análise concluída:`, summary)

    return NextResponse.json({
      success: true,
      data: {
        opportunities,
        categorized,
        summary
      }
    })
  } catch (error) {
    console.error('❌ [DCA SMART] Erro:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro ao analisar oportunidades DCA',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
