import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  throw new Error('[mtmcopy-engine] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em falta no .env')
}

// service_role → bypassa RLS; este serviço corre fora do site, isolado, e é o
// único componente autorizado a escrever nestas tabelas em nome dos utilizadores.
export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export interface CopygramConnection {
  id: string
  user_id: string
  telegram_channel: string | null
  telegram_status: 'pending' | 'connected' | 'error' | 'disconnected'
  mt5_login_last4: string | null
  mt5_server: string | null
  mt5_status: 'pending' | 'connected' | 'error' | 'disconnected'
  lot_mode: 'fixed' | 'risk_percent' | 'multiplier'
  lot_value: number
  max_risk_percent: number | null
  symbols_whitelist: string[] | null
  copy_sl: boolean
  copy_tp: boolean
  reverse_signals: boolean
  is_active: boolean
  last_signal_at: string | null
  last_error: string | null
  // Campos geridos exclusivamente pelo motor (não expostos no formulário web):
  // metaapi_account_id — preenchido manualmente pela equipa após ligar a conta MT5
  // ao MetaApi (ver README → "Onboarding manual de cada utilizador")
  metaapi_account_id?: string | null
}

export async function getActiveConnections(): Promise<CopygramConnection[]> {
  const { data, error } = await supabase
    .from('mtmcopy_connections')
    .select('*')
    .eq('is_active', true)

  if (error) {
    console.error('[supabase] erro ao obter ligações activas:', error.message)
    return []
  }
  return (data ?? []) as CopygramConnection[]
}

export async function markStatus(
  connectionId: string,
  patch: Partial<Pick<CopygramConnection, 'telegram_status' | 'mt5_status' | 'last_error' | 'last_signal_at'>>
) {
  await supabase
    .from('mtmcopy_connections')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', connectionId)
}

export async function logSignal(entry: {
  user_id: string
  connection_id: string
  symbol?: string | null
  direction?: 'buy' | 'sell' | null
  entry?: number | null
  sl?: number | null
  tp?: number | null
  lot?: number | null
  status: 'received' | 'executed' | 'failed' | 'ignored'
  detail?: string | null
  raw_message?: string | null
}) {
  const { error } = await supabase.from('mtmcopy_signal_log').insert(entry)
  if (error) console.error('[supabase] erro ao registar sinal:', error.message)
}
