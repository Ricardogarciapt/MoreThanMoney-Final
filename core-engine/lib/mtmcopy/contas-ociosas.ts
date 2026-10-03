/**
 * CONTAS OCIOSAS — não acordar contas paradas só para as ler.
 *
 * Os trabalhos de manutenção (órfãs, sincronização) liam TODAS as contas, uma a uma, pela ligação
 * RPC. Ler uma conta desligada custa créditos duas vezes: a leitura em si e, pior, o
 * `getRpcConnection` tenta pô-la online (ensureMetaApiAccountOnline faz deploy) — ou seja, uma
 * verificação de rotina acordava contas que a MetaApi tinha desligado por estarem paradas.
 *
 * A regra: salta-se a leitura de uma conta quando as DUAS coisas são verdade —
 *   1. não está ligada (na listagem da MetaApi não está DEPLOYED; sem listagem, o estado guardado
 *      na nossa base não é 'connected'); E
 *   2. não tem nenhuma linha aberta do nosso lado (T2T/sinais ou motor Premium).
 * Uma conta com posições nossas em aberto é SEMPRE lida, esteja como estiver.
 *
 * Nada aqui toca em execução: só decide se os trabalhos de verificação gastam uma leitura.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export type EstadoMetaApi = { state?: string; connectionStatus?: string }

const PROVISIONING_BASE =
  process.env.METAAPI_PROVISIONING_URL ?? 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

/**
 * Estado de todas as contas numa só chamada à API de provisioning.
 * `null` quando a listagem falha ou vem vazia — quem chama cai no estado guardado na base.
 */
export async function lerEstadosMetaApi(): Promise<Map<string, EstadoMetaApi> | null> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return null
  try {
    const res = await fetch(`${PROVISIONING_BASE}/users/current/accounts?limit=1000`, {
      headers: { 'auth-token': token, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as unknown
    const items = (Array.isArray(data) ? data : ((data as { items?: unknown[] })?.items ?? [])) as Array<
      EstadoMetaApi & { _id?: string; id?: string }
    >
    if (!items.length) return null
    const mapa = new Map<string, EstadoMetaApi>()
    for (const a of items) {
      const id = a._id ?? a.id
      if (id) mapa.set(id, { state: a.state, connectionStatus: a.connectionStatus })
    }
    return mapa.size ? mapa : null
  } catch {
    return null
  }
}

/**
 * Decide se se salta a leitura. Pura, para poder ser testada sem rede.
 *
 * `estadosMetaApi` null = não há listagem fiável → usa-se o `mt5Status` guardado.
 * Uma conta que não aparece numa listagem fiável também não está ligada (a remoção em si é
 * tratada noutro sítio, com as suas próprias guardas).
 */
export function deveSaltarLeitura(ctx: {
  accountId: string
  mt5Status: string | null | undefined
  estadosMetaApi: Map<string, EstadoMetaApi> | null
  temLinhasAbertas: boolean
}): boolean {
  if (ctx.temLinhasAbertas) return false
  const ligada = ctx.estadosMetaApi
    ? ctx.estadosMetaApi.get(ctx.accountId)?.state === 'DEPLOYED'
    : ctx.mt5Status === 'connected'
  return !ligada
}

/**
 * Das ligações/contas CANDIDATAS a salto, quais têm alguma linha ABERTA do nosso lado — a razão
 * para as ler sempre. Os estados são os mesmos que a reconciliação trata como vivos.
 *
 * Filtra-se pelas candidatas (e não se lê a tabela inteira) por causa do limite de linhas por
 * pedido do Supabase: uma lista truncada faria parecer «sem linhas abertas» uma conta que as tem.
 * Se alguma consulta falhar, devolve-se `null` e quem chama não salta nada.
 */
export async function contasComLinhasAbertas(
  conexoes: string[],
  contas: string[],
): Promise<{ porConexao: Set<string>; porConta: Set<string> } | null> {
  const db = getSupabaseAdmin()
  const porConexao = new Set<string>()
  const porConta = new Set<string>()
  const lotes = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / 150) }, (_, i) => xs.slice(i * 150, i * 150 + 150))
  try {
    for (const lote of lotes([...new Set(conexoes.filter(Boolean))])) {
      const { data, error } = await db
        .from('mtmcopy_signal_log')
        .select('connection_id')
        .in('status', ['ok', 'filled', 'active', 'open', 'following'])
        .in('connection_id', lote)
        .limit(5000)
      // Resposta no teto de linhas do Supabase = pode vir truncada → não se arrisca saltar nada.
      if (error || (data?.length ?? 0) >= 1000) return null
      for (const l of data ?? []) porConexao.add(String((l as { connection_id?: string }).connection_id ?? ''))
    }
    for (const lote of lotes([...new Set(contas.filter(Boolean))])) {
      const { data, error } = await db
        .from('mtmcopy_premium_active')
        .select('account_id')
        .eq('status', 'open')
        .in('account_id', lote)
        .limit(5000)
      if (error || (data?.length ?? 0) >= 1000) return null
      for (const r of data ?? []) porConta.add(String((r as { account_id?: string }).account_id ?? ''))
    }
  } catch {
    return null
  }
  return { porConexao, porConta }
}
