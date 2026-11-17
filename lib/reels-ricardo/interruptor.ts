/**
 * Interruptor dos reels de marca pessoal (@ricardogarciapt, motor services/reels-ricardo):
 * `site_settings.reels_ricardo` = {"ligado": true, "teste": true, "por_dia": 1}.
 *
 * Ao contrário do carrossel diário, SEM linha conta como DESLIGADO: é a conta pessoal de uma
 * pessoa real e só sai o que o Ricardo ligou (pedido de 17/11/2026, «publicar já em modo teste»).
 * `teste` (por omissão true): sai como «reel de teste» do Instagram, mostrado primeiro só a não
 * seguidores; o Instagram decide se o partilha com os seguidores pelo desempenho.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const CHAVE_REELS_RICARDO = 'reels_ricardo'

export type EstadoReelsRicardo = { ligado: boolean; teste: boolean; porDia: number }

export function lerEstadoReels(value: unknown): EstadoReelsRicardo {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const porDia = Number(v.por_dia)
  return {
    ligado: v.ligado === true,
    teste: v.teste !== false,
    porDia: Number.isFinite(porDia) && porDia > 0 ? Math.min(3, Math.floor(porDia)) : 1,
  }
}

export async function lerInterruptorReels(): Promise<EstadoReelsRicardo> {
  const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', CHAVE_REELS_RICARDO).maybeSingle()
  return lerEstadoReels(data?.value)
}
