/**
 * Cotação ao vivo para o Terminal MTM — usa apenas as fontes já existentes
 * no projeto (Binance/CoinGecko para crypto, Yahoo Finance para o resto).
 * Sem variáveis de ambiente novas.
 */

import { fetchBinanceSpotUsd, fetchCoinGeckoSpotUsd } from "@/lib/crypto-usd"
import { fetchYahooQuote } from "@/lib/yahoo-market"
import type { TerminalAsset } from "@/lib/mtm-terminal-assets"

export interface TerminalQuote {
  price: number | null
  changePercent: number | null
  currency: string
  source: string
}

export async function fetchTerminalQuote(asset: TerminalAsset): Promise<TerminalQuote> {
  try {
    if (asset.priceSource === "binance" || asset.priceSource === "coingecko") {
      // Preço spot Binance + variação 24h via CoinGecko (mesma abordagem do DCA)
      const [spot, cg] = await Promise.all([
        fetchBinanceSpotUsd(asset.priceSymbol),
        fetchCoinGeckoSpotUsd(asset.priceSymbol),
      ])
      const price = spot ?? cg.price ?? null
      return {
        price,
        changePercent: cg.change24h ?? null,
        currency: "USD",
        source: spot ? "Binance" : "CoinGecko",
      }
    }

    // Yahoo — forex, commodities, índices, ações
    const q = await fetchYahooQuote(asset.priceSymbol)
    return {
      price: q.price,
      changePercent: q.changePercent,
      currency: q.currency ?? "USD",
      source: "Yahoo Finance",
    }
  } catch {
    return { price: null, changePercent: null, currency: "USD", source: "n/d" }
  }
}

/** Bloco de contexto de preço ao vivo para injetar no prompt da IA. */
export function buildLivePriceContext(asset: TerminalAsset, quote: TerminalQuote): string {
  if (quote.price == null) {
    return `\n\n[DADOS AO VIVO] Não foi possível obter o preço atual de ${asset.symbol} em tempo real — sinaliza isso e usa raciocínio macro estrutural para os níveis.`
  }
  const chg =
    quote.changePercent != null ? `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%` : "n/d"
  return `\n\n[DADOS AO VIVO — confirmados agora via ${quote.source}]
- Ativo: ${asset.name} (${asset.symbol})
- Preço atual: ${quote.price} ${quote.currency}
- Variação 24h: ${chg}
Usa este preço como âncora real para calcular níveis de suporte/resistência, zonas de entrada, stop e take-profit em valores concretos e plausíveis à volta deste preço.`
}
