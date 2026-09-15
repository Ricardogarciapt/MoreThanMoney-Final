import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { CANONICAL_SENSEI_ACCOUNT_ID } from './provider-constants'

/**
 * Execução dos sinais PrimeVerse (canal "PѴ TRADE INSIGHTS") do TOP trader → sistema Sensei.
 * Fonte: relay pv-relay filtra o trader `trader` em XAUUSD + BTCUSD e faz POST do sinal parseado.
 *  - XAUUSD → conta MTM Auto Sensei (mADd) via MetaApi.
 *  - BTCUSD → conta MTM Auto Sensei (mADd) + perps Bybit (POST /api/bybit/place, gated pelo
 *    seu próprio BYBIT_PERPS_EXEC_ENABLED).
 *
 * Config (site_settings.primeverse_execution): { mode, trader, senseiLot, tpLevel, bybit }
 *  mode: 'off' (default) | 'shadow' (só regista) | 'live' (executa)
 *  trader: assinatura a seguir (default 'kingfkg')
 *  senseiLot: lote fixo na conta Sensei (default 0.01)
 *  tpLevel: qual TP usar como alvo da ordem MT5 (1..5, default 1)
 *  bybit: encaminhar BTCUSD para os perps Bybit (default true)
 */
export interface PrimeverseExecConfig {
  mode: 'off' | 'shadow' | 'live'
  /** Assinatura(s) a seguir — string bruta (pode ser CSV: "kingfkg,fxedge"). */
  trader: string
  /** Lista normalizada de traders a executar (derivada de `trader`). */
  traders: string[]
  /** Lote fixo na conta de execução quando não dá para calcular por risco. */
  senseiLot: number
  /** % de risco ao SL por posição (default 0.5). 0 = usa lote fixo `senseiLot`. */
  riskPct: number
  tpLevel: number
  bybit: boolean
  /** Conta MetaApi onde a ordem abre (default Sensei). Configurável → ex.: Vantage. */
  accountId: string
}

const KEY = 'primeverse_execution'
// A conta Sensei antiga (a5a1dddd) foi apagada na MetaApi → sem conta por defeito ('' = não executa).
const DEFAULT_ACCOUNT = CANONICAL_SENSEI_ACCOUNT_ID ?? ''

export async function getPrimeverseExecConfig(): Promise<PrimeverseExecConfig> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_settings').select('value').eq('key', KEY).maybeSingle()
    const v = (data?.value ?? {}) as Partial<PrimeverseExecConfig>
    const mode: PrimeverseExecConfig['mode'] =
      v.mode === 'shadow' || v.mode === 'live' ? v.mode : 'off'
    const trader = (typeof v.trader === 'string' && v.trader.trim()) ? v.trader.trim().toLowerCase() : 'kingfkg'
    const traders = Array.isArray(v.traders) && v.traders.length
      ? v.traders.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
      : trader.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    const senseiLot = typeof v.senseiLot === 'number' && v.senseiLot > 0 ? v.senseiLot : 0.01
    const riskPct = typeof v.riskPct === 'number' && v.riskPct >= 0 ? v.riskPct : 0.5
    const tpLevel = typeof v.tpLevel === 'number' && v.tpLevel >= 1 && v.tpLevel <= 5 ? Math.round(v.tpLevel) : 1
    const bybit = v.bybit !== false
    const accountId = typeof v.accountId === 'string' && v.accountId.trim() ? v.accountId.trim() : DEFAULT_ACCOUNT
    return { mode, trader, traders, senseiLot, riskPct, tpLevel, bybit, accountId }
  } catch {
    return { mode: 'off', trader: 'kingfkg', traders: ['kingfkg'], senseiLot: 0.01, riskPct: 0.5, tpLevel: 1, bybit: true, accountId: DEFAULT_ACCOUNT }
  }
}
