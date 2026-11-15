/**
 * O interruptor do carrossel diário: `site_settings.carrossel_diario` = {"ricardo":true,"mtm":true}.
 * Sem linha (ou sem a chave do perfil) conta como LIGADO — é a ordem do Ricardo de 06/11/2026.
 * Ficheiro à parte para o ig-publish o ler sem carregar o desenho e a IA.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { Perfil } from './tipos'

export const CHAVE_INTERRUPTOR = 'carrossel_diario'

export async function lerInterruptor(): Promise<Record<Perfil, boolean>> {
  const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', CHAVE_INTERRUPTOR).maybeSingle()
  const v = (data?.value && typeof data.value === 'object' ? data.value : {}) as Record<string, unknown>
  return { ricardo: v.ricardo !== false, mtm: v.mtm !== false }
}
