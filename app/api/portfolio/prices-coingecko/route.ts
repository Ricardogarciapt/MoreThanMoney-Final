import { NextRequest, NextResponse } from "next/server"
import { coingeckoFetchConfig, resolveCoinGeckoId } from "@/lib/coingecko-portfolio"

// Cache de preços (5 minutos)
const priceCache = new Map<string, { price: number; timestamp: number }>()
const CACHE_DURATION = 300000 // 5 minutos

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbols = searchParams.get("symbols")?.split(",").filter(Boolean) || []

    if (symbols.length === 0) {
      return NextResponse.json({ error: "Símbolos são obrigatórios" }, { status: 400 })
    }

    console.log(`💰 [COINGECKO] Buscando preços para ${symbols.length} ativos...`)

    const prices: Record<string, number | null> = {}
    const changes24h: Record<string, number | null> = {}

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

    if (uncachedSymbols.length > 0) {
      const coingeckoIds = [...new Set(uncachedSymbols.map(resolveCoinGeckoId).filter(Boolean) as string[])]

      if (coingeckoIds.length > 0) {
        try {
          const { baseUrl, headers } = coingeckoFetchConfig()
          const response = await fetch(
            `${baseUrl}/simple/price?ids=${coingeckoIds.join(",")}&vs_currencies=usd&include_24hr_change=true`,
            {
              next: { revalidate: 300 },
              headers,
            }
          )

          if (response.ok) {
            const data = (await response.json()) as Record<
              string,
              { usd?: number; usd_24h_change?: number }
            >

            for (const symbol of uncachedSymbols) {
              const coingeckoId = resolveCoinGeckoId(symbol)
              if (coingeckoId && data[coingeckoId]) {
                const price = data[coingeckoId].usd
                const change = data[coingeckoId].usd_24h_change
                prices[symbol] = price ?? null
                changes24h[symbol] = typeof change === "number" ? change : null
                if (typeof price === "number") {
                  priceCache.set(symbol, { price, timestamp: Date.now() })
                }
                console.log(`✅ [COINGECKO] ${symbol} = $${price}`)
              } else {
                prices[symbol] = null
                changes24h[symbol] = null
                console.log(`⚠️ [COINGECKO] ${symbol} não encontrado`)
              }
            }
          } else {
            console.error(`❌ [COINGECKO] Erro HTTP ${response.status}`)
            uncachedSymbols.forEach((s) => {
              prices[s] = null
              changes24h[s] = null
            })
          }
        } catch (error) {
          console.error("❌ [COINGECKO] Erro na API:", error)
          uncachedSymbols.forEach((s) => {
            prices[s] = null
            changes24h[s] = null
          })
        }
      } else {
        console.warn("⚠️ [COINGECKO] Nenhum símbolo válido para buscar")
        uncachedSymbols.forEach((s) => {
          prices[s] = null
          changes24h[s] = null
        })
      }
    }

    console.log(`✅ [COINGECKO] Retornando ${Object.keys(prices).length} preços`)

    return NextResponse.json({
      success: true,
      prices,
      changes_24h: changes24h,
      source: "CoinGecko",
      cached: symbols.length - uncachedSymbols.length,
      fetched: uncachedSymbols.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("❌ [COINGECKO] Erro:", error)
    return NextResponse.json(
      { error: "Erro ao buscar preços", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  priceCache.clear()
  console.log("🗑️ [COINGECKO] Cache limpo")
  return NextResponse.json({ success: true, message: "Cache limpo" })
}
