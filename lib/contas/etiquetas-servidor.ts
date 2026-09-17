import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { etiquetaDaLinha, type TabelaDeConta } from '@/lib/contas/etiqueta'

/**
 * AS ETIQUETAS DE UMA TABELA DE CONTAS, lidas À PARTE (113).
 *
 * Quem lê contas com `select('*')` recebe a coluna `etiqueta` de graça. Os painéis de administração
 * escolhem as colunas uma a uma — e aí uma coluna em falta é o PIOR modo de falhar que há nesta
 * base: o PostgREST devolve 42703, o `ler()` do Centro trata isso como «tabela em falta» e a lista
 * de contas aparece VAZIA, sem erro (lib/admin-centro/servidor/base.ts).
 *
 * Por isso a etiqueta vem numa consulta sua, `id` + `etiqueta`, pela chave primária e com limite.
 * Se a 113 ainda não estiver aplicada, esta consulta falha sozinha e devolve um mapa vazio: nenhuma
 * conta mostra etiqueta e TUDO O RESTO continua igual. Nunca lança.
 */
export async function lerEtiquetas(tabela: TabelaDeConta, limite = 3000): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  try {
    const { data, error } = await getSupabaseAdmin().from(tabela).select('id, etiqueta').not('etiqueta', 'is', null).limit(limite)
    if (error) return mapa
    for (const linha of data ?? []) {
      const e = etiquetaDaLinha(linha as { etiqueta?: unknown })
      if (e) mapa.set(String((linha as { id: unknown }).id), e)
    }
  } catch {
    // 113 por aplicar, ou a base indisponível: sem etiquetas, e o resto do painel não sente.
  }
  return mapa
}
