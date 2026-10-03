/**
 * Preço de referência de um símbolo, sem depender da conta de ninguém.
 *
 * Serve UM propósito: quando um sinal fecha por ordem da FONTE (cancel/close no Telegram), o
 * anúncio tem de dizer quanto rendeu. A entrada sabemos — vem da mensagem. O preço de saída não
 * existe em lado nenhum: não houve TP nem SL nosso, foi o trader que mandou fechar. Sem ele o
 * cartão fica "Posição fechada · XAUUSD 🔴 VENDA" e o cliente não sabe se ganhou ou perdeu.
 *
 * Lemos a cotação numa conta PROVIDER nossa (a mesma que executa os sinais) e guardamos 30s em
 * memória — um fecho toca em vários seguidores e não vale a pena abrir uma ligação RPC por cada.
 */
import { precoParaMonitor } from './metaapi-snapshot'
import {
  CANONICAL_PREMIUM_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
  CANONICAL_SENSEI_ACCOUNT_ID,
  SENSEI_PROVIDER_ACCOUNT_ID,
} from './provider-constants'

/**
 * Contas por onde tentamos cotar, pela ordem. A primeira que responder ganha.
 *
 * As duas canónicas antigas (Trade Ideas `fbeeafeb`, Sensei `a5a1dddd`) já não existem na
 * MetaApi — ficavam aqui a gastar uma tentativa e um timeout cada. A conta própria do Sensei
 * entra à frente delas.
 */
const FONTES = [
  CANONICAL_PREMIUM_ACCOUNT_ID,
  SENSEI_PROVIDER_ACCOUNT_ID,
  CANONICAL_TRADE_IDEAS_ACCOUNT_ID,
  CANONICAL_SENSEI_ACCOUNT_ID,
]

const TTL_MS = 30_000
const cache = new Map<string, { price: number; at: number }>()

/** Cotação atual do símbolo, ou null se nenhuma conta respondeu (nunca inventa um preço). */
export async function referencePrice(symbol: string | null | undefined): Promise<number | null> {
  const sym = (symbol ?? '').toUpperCase().trim()
  if (!sym) return null

  const hit = cache.get(sym)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.price

  for (const acc of FONTES) {
    try {
      if (!acc) continue
      // Fotografia do streaming (<5 s) ou REST current-price — nunca RPC com getSymbols.
      const p = await precoParaMonitor(acc, sym)
      if (p != null && p > 0) {
        cache.set(sym, { price: p, at: Date.now() })
        return p
      }
    } catch { /* conta em baixo — tenta a seguinte */ }
  }
  return null
}
