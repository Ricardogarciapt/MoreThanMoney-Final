import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

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
  trader: string
  senseiLot: number
  tpLevel: number
  bybit: boolean
}

const KEY = 'primeverse_execution'

export async function getPrimeverseExecConfig(): Promise<PrimeverseExecConfig> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_settings').select('value').eq('key', KEY).maybeSingle()
    const v = (data?.value ?? {}) as Partial<PrimeverseExecConfig>
    const mode: PrimeverseExecConfig['mode'] =
      v.mode === 'shadow' || v.mode === 'live' ? v.mode : 'off'
    const trader = (typeof v.trader === 'string' && v.trader.trim()) ? v.trader.trim().toLowerCase() : 'kingfkg'
    const senseiLot = typeof v.senseiLot === 'number' && v.senseiLot > 0 ? v.senseiLot : 0.01
    const tpLevel = typeof v.tpLevel === 'number' && v.tpLevel >= 1 && v.tpLevel <= 5 ? Math.round(v.tpLevel) : 1
    const bybit = v.bybit !== false
    return { mode, trader, senseiLot, tpLevel, bybit }
  } catch {
    return { mode: 'off', trader: 'kingfkg', senseiLot: 0.01, tpLevel: 1, bybit: true }
  }
}
