import { getAccountSymbols } from './metaapi'
import { resolveBrokerSymbol } from './symbol-resolver'
import type { CopyFactorySymbolMapping } from './copyfactory'

/**
 * Símbolos de origem que as estratégias MTM podem negociar.
 * Para cada um, resolvemos o símbolo REAL no broker do subscritor (sufixos/prefixos)
 * e criamos um mapping CopyFactory quando difere — evita "símbolo não existe → cópia ignorada".
 */
const SOURCE_SYMBOLS = [
  'XAUUSD', 'XAGUSD',
  // Majors
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD',
  // Crosses (MTMScanner/Forex negoceia crosses — sem mapping, brokers com sufixo ignoravam-nos)
  'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'CADJPY', 'CHFJPY', 'NZDJPY',
  'EURAUD', 'EURCAD', 'EURCHF', 'EURNZD', 'GBPAUD', 'GBPCAD', 'GBPCHF', 'GBPNZD',
  'AUDCAD', 'AUDCHF', 'AUDNZD', 'NZDCAD', 'NZDCHF', 'CADCHF',
  // Cripto
  'BTCUSD', 'ETHUSD',
  // Índices + energia
  'US30', 'NAS100', 'US500', 'GER40', 'UK100', 'JPN225',
  'USOIL', 'UKOIL', 'NATGAS',
]

type CacheEntry = { at: number; mapping: CopyFactorySymbolMapping[] }
const cache = new Map<string, CacheEntry>()
const CACHE_MS = 10 * 60 * 1000 // 10 min

/**
 * Constrói o symbolMapping CopyFactory para a conta do subscritor, automaticamente,
 * consultando os símbolos reais do broker via MetaApi.
 * Em caso de falha devolve [] (copiar com o mesmo nome) — nunca um mapping fixo errado.
 */
export async function buildSubscriberSymbolMapping(
  accountId: string | null | undefined,
): Promise<CopyFactorySymbolMapping[]> {
  if (!accountId) return []

  const cached = cache.get(accountId)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.mapping

  const symbols = await getAccountSymbols(accountId)
  if (!symbols.length) return [] // sem dados → não arriscar mapping errado

  const mapping: CopyFactorySymbolMapping[] = []
  for (const src of SOURCE_SYMBOLS) {
    const broker = resolveBrokerSymbol(src, symbols)
    if (broker && broker.toUpperCase() !== src.toUpperCase()) {
      mapping.push({ from: src, to: broker })
    }
  }

  cache.set(accountId, { at: Date.now(), mapping })
  return mapping
}
