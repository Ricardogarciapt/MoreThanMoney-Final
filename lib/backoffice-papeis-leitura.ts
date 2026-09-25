/**
 * LER os papéis e as restrições — e mais nada.
 *
 * Isto está separado de `lib/backoffice-sessao.ts` por uma razão de runtime, não de arrumação: o
 * MIDDLEWARE corre no edge e não pode importar `next/headers` (é o que o `userIdDoPedido` usa).
 * Enquanto as duas coisas viviam no mesmo ficheiro, importar a leitura no middleware arrastava
 * `next/headers` com ela e a build rebentava — um erro que só aparece ao compilar, longe daqui.
 *
 * Por isso: aqui só funções que recebem um cliente Supabase já feito. Servem o do edge (chave anon
 * + sessão, com a RLS «cada um vê os seus») e o do servidor (service role, pela id verificada).
 */

import { ehPapel, type Papel } from '@/lib/backoffice-papeis'
import { normalizarAreas, type AreaSite } from '@/lib/backoffice-acessos-site'

/** Um papel atribuído, como está na base. `rankKey` fica por preencher até haver ranks por papel. */
export interface PapelAtribuido {
  papel: Papel
  rankKey: string | null
  atribuidoAt: string | null
  atribuidoPor: string | null
}

/** O mínimo de um cliente Supabase que estas leituras usam — serve o do edge e o do servidor. */
export type ClienteLeitura = {
  from: (tabela: string) => {
    select: (colunas: string) => {
      eq: (coluna: string, valor: string) => any
    }
  }
}

/**
 * Os papéis ACTIVOS de uma pessoa. Retirado = `retirado_at` preenchido, e essas linhas ficam na
 * base como histórico mas nunca como permissão.
 *
 * Erro de leitura devolve lista VAZIA, nunca lança. Uma falha de base tem de fechar a porta em
 * silêncio e não abri-la — e um `throw` no middleware dava 500 em todo o site, não só aqui.
 */
export async function papeisActivosDe(
  supabase: ClienteLeitura,
  userId: string,
): Promise<PapelAtribuido[]> {
  try {
    const { data, error } = await supabase
      .from('backoffice_papeis')
      .select('papel, rank_key, atribuido_at, atribuido_por, retirado_at')
      .eq('user_id', userId)
      .is('retirado_at', null)

    if (error || !Array.isArray(data)) return []

    return (data as Array<Record<string, unknown>>)
      .filter((r) => ehPapel(r.papel))
      .map((r) => ({
        papel: r.papel as Papel,
        rankKey: typeof r.rank_key === 'string' ? r.rank_key : null,
        atribuidoAt: typeof r.atribuido_at === 'string' ? r.atribuido_at : null,
        atribuidoPor: typeof r.atribuido_por === 'string' ? r.atribuido_por : null,
      }))
  } catch {
    return []
  }
}

/** A restrição de áreas do site guardada para esta pessoa. Vazio = sem restrição. */
export async function areasRestritasDe(supabase: ClienteLeitura, userId: string): Promise<AreaSite[]> {
  try {
    const { data } = await supabase
      .from('backoffice_acessos_site')
      .select('areas')
      .eq('user_id', userId)
      .maybeSingle()
    return normalizarAreas((data as { areas?: unknown } | null)?.areas)
  } catch {
    return []
  }
}
