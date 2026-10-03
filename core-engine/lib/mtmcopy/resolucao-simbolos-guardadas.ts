/**
 * O que a resolução automática de símbolos já decidiu, por conta — lido e escrito em
 * `metaapi_simbolos_cache.simbolos_resolvidos` (migração 149).
 *
 * A DECISÃO toda vive em `resolucao-simbolos.ts`, pura. Aqui é só a base.
 *
 * TRAVÃO DE QUOTA: este ficheiro NUNCA chama a MetaApi. Lê e escreve a linha que já existe para a
 * conta e mais nada. A cache de símbolos existe precisamente para a MetaApi não ser chamada em
 * cada ordem — já houve um bloqueio de quota por se estar a tocar em contas não-deployadas, e a
 * resolução de sufixos não pode ser o caminho por onde isso volta.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/** Canónico → símbolo da corretora, para esta conta. `{}` quando não há nada escrito. */
export async function lerResolucoes(accountId: string): Promise<Record<string, string>> {
  if (!accountId) return {}
  const { data, error } = await getSupabaseAdmin()
    .from('metaapi_simbolos_cache')
    .select('simbolos_resolvidos')
    .eq('account_id', accountId)
    .maybeSingle()
  if (error || !data) return {}
  const m = (data as { simbolos_resolvidos?: unknown }).simbolos_resolvidos
  return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, string>) : {}
}

/**
 * Guarda uma resolução. Idempotente e aditiva: só escreve quando a chave é nova ou mudou, para
 * não gerar escritas inúteis em cada ordem.
 *
 * Nunca apaga o que lá está — quem tira uma resolução é quem verifica que o símbolo deixou de
 * existir, e essa verificação faz-se ao ler o catálogo, não aqui.
 */
export async function guardarResolucao(accountId: string, canonico: string, simbolo: string): Promise<void> {
  const chave = String(canonico ?? '').toUpperCase().trim()
  const valor = String(simbolo ?? '').trim()
  if (!accountId || !chave || !valor) return

  const atuais = await lerResolucoes(accountId)
  if (atuais[chave] === valor) return

  await getSupabaseAdmin()
    .from('metaapi_simbolos_cache')
    .upsert({ account_id: accountId, simbolos_resolvidos: { ...atuais, [chave]: valor } }, { onConflict: 'account_id' })
}
