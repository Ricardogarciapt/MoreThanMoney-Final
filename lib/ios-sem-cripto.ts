/**
 * Sem cripto na app iOS (MTM System) — o espelho web do `enum MTMCripto` da app nativa.
 *
 * Porquê: a Apple rejeitou a 3.7.2 (build 67) e a 3.7.6 (build 75) ao abrigo da Guideline
 * 3.1.5(iii) («cryptocurrency exchange services»). Na 75 o revisor, num iPad, viu cripto nas
 * páginas web que a app carrega (Scanner com o mapa de bolhas cripto por defeito, MTM Alerts,
 * WebTrader com BTCUSD nos favoritos e no gráfico PRO). A decisão (09/09) é tirar o cripto do
 * iOS; o site e o Android ficam iguais. Tudo o que é deste assunto na web passa por aqui, para
 * se poder voltar atrás num sítio só.
 *
 * Deteção pelo user-agent da webview nativa (`MTMNativeApp` + iPhone/iPad; o iPad em modo
 * secretária anuncia-se como «Macintosh»). O Android usa `MTMSystemAndroid` e não entra.
 */

import { useEffect, useState } from "react"

/** Única fonte de verdade na web. `false` = a app iOS não mostra cripto. */
export const CRIPTO_NO_IOS = false

export function ehAppIos(ua?: string | null): boolean {
  const u = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")
  if (!u) return false
  return /MTMNativeApp/i.test(u) && /iPhone|iPad|iPod|Macintosh/i.test(u) && !/Android/i.test(u)
}

/** Esconder cripto neste ecrã? (só no cliente; no servidor devolve false). */
export function semCripto(ua?: string | null): boolean {
  return !CRIPTO_NO_IOS && ehAppIos(ua)
}

/**
 * Hook: `true` na app iOS. Começa `false` e acerta depois de montar (o HTML do servidor é o
 * mesmo para todos) — por isso quem o usa para escolher um valor INICIAL deve reagir à mudança.
 */
export function useSemCripto(): boolean {
  const [v, setV] = useState(false)
  useEffect(() => { setV(semCripto()) }, [])
  return v
}

const BASES = new Set([
  "BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "DOT", "MATIC", "LTC",
  "HYPE", "SUI", "APT", "ARB", "OP", "TON", "TRX", "NEAR", "INJ", "SEI", "TIA", "ATOM",
  "FIL", "ETC", "BCH", "UNI", "AAVE", "PEPE", "WIF", "BONK", "SHIB", "FTM", "RNDR", "TAO",
  "XLM", "XMR", "KAS", "JUP", "IMX", "HBAR", "VET", "ICP", "POL",
])
const BOLSAS_CRIPTO = /^(BINANCE|BYBIT|COINBASE|KRAKEN|BITSTAMP|BITFINEX|OKX|KUCOIN|BITGET|MEXC|GATEIO|CRYPTO|CRYPTOCAP|HTX|HUOBI|POLONIEX|GEMINI|DERIBIT|PHEMEX|BINGX):/i

/**
 * Este símbolo é cripto? Deliberadamente largo (BTCUSD, BTCUSDT, BTCUSDT.P, BINANCE:ETHUSDT…):
 * numa gate de conformidade é melhor bloquear a mais do que deixar passar.
 */
export function ehSimboloCripto(simbolo?: string | null): boolean {
  if (!simbolo) return false
  const bruto = String(simbolo).trim().toUpperCase()
  if (!bruto) return false
  if (BOLSAS_CRIPTO.test(bruto)) return true
  const s = bruto.replace(/^[A-Z0-9_]+:/, "").replace(/\s+/g, "")
  // USDTRY, USDCAD, USDCHF e USDCNH são forex, não stablecoins.
  if (/\.P$/.test(s) || /USDT(?!RY)|USDC(?!AD|HF|NH)|PERP/.test(s)) return true
  if (/^(XAU|XAG|XPT|XPD)/.test(s)) return false
  const letras = s.replace(/[^A-Z]/g, "")
  const base = letras.replace(/(USD|EUR|USDT|USDC|BTC|ETH)$/, "")
  if (BASES.has(base) || BASES.has(letras)) return true
  for (const b of ["BTC", "ETH"]) if (letras.startsWith(b)) return true
  return false
}

/** Este símbolo pode aparecer? (fora da app iOS: sempre) */
export function simboloPermitido(simbolo?: string | null, ua?: string | null): boolean {
  return !semCripto(ua) || !ehSimboloCripto(simbolo)
}

const PALAVRAS = /\b(cript|crypt)|bitcoin|ethereum|altcoin|airdrop|perp[ée]tu|\bperps?\b|binance|bybit|coinbase|kucoin|\btokens?\b|stablecoin|usdt(?!ry)|usdc(?!ad|hf|nh)|₿/i
const TICKERS = /\b(BTC|ETH|SOL|XRP|BNB|DOGE|AVAX|MATIC|LTC|SHIB|PEPE|SUI|TRX|DOT|LINK|ADA)(USDT?|USDC|EUR)?\b|\b[A-Z]{2,10}\.P\b/

/** Este texto fala de cripto? (o mesmo critério do `MTMCripto.mencionaCripto` nativo) */
export function mencionaCripto(texto?: string | null): boolean {
  if (!texto) return false
  return PALAVRAS.test(texto) || TICKERS.test(texto)
}

/** Símbolo por defeito quando o pedido era cripto. */
export const SIMBOLO_SEM_CRIPTO = "XAUUSD"

/** Canais de chat que são só cripto: fora da app iOS (Guideline 3.1.5, rejeição 21/09). */
export const CANAIS_SO_CRIPTO = new Set(["cripto", "cripto-perps"])

/**
 * Esta mensagem de chat / sinal T2T é cripto? Os perpétuos (Aurum Flow & Perpétuos) têm o botão
 * «TAP to Copy» para copy trading numa bolsa — foi isso que a Apple leu como «serviço de câmbio de
 * criptomoedas» na 3.7.6 (79). Na app iOS não aparecem nem o sinal nem o botão.
 */
export function mensagemCripto(canal?: string | null, texto?: string | null): boolean {
  return CANAIS_SO_CRIPTO.has(String(canal ?? "")) || mencionaCripto(texto)
}
