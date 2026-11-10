/**
 * Rede de segurança do carrossel diário (10/11/2026).
 *
 * A 10/11 o cron das 07:00 não correu e o dia ficou sem carrosséis. O ig-publish corre de 5 em
 * 5 minutos, por isso é ele que chama isto: a partir das 07:15 UTC, se um perfil ainda não
 * tem o carrossel de hoje na fila, agenda-o agora (o agendarDia respeita o interruptor e não
 * duplica). Um dia normal custa uma consulta por ronda.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { agendarDia, type Resultado } from './motor'
import { CRIADO_POR, type Perfil } from './tipos'

const PERFIS: Perfil[] = ['mtm', 'ricardo']

export async function garantirCarrosselDoDia(agora = new Date()): Promise<Resultado[]> {
  if (agora.getUTCHours() * 60 + agora.getUTCMinutes() < 7 * 60 + 15) return []
  const inicioDia = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())).toISOString()
  const { data, error } = await getSupabaseAdmin()
    .from('social_scheduled_posts')
    .select('created_by')
    .like('created_by', 'carrossel-diario:%')
    .gte('created_at', inicioDia)
  if (error) return []
  const feitos = new Set((data ?? []).map((r) => String(r.created_by)))
  const resultados: Resultado[] = []
  for (const perfil of PERFIS) {
    if (feitos.has(CRIADO_POR[perfil])) continue
    try {
      resultados.push(await agendarDia(perfil, { agora }))
    } catch (e) {
      resultados.push({ perfil, estado: 'falhou', motivo: e instanceof Error ? e.message : String(e) })
    }
  }
  return resultados
}
