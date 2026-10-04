/**
 * O LIVRO — uma linha em `ia_chamadas` por chamada (migração 175).
 *
 * É o que permite ao dono ver «quanto estou a gastar» e «quem está a falhar» em vez de o
 * descobrir pelo 400 na página. Regra absoluta: o livro NUNCA impede a resposta — sem credenciais
 * (dev local), com a base em baixo ou lento, falha em silêncio controlado (um aviso na consola) e
 * a IA responde na mesma.
 */
import type { TentativaIA } from './tipos'

export type LinhaLivro = {
  tarefa: string
  fornecedor: string | null
  modelo: string | null
  em_reserva: boolean
  tentativas: TentativaIA[]
  saltados: string[]
  tokens_entrada: number | null
  tokens_saida: number | null
  custo_cents: number
  duracao_ms: number
  sucesso: boolean
  erro: string | null
}

export type Livro = (linha: LinhaLivro) => Promise<void>

/** O livro real: escreve na base com a service role, com tecto de 3 s. */
export const livroSupabase: Livro = async (linha) => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
    const { error } = await getSupabaseAdmin()
      .from('ia_chamadas')
      .insert(linha)
      .abortSignal(AbortSignal.timeout(3_000))
    if (error) console.warn('[ia/livro] não gravou:', error.message)
  } catch (e) {
    console.warn('[ia/livro] não gravou:', e instanceof Error ? e.message : String(e))
  }
}
