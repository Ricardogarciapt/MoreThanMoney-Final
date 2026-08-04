import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Execução dos sinais "Forex Swings" (canal James → relay fs-relay) na conta mestre MTM Auto Forex
 * (fbeeafeb / 5IHE). CopyFactory replica automaticamente para os subscritores.
 *
 * Config (site_settings.forex_swings_execution): { mode, lot }
 *  mode:
 *   'off'    → não executa nada (default — nada abre até ligares)
 *   'shadow' → só regista o que ABRIRIA (validação sem risco)
 *   'live'   → abre ordem de mercado real na conta mestre (comentário "Forex Swings" + trailing)
 *  lot: volume fixo por ordem (default 0.01) — set & forget, previsível.
 * Afinável sem redeploy.
 */
export interface ForexSwingsExecConfig {
  mode: 'off' | 'shadow' | 'live'
  lot: number
}

const KEY = 'forex_swings_execution'

export async function getForexSwingsExecConfig(): Promise<ForexSwingsExecConfig> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_settings').select('value').eq('key', KEY).maybeSingle()
    const v = (data?.value ?? {}) as Partial<ForexSwingsExecConfig>
    const mode: ForexSwingsExecConfig['mode'] =
      v.mode === 'shadow' || v.mode === 'live' ? v.mode : 'off'
    const lot = typeof v.lot === 'number' && v.lot > 0 ? v.lot : 0.01
    return { mode, lot }
  } catch {
    return { mode: 'off', lot: 0.01 }
  }
}
