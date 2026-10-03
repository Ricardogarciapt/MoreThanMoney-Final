/**
 * OS SLUGS DAS ESTRATÉGIAS ESCONDIDAS (`mtmauto_providers.apagado_em`) — uma leitura, para os
 * destinos que não conseguem filtrar na própria consulta.
 *
 * Quase todos os catálogos filtram no SQL (`.is('apagado_em', null)`) e não precisam disto. Há dois
 * que não podem:
 *
 *  · `/api/mtm-auto/estrategias`, que ENCAMINHA para o catálogo do repositório da MTM Auto — o
 *    filtro tem de ser aplicado à resposta, senão esconder uma estratégia no admin do site deixava-a
 *    à vista na app do cliente;
 *  · qualquer painel que receba uma lista já montada e só tenha os slugs.
 *
 * Cache curta: esconder uma estratégia é raro, e a app do cliente não pode ficar 30 s a mostrá-la.
 * O falhanço da leitura devolve conjunto VAZIO de propósito — se a base não responder, mostra-se
 * tudo em vez de esconder tudo: um catálogo vazio parecia uma avaria do produto.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const VALIDADE_MS = 10_000
let cache: { em: number; slugs: Set<string> } | null = null

export async function slugsEscondidos(): Promise<Set<string>> {
  if (cache && Date.now() - cache.em < VALIDADE_MS) return cache.slugs
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('mtmauto_providers')
      .select('slug')
      .not('apagado_em', 'is', null)
      .limit(500)
    if (error) return cache?.slugs ?? new Set()
    const slugs = new Set((data ?? []).map((r) => String(r.slug ?? '').toLowerCase()).filter(Boolean))
    cache = { em: Date.now(), slugs }
    return slugs
  } catch {
    return cache?.slugs ?? new Set()
  }
}

/** Tira da lista o que está escondido. Puro — o conjunto vem de cima. */
export function semEscondidas<T>(lista: T[], escondidas: Set<string>, slugDe: (x: T) => string | null | undefined): T[] {
  if (escondidas.size === 0) return lista
  return lista.filter((x) => {
    const s = String(slugDe(x) ?? '').toLowerCase()
    return !s || !escondidas.has(s)
  })
}

export function esquecerEscondidas(): void {
  cache = null
}
