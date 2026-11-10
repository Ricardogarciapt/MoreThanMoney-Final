import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { SERVICO_VIGIAS, tarefaViva, type EstadoVigias, type TarefaVigia } from './tarefas'

/**
 * Lado Vercel: true quando o VPS (mtm-vigias) está a correr esta tarefa — o cron devolve logo.
 * Qualquer falha a ler o pulso → false (a Vercel faz o trabalho, como antes). VIGIAS_VERCEL_FORCAR=1
 * ignora o VPS por completo.
 */
// O pulso só muda de 30 em 30 s; sem cache, cada cron lia-o (~1,4 leituras/s medidas a 10/11).
// Uma leitura por instância a cada 20 s serve todas as tarefas.
const CACHE_MS = 20_000
let cache: { lidoEm: number; estado: EstadoVigias | null; em: string | null } | null = null

export async function vigiaNaVps(nome: TarefaVigia): Promise<boolean> {
  if (process.env.VIGIAS_VERCEL_FORCAR === '1') return false
  try {
    if (!cache || Date.now() - cache.lidoEm > CACHE_MS) {
      const { data, error } = await getSupabaseAdmin()
        .from('servicos_pulso')
        .select('em, estado')
        .eq('servico', SERVICO_VIGIAS)
        .maybeSingle()
      if (error) return false
      cache = { lidoEm: Date.now(), estado: (data?.estado as EstadoVigias | null) ?? null, em: (data?.em as string | null) ?? null }
    }
    return tarefaViva(cache.estado, cache.em, nome)
  } catch {
    return false
  }
}
