import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Peças do servidor do Centro de Controlo.
 *
 * Regras de carga (Supabase frágil desde 15/09):
 *  · só leituras com colunas escolhidas, por índice e com limite;
 *  · cada loader faz 1–3 consultas e fica em cache (lib/admin-centro/cache.ts) 10–30 s;
 *  · NUNCA chamadas à MetaApi a partir do painel — estado guardado, fotografia de streaming,
 *    travão de quota e registo de contas inexistentes.
 *  · tabelas de migrações ainda por aplicar (082/083/084/085 noutros ramos) → «pendente», nunca 500.
 */

export const db = () => getSupabaseAdmin()

export type Linha = Record<string, unknown>

export function tabelaEmFalta(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  const c = String(err.code ?? '')
  if (c === 'PGRST205' || c === '42P01' || c === '42703' || c === 'PGRST204' || c === 'PGRST200') return true
  return /does not exist|could not find|schema cache/i.test(String(err.message ?? ''))
}

export interface Resultado<T = Linha> {
  linhas: T[]
  semTabela: boolean
  erro: string | null
  contagem: number | null
}

/** Corre uma consulta PostgREST sem nunca lançar. */
export async function ler<T = Linha>(q: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null; count?: number | null }>): Promise<Resultado<T>> {
  try {
    const r = await q
    if (r.error) return { linhas: [], semTabela: tabelaEmFalta(r.error), erro: tabelaEmFalta(r.error) ? null : String(r.error.message ?? 'erro'), contagem: null }
    return { linhas: (Array.isArray(r.data) ? r.data : r.data ? [r.data] : []) as T[], semTabela: false, erro: null, contagem: r.count ?? null }
  } catch (e) {
    return { linhas: [], semTabela: false, erro: e instanceof Error ? e.message : String(e), contagem: null }
  }
}

export const txt = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
export const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
export const ehUuid = (v: unknown): v is string => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? ''))

/** Divide ids em fatias (um `in` gigante rebenta o URL do PostgREST). */
export function fatias<T>(xs: T[], n = 200): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}
