/**
 * Onde vive a cache PARTILHADA da MetaApi (tabela `metaapi_simbolos_cache`, migração 080).
 *
 * Interface separada da implementação para os testes poderem trocar a base por uma loja em
 * memória. Todas as leituras são de UMA linha pela chave primária — a base acabou de sair de uma
 * sobrecarga e isto corre dentro de monitores de 1 s.
 *
 * `SEM_TABELA` = a migração ainda não foi aplicada: quem chama volta ao comportamento antigo.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const SEM_TABELA = 'sem-tabela' as const
export type SemTabela = typeof SEM_TABELA

/** Spec guardada de um símbolo: o objeto (subconjunto) e quando foi lido. */
export interface SpecGuardada {
  em: number
  v: Record<string, unknown>
}

export interface LinhaSimbolos {
  simbolos: string[]
  specs: Record<string, SpecGuardada>
  /** epoch ms; null = nunca lida ou marcada para refrescar */
  atualizadoEm: number | null
  /** epoch ms; null = sem bloqueio */
  bloqueioAte: number | null
}

export type Reclamacao = 'ok' | 'ocupado' | 'bloqueado'

export interface LojaMetaApi {
  /** null = a conta ainda não tem linha. */
  ler(accountId: string): Promise<LinhaSimbolos | null | SemTabela>
  reclamar(accountId: string, segundos: number): Promise<Reclamacao | SemTabela>
  gravarLista(accountId: string, simbolos: string[]): Promise<void>
  libertar(accountId: string): Promise<void>
  juntarSpec(accountId: string, simbolo: string, spec: SpecGuardada): Promise<void>
  /** Marca a lista para refrescar (só se o último refresco tiver mais de `minIdadeMs`) e esquece as specs. */
  esquecer(accountId: string, opts: { lista: boolean; minIdadeMs: number }): Promise<void>
  /** Bloqueios de quota (epoch ms) das contas pedidas; ausentes = sem bloqueio. */
  lerBloqueios(ids: string[]): Promise<Map<string, number> | SemTabela>
  bloquear(ids: string[], ateMs: number, api: string | null, motivo: string): Promise<void>
}

function tabelaEmFalta(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  const c = String(err.code ?? '')
  if (c === 'PGRST205' || c === '42P01' || c === 'PGRST202' || c === '42883') return true
  return /metaapi_simbolos_(cache|reclamar|juntar_spec)/.test(String(err.message ?? '')) && /does not exist|not find|schema cache/i.test(String(err.message ?? ''))
}

const ms = (v: unknown): number | null => {
  if (v == null) return null
  const t = Date.parse(String(v))
  return Number.isFinite(t) ? t : null
}

export const lojaSupabase: LojaMetaApi = {
  async ler(accountId) {
    const { data, error } = await getSupabaseAdmin()
      .from('metaapi_simbolos_cache')
      .select('simbolos, specs, atualizado_em, metaapi_quota_bloqueio_ate')
      .eq('account_id', accountId)
      .maybeSingle()
    if (tabelaEmFalta(error)) return SEM_TABELA
    if (error) throw new Error(error.message)
    if (!data) return null
    return {
      simbolos: Array.isArray(data.simbolos) ? (data.simbolos as unknown[]).map(String) : [],
      specs: data.specs && typeof data.specs === 'object' ? (data.specs as Record<string, SpecGuardada>) : {},
      atualizadoEm: ms(data.atualizado_em),
      bloqueioAte: ms(data.metaapi_quota_bloqueio_ate),
    }
  },

  async reclamar(accountId, segundos) {
    const { data, error } = await getSupabaseAdmin().rpc('metaapi_simbolos_reclamar', {
      p_account_id: accountId,
      p_segundos: segundos,
    })
    if (tabelaEmFalta(error)) return SEM_TABELA
    if (error) throw new Error(error.message)
    return data === 'ok' || data === 'bloqueado' ? data : 'ocupado'
  },

  async gravarLista(accountId, simbolos) {
    const { error } = await getSupabaseAdmin()
      .from('metaapi_simbolos_cache')
      .upsert(
        { account_id: accountId, simbolos, atualizado_em: new Date().toISOString(), a_atualizar_ate: null },
        { onConflict: 'account_id' },
      )
    if (error) throw new Error(error.message)
  },

  async libertar(accountId) {
    await getSupabaseAdmin().from('metaapi_simbolos_cache').update({ a_atualizar_ate: null }).eq('account_id', accountId)
  },

  async juntarSpec(accountId, simbolo, spec) {
    const { error } = await getSupabaseAdmin().rpc('metaapi_simbolos_juntar_spec', {
      p_account_id: accountId,
      p_simbolo: simbolo,
      p_spec: spec,
    })
    if (error && !tabelaEmFalta(error)) throw new Error(error.message)
  },

  async esquecer(accountId, opts) {
    const admin = getSupabaseAdmin()
    await admin.from('metaapi_simbolos_cache').update({ specs: {} }).eq('account_id', accountId)
    if (opts.lista) {
      // Só se o último refresco já tiver algum tempo: um símbolo que a corretora NÃO tem não pode
      // obrigar a um getSymbols (500 créditos) a cada ordem.
      await admin
        .from('metaapi_simbolos_cache')
        .update({ atualizado_em: null })
        .eq('account_id', accountId)
        .lt('atualizado_em', new Date(Date.now() - opts.minIdadeMs).toISOString())
    }
  },

  async lerBloqueios(ids) {
    const { data, error } = await getSupabaseAdmin()
      .from('metaapi_simbolos_cache')
      .select('account_id, metaapi_quota_bloqueio_ate')
      .in('account_id', ids)
    if (tabelaEmFalta(error)) return SEM_TABELA
    if (error) throw new Error(error.message)
    const m = new Map<string, number>()
    for (const r of data ?? []) {
      const t = ms(r.metaapi_quota_bloqueio_ate)
      if (t != null) m.set(String(r.account_id), t)
    }
    return m
  },

  async bloquear(ids, ateMs, api, motivo) {
    const ate = new Date(ateMs).toISOString()
    const { error } = await getSupabaseAdmin()
      .from('metaapi_simbolos_cache')
      .upsert(
        ids.map((account_id) => ({
          account_id,
          metaapi_quota_bloqueio_ate: ate,
          metaapi_quota_api: api,
          metaapi_quota_motivo: motivo.slice(0, 300),
        })),
        { onConflict: 'account_id' },
      )
    if (error && !tabelaEmFalta(error)) throw new Error(error.message)
  },
}

// A loja em uso. Os testes trocam-na por uma em memória.
let lojaAtual: LojaMetaApi = lojaSupabase
export function loja(): LojaMetaApi {
  return lojaAtual
}
export function __definirLoja(l: LojaMetaApi | null): void {
  lojaAtual = l ?? lojaSupabase
}
