import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { CANONICAL_TRADE_IDEAS_ACCOUNT_ID } from './provider-constants'

/**
 * Execução dos sinais "Forex Swings" (canal James → relay fs-relay) na conta mestre MTM Auto Forex
 * (fbeeafeb / 5IHE). CopyFactory replica automaticamente para os subscritores.
 *
 * Config (site_settings.forex_swings_execution): { mode, lot }
 *  mode:
 *   'off'    → não executa nada (default — nada abre até ligares)
 *   'shadow' → só regista o que ABRIRIA (validação sem risco)
 *   'live'   → abre ordem de mercado real na conta mestre (comentário "Forex Swings", SEM trailing)
 *  lot: volume fixo por ordem (default 0.01) — set & forget, previsível.
 * Afinável sem redeploy.
 */
export interface ForexSwingsExecConfig {
  mode: 'off' | 'shadow' | 'live'
  /** Lote de fallback quando não dá para calcular por risco (sem equity/SL/preço). */
  lot: number
  /** % de risco ao SL por posição (default 0.5). 0 = usa lote fixo `lot`. */
  riskPct: number
  /** Conta MetaApi onde a ordem-mestre abre (CopyFactory replica p/ subscritores). Configurável. */
  accountId: string
}

const KEY = 'forex_swings_execution'
const DEFAULT_ACCOUNT = CANONICAL_TRADE_IDEAS_ACCOUNT_ID

export async function getForexSwingsExecConfig(): Promise<ForexSwingsExecConfig> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_settings').select('value').eq('key', KEY).maybeSingle()
    const v = (data?.value ?? {}) as Partial<ForexSwingsExecConfig>
    const mode: ForexSwingsExecConfig['mode'] =
      v.mode === 'shadow' || v.mode === 'live' ? v.mode : 'off'
    const lot = typeof v.lot === 'number' && v.lot > 0 ? v.lot : 0.01
    const riskPct = typeof v.riskPct === 'number' && v.riskPct >= 0 ? v.riskPct : 0.5
    const accountId = typeof v.accountId === 'string' && v.accountId.trim() ? v.accountId.trim() : DEFAULT_ACCOUNT
    return { mode, lot, riskPct, accountId }
  } catch {
    return { mode: 'off', lot: 0.01, riskPct: 0.5, accountId: DEFAULT_ACCOUNT }
  }
}
