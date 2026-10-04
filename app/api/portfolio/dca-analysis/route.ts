import { NextRequest, NextResponse } from "next/server"
import { chamarIA, mensagemIndisponivel } from "@/lib/ia/chamar"
import { normalizeBinancePair, fetchCoinGeckoOhlcAsKlines } from "@/lib/crypto-usd"

interface CandleData {
  timeframe: string
  candles: number[][]
}

interface SentimentAnalysis {
  category: 'Positive' | 'Neutral' | 'Negative'
  score: number
  rationale: string
}

interface DCARecommendation {
  acao: string
  entradas: string
  stop_loss: string
  take_profit: string[]
  justificacao: string
  confidence: number
}

async function fetchCandlestickData(symbol: string, interval: string, limit: number = 200) {
  try {
    const pair = normalizeBinancePair(symbol)
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`,
      { next: { revalidate: 300 } }
    )
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.error(`Erro ao buscar candlesticks ${interval}:`, error)
    return null
  }
}

async function fetchNewsData(symbol: string) {
  try {
    const apiKey = process.env.NEWS_API_KEY?.trim()
    if (!apiKey) {
      console.warn("[DCA ANALYSIS] NEWS_API_KEY não definida — notícias omitidas")
      return []
    }
    const today = new Date()
    const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000)
    const fromDate = threeDaysAgo.toISOString().split("T")[0]

    const response = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(symbol)} OR crypto&from=${fromDate}&sortBy=popularity&apiKey=${apiKey}`,
      { next: { revalidate: 3600 } }
    )

    if (!response.ok) return []

    const data = await response.json()
    return (
      data.articles?.slice(0, 10).map((article: { title?: string; description?: string }) => ({
        title: article.title,
        description: article.description,
      })) || []
    )
  } catch (error) {
    console.error("Erro ao buscar notícias:", error)
    return []
  }
}

// Sentimento pela porta única da IA (`chamarIA`), em JSON. Quando a cadeia falha, o painel fica
// «Neutral» com o MOTIVO honesto no rationale — não um «Erro na análise» mudo.
async function analyzeSentiment(articles: { title?: string; description?: string }[], assetLabel: string) {
  try {
    const newsBlock =
      articles.length > 0
        ? `Analise as seguintes notícias recentes (ativo / mercado: ${assetLabel}):\n\n${JSON.stringify(
            articles.map((a) => ({ title: a.title, description: a.description }))
          )}`
        : `Não há notícias recentes disponíveis (NewsAPI vazia ou sem NEWS_API_KEY). Ativo: ${assetLabel}.
Com base no teu conhecimento geral do mercado cripto e macro, fornece uma avaliação prudente em JSON (sem inventar notícias específicas de hoje).`

    const prompt = `Você é um analista especializado em criptomoedas com expertise em análise fundamental, técnica, econômica e geopolítica.

${newsBlock}

Forneça uma análise completa considerando:

1. **Análise Técnica:**
   - Tendências de preço e volume
   - Níveis de suporte e resistência
   - Padrões de mercado

2. **Análise Econômica:**
   - Impacto de políticas monetárias (Fed, BCE)
   - Inflação e taxas de juros
   - Liquidez de mercado
   - Adoção institucional

3. **Análise Geopolítica:**
   - Regulamentações governamentais
   - Tensões geopolíticas que afetam o mercado
   - Mudanças legislativas (SEC, MiCA Europa, etc)
   - Adoção por países

4. **Análise de Sentimento:**
   - Sentimento geral do mercado
   - Fear & Greed Index
   - Confiança dos investidores

Retorne APENAS um JSON com esta estrutura:
{
  "shortTermSentiment": {
    "category": "Positive|Neutral|Negative",
    "score": número entre -1 e 1,
    "rationale": "análise curto prazo (1-4 semanas) considerando fatores técnicos e notícias recentes"
  },
  "longTermSentiment": {
    "category": "Positive|Neutral|Negative",
    "score": número entre -1 e 1,
    "rationale": "análise longo prazo (3-12 meses) considerando fatores macroeconômicos, adoção e regulamentação"
  },
  "economicFactors": {
    "inflationImpact": "Alto|Médio|Baixo",
    "interestRatesImpact": "Positivo|Neutro|Negativo",
    "summary": "resumo do impacto econômico"
  },
  "geopoliticalFactors": {
    "regulatoryRisk": "Alto|Médio|Baixo",
    "adoptionTrend": "Crescente|Estável|Decrescente",
    "summary": "resumo geopolítico e regulatório"
  }
}`

    const r = await chamarIA({
      tarefa: 'portfolio-dca-sentimento',
      mensagens: [{ role: 'user', content: prompt }],
      maxTokens: 1200,
      temperatura: 0.3,
      json: true,
    })
    return JSON.parse(r.texto)
  } catch (error) {
    const motivo = mensagemIndisponivel(error)
    console.error('Erro na análise de sentiment:', motivo)
    return {
      shortTermSentiment: { category: 'Neutral', score: 0, rationale: motivo },
      longTermSentiment: { category: 'Neutral', score: 0, rationale: motivo }
    }
  }
}

// Função para calcular indicadores técnicos
function calculateIndicators(candles: number[][]) {
  const closes = candles.map((c) => Number(c[4]))
  const volumes = candles.map((c) => Number(c[5]))

  let gains = 0,
    losses = 0
  for (let i = 1; i < 14 && i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) gains += change
    else losses -= change
  }
  const lossDenom = losses === 0 ? 1e-9 : losses
  const rsi = 100 - 100 / (1 + gains / lossDenom)
  
  const n = closes.length
  const sma20 = n >= 1 ? closes.slice(-Math.min(20, n)).reduce((a, b) => a + b, 0) / Math.min(20, n) : closes[0] || 0
  const sma50 = n >= 1 ? closes.slice(-Math.min(50, n)).reduce((a, b) => a + b, 0) / Math.min(50, n) : sma20
  const sma200 = n >= 1 ? closes.slice(-Math.min(200, n)).reduce((a, b) => a + b, 0) / Math.min(200, n) : sma50

  const avgVolume =
    volumes.length >= 1
      ? volumes.slice(-Math.min(20, volumes.length)).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length)
      : 1
  const currentVolume = volumes[volumes.length - 1] || 0
  
  return {
    rsi,
    sma20,
    sma50,
    sma200,
    currentPrice: closes[closes.length - 1],
    volumeRatio: avgVolume > 0 ? currentVolume / avgVolume : 1
  }
}

// Função principal para gerar recomendação DCA
function generateDCARecommendation(
  symbol: string,
  indicators: any,
  sentiment: any
): { curto_prazo: DCARecommendation; longo_prazo: DCARecommendation } {
  
  const currentPrice = indicators.currentPrice
  const rsi = indicators.rsi
  const sentimentScore = (sentiment.shortTermSentiment.score + sentiment.longTermSentiment.score) / 2
  
  // Curto Prazo
  let shortTermAction = 'Hold'
  let shortTermConfidence = 50
  
  if (rsi < 40 && sentimentScore > 0) {
    shortTermAction = 'Comprar'
    shortTermConfidence = 75
  } else if (rsi > 70) {
    shortTermAction = 'Vender'
    shortTermConfidence = 70
  } else if (rsi >= 40 && rsi <= 60 && sentimentScore > 0.3) {
    shortTermAction = 'Comprar seletivamente'
    shortTermConfidence = 60
  }
  
  const shortTermEntry = currentPrice * 0.98
  const shortTermStopLoss = currentPrice * 0.95
  const shortTermTP1 = currentPrice * 1.03
  const shortTermTP2 = currentPrice * 1.05
  
  // Longo Prazo
  let longTermAction = 'Acumulação'
  let longTermConfidence = 70
  
  if (sentiment.longTermSentiment.score < -0.5) {
    longTermAction = 'Aguardar'
    longTermConfidence = 40
  } else if (currentPrice < indicators.sma200) {
    longTermAction = 'Forte Acumulação'
    longTermConfidence = 85
  }
  
  const longTermEntry = indicators.sma200 * 0.95
  const longTermStopLoss = indicators.sma200 * 0.85
  const longTermTP1 = currentPrice * 1.15
  const longTermTP2 = currentPrice * 1.30
  const longTermTP3 = currentPrice * 1.50
  
  return {
    curto_prazo: {
      acao: shortTermAction,
      entradas: `${shortTermEntry.toFixed(2)} - ${currentPrice.toFixed(2)}`,
      stop_loss: shortTermStopLoss.toFixed(2),
      take_profit: [shortTermTP1.toFixed(2), shortTermTP2.toFixed(2)],
      justificacao: `RSI: ${rsi.toFixed(1)}. Sentiment: ${sentiment.shortTermSentiment.category}. ${sentiment.shortTermSentiment.rationale.substring(0, 100)}`,
      confidence: shortTermConfidence
    },
    longo_prazo: {
      acao: longTermAction,
      entradas: `${longTermEntry.toFixed(2)} - ${currentPrice.toFixed(2)}`,
      stop_loss: longTermStopLoss.toFixed(2),
      take_profit: [longTermTP1.toFixed(2), longTermTP2.toFixed(2), longTermTP3.toFixed(2)],
      justificacao: `Tendência macro ${currentPrice > indicators.sma200 ? 'bullish' : 'bearish'}. Sentiment longo prazo: ${sentiment.longTermSentiment.category}. ${sentiment.longTermSentiment.rationale.substring(0, 100)}`,
      confidence: longTermConfidence
    }
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  let success = true
  let errorMessage = null
  
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol") || "BTC"

    let [candles15m, candles1h, candles4h, candles1d] = await Promise.all([
      fetchCandlestickData(symbol, "15m", 200),
      fetchCandlestickData(symbol, "1h", 200),
      fetchCandlestickData(symbol, "4h", 200),
      fetchCandlestickData(symbol, "1d", 200),
    ])

    if (!candles1d || !Array.isArray(candles1d) || candles1d.length < 14) {
      console.warn("[DCA ANALYSIS] Binance indisponível ou poucos dados — fallback CoinGecko OHLC")
      const ohlc = await fetchCoinGeckoOhlcAsKlines(symbol, 200)
      if (ohlc && ohlc.length >= 14) {
        candles1d = ohlc
        if (!candles4h || !Array.isArray(candles4h) || candles4h.length < 14) candles4h = ohlc.slice(-120)
        if (!candles1h || !Array.isArray(candles1h) || candles1h.length < 14) candles1h = ohlc.slice(-168)
        if (!candles15m || !Array.isArray(candles15m) || candles15m.length < 14) candles15m = ohlc.slice(-96)
      }
    }

    if (!candles1d || !Array.isArray(candles1d) || candles1d.length < 14) {
      return NextResponse.json(
        { error: "Erro ao buscar dados de mercado (Binance e CoinGecko)" },
        { status: 500 }
      )
    }

    const articles = await fetchNewsData(symbol)
    const sentiment = await analyzeSentiment(articles, normalizeBinancePair(symbol))
    
    const safe = (c: number[][] | null | undefined) =>
      Array.isArray(c) && c.length >= 14 ? c : candles1d

    const indicators = {
      "15m": calculateIndicators(safe(candles15m)),
      "1h": calculateIndicators(safe(candles1h)),
      "4h": calculateIndicators(safe(candles4h)),
      "1d": calculateIndicators(candles1d),
    }
    
    // 4. Gerar recomendação DCA
    const recommendation = generateDCARecommendation(
      symbol,
      indicators['1d'],
      sentiment
    )
    
    // 5. Sugestão de zonas DCA
    const currentPrice = indicators['1d'].currentPrice
    const dcaZones = [
      {
        price_range: `${(currentPrice * 0.90).toFixed(2)} - ${(currentPrice * 0.95).toFixed(2)}`,
        allocation: '40%',
        reason: 'Zona de acumulação forte (5-10% abaixo do preço atual)'
      },
      {
        price_range: `${(currentPrice * 0.95).toFixed(2)} - ${currentPrice.toFixed(2)}`,
        allocation: '35%',
        reason: 'Zona de valor atual'
      },
      {
        price_range: `${currentPrice.toFixed(2)} - ${(currentPrice * 1.05).toFixed(2)}`,
        allocation: '25%',
        reason: 'Confirmação de breakout'
      }
    ]
    
    const responseTime = Date.now() - startTime

    // Track AI event for analytics
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/ai/track-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'dca_analysis',
          event_data: { symbol, articles_count: articles.length, response_time: responseTime },
          context: { symbol, timeframes: ['15m', '1h', '4h', '1d'] },
          ai_feature: 'dca_analysis',
          response_time: responseTime,
          success
        })
      })
    } catch (trackError) {
      console.warn('⚠️ [DCA ANALYSIS] Erro ao trackear evento:', trackError)
    }

    return NextResponse.json({
      success: true,
      data: {
        symbol: normalizeBinancePair(symbol),
        timestamp: new Date().toISOString(),
        currentPrice: currentPrice.toFixed(2),
        technical_indicators: {
          rsi_1d: indicators['1d'].rsi.toFixed(1),
          sma20: indicators['1d'].sma20.toFixed(2),
          sma50: indicators['1d'].sma50.toFixed(2),
          sma200: indicators['1d'].sma200.toFixed(2),
          volume_ratio: indicators['1d'].volumeRatio.toFixed(2)
        },
        sentiment,
        recommendations: recommendation,
        dca_zones: dcaZones,
        news_analyzed: articles.length
      }
    })
  } catch (error) {
    success = false
    errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('Erro na API de análise DCA:', error)
    
    // Track error event
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/ai/track-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'dca_analysis',
          event_data: { error: errorMessage },
          context: {},
          ai_feature: 'dca_analysis',
          response_time: Date.now() - startTime,
          success: false,
          error_message: errorMessage
        })
      })
    } catch (trackError) {
      console.warn('⚠️ [DCA ANALYSIS] Erro ao trackear evento de erro:', trackError)
    }
    
    return NextResponse.json({ 
      error: 'Erro ao processar análise DCA',
      details: errorMessage
    }, { status: 500 })
  }
}

