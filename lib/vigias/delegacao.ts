import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { SERVICO_VIGIAS, tarefaViva, type EstadoVigias, type TarefaVigia } from './tarefas'

/**
 * Lado Vercel: true quando o VPS (mtm-vigias) está a correr esta tarefa — o cron devolve logo.
 * Qualquer falha a ler o pulso → false (a Vercel faz o trabalho, como antes). VIGIAS_VERCEL_FORCAR=1
 * ignora o VPS por completo.
 */
export async function vigiaNaVps(nome: TarefaVigia): Promise<boolean> {
  if (process.env.VIGIAS_VERCEL_FORCAR === '1') return false
  try {
    const { data } = await getSupabaseAdmin()
      .from('servicos_pulso')
      .select('em, estado')
      .eq('servico', SERVICO_VIGIAS)
      .maybeSingle()
    return tarefaViva(data?.estado as EstadoVigias | null, data?.em as string | null, nome)
  } catch {
    return false
  }
}
