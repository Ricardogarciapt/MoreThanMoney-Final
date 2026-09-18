/**
 * Ids CopyFactory das estratégias que o motor das mestres serve (corte feito e relido). A
 * re-sincronização do site (lib/mtmcopy/connection-sync.syncMtmStrategyReplication) tira-os das
 * subscrições — assim nenhum GET, cron ou PATCH volta a subscrever na CopyFactory uma estratégia
 * cortada (o bug de 29/07 foi precisamente uma re-subscrição automática).
 *
 * Cache de 60 s. Sem a migração 116 (tabela em falta) → conjunto vazio (nada está em live).
 * Qualquer OUTRO erro de leitura LANÇA: subscrever às cegas uma estratégia que talvez esteja cortada
 * dava ordens em dobro; é preferível falhar a sincronização e tentar no próximo ciclo.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { idsServidosPeloMotor } from '../copyfactory-corte'

let cache: { ids: Set<string>; em: number } | null = null

export async function idsCopyFactoryServidosPeloMotor(): Promise<Set<string>> {
  if (cache && Date.now() - cache.em < 60_000) return cache.ids
  const { data, error } = await getSupabaseAdmin().from('mestres_estrategias').select('copyfactory_ids, copyfactory_cortado_em')
  if (error?.code === '42P01') { cache = { ids: new Set(), em: Date.now() }; return cache.ids }
  if (error) throw new Error(`mestres_estrategias ilegível: ${error.message}`)
  cache = { ids: idsServidosPeloMotor(data ?? []), em: Date.now() }
  return cache.ids
}
