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
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { candidatosDeTicker } from '@/lib/mtmfunded/simulado/ordens'
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

  // 1.º O PREÇO DA CASA (`funded_precos`, o motor do VPS — sem MetaApi). Desde 02/10 (~21 h) as
  // contas provider da MetaApi deixaram de cotar e o signal-tracker ficou cego: nenhuma entrada
  // enchia e nenhum setup era descartado. É também o preço com que as contas simuladas abrem — o
  // tracker e a conta «Todos os sinais» passam a ver o MESMO mercado (07/10).
  const daCasa = await precoDaCasa(sym)
  if (daCasa != null) {
    cache.set(sym, { price: daCasa, at: Date.now() })
    return daCasa
  }

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

/** Idade máxima do retrato da casa para servir de cotação de referência. */
const IDADE_MAX_CASA_MS = 60_000

/** Meio do bid/ask fresco de `funded_precos` (pela hora do MERCADO quando existe). Puro. */
export function meioFresco(
  linha: { bid?: unknown; ask?: unknown; em?: unknown; em_mercado?: unknown } | null | undefined,
  agoraMs: number,
  maxIdadeMs = IDADE_MAX_CASA_MS,
): number | null {
  if (!linha) return null
  const bid = Number(linha.bid)
  const ask = Number(linha.ask)
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null
  const quando = Date.parse(String(linha.em_mercado ?? linha.em ?? ''))
  if (!Number.isFinite(quando) || agoraMs - quando > maxIdadeMs) return null
  return (bid + ask) / 2
}

async function precoDaCasa(sym: string): Promise<number | null> {
  try {
    const candidatos = candidatosDeTicker(sym)
    const { data } = await getSupabaseAdmin().from('funded_precos').select('symbol, bid, ask, em, em_mercado').in('symbol', candidatos)
    const agora = Date.now()
    for (const c of candidatos) {
      const p = meioFresco((data ?? []).find((r) => r.symbol === c) as Record<string, unknown> | undefined, agora)
      if (p != null) return p
    }
  } catch { /* sem base: tenta a MetaApi */ }
  return null
}
