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

/**
 * Tabela em falta e COLUNA em falta são coisas diferentes, e confundi-las já custou caro:
 * pedir `balance` em `mtmcopy_connections` (coluna que nunca existiu) devolvia o mesmo que uma
 * migração por aplicar — lista vazia, sem erro nenhum — e TODAS as contas T2T/site desapareciam
 * do painel sem ninguém perceber porquê.
 *
 *  · `'tabela'` = migração por aplicar → o painel diz «pendente» e segue (não é avaria nossa).
 *  · `'coluna'` = BUG NOSSO no select → tem de gritar, com a mensagem da base à frente.
 */
export type FalhaEsquema = 'tabela' | 'coluna' | null

export function falhaDeEsquema(err: { code?: string; message?: string } | null | undefined): FalhaEsquema {
  if (!err) return null
  const c = String(err.code ?? '')
  const m = String(err.message ?? '')
  // A coluna vem PRIMEIRO: as duas mensagens do PostgREST acabam em «schema cache» e a regra
  // genérica de baixo apanharia as duas.
  if (c === '42703' || c === 'PGRST204') return 'coluna'
  if (/column .* does not exist|could not find the '[^']*' column/i.test(m)) return 'coluna'
  if (c === 'PGRST205' || c === '42P01' || c === 'PGRST200') return 'tabela'
  if (/relation .* does not exist|could not find the table|schema cache/i.test(m)) return 'tabela'
  return null
}

/** Compatibilidade: só «tabela» conta como tabela em falta. */
export function tabelaEmFalta(err: { code?: string; message?: string } | null | undefined): boolean {
  return falhaDeEsquema(err) === 'tabela'
}

export interface Resultado<T = Linha> {
  linhas: T[]
  semTabela: boolean
  /** O select pediu uma coluna que a base não tem — bug nosso, visível em `erro`. */
  semColuna: boolean
  erro: string | null
  contagem: number | null
}

/** Tabela OU coluna em falta — para quem tenta um select mais rico e cai para um mais pobre. */
export const semEsquema = (r: Resultado<unknown>): boolean => r.semTabela || r.semColuna

/** Corre uma consulta PostgREST sem nunca lançar. */
export async function ler<T = Linha>(q: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null; count?: number | null }>): Promise<Resultado<T>> {
  try {
    const r = await q
    if (r.error) {
      const f = falhaDeEsquema(r.error)
      return {
        linhas: [],
        semTabela: f === 'tabela',
        semColuna: f === 'coluna',
        erro: f === 'tabela' ? null : `${f === 'coluna' ? 'coluna inexistente no select: ' : ''}${String(r.error.message ?? 'erro')}`,
        contagem: null,
      }
    }
    return { linhas: (Array.isArray(r.data) ? r.data : r.data ? [r.data] : []) as T[], semTabela: false, semColuna: false, erro: null, contagem: r.count ?? null }
  } catch (e) {
    return { linhas: [], semTabela: false, semColuna: false, erro: e instanceof Error ? e.message : String(e), contagem: null }
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
