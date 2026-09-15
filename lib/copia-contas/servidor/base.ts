import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { fetchMetaApiOverview, type MetaApiOverview } from '@/lib/mtmcopy/metaapi-admin'
import {
  CANONICAL_AURUMFLOW_ACCOUNT_ID, CANONICAL_BOOSTER_ACCOUNT_ID, CANONICAL_COPYTRADER_RG_ACCOUNT_ID,
  CANONICAL_GOLDKILLER_ACCOUNT_ID, CANONICAL_PREMIUM_ACCOUNT_ID, SENSEI_PROVIDER_ACCOUNT_ID,
} from '@/lib/mtmcopy/provider-constants'
import { contasStreaming } from '@/lib/mtmcopy/metaapi-snapshot-regras'
import { INTERRUPTORES_FECHADOS, type Interruptores } from '../regras'

/**
 * Peças do servidor partilhadas pelas rotas do admin «MTM Auto · Cópia».
 *
 * Carga (Supabase caiu a 15/09): a fotografia da MetaApi (contas + estratégias + subscritores, 3–5
 * pedidos REST de listagem, nunca RPC por conta) fica 60 s em memória por instância. O painel
 * pode abrir-se em vários separadores sem multiplicar pedidos.
 */

export const db = () => getSupabaseAdmin()

let fotoMetaApi: { v: MetaApiOverview; em: number } | null = null
let emCurso: Promise<MetaApiOverview> | null = null

/**
 * `falhou`: a listagem de contas veio vazia (com token). `cfFalhou`: a listagem de estratégias veio
 * vazia com subscritores listados — fetchMetaApiOverview engole erros e devolve [], e uma lista de
 * estratégias vazia por erro faria TODAS as subscrições parecerem «a estratégia morta».
 */
export async function metaApiFotografia(opcoes: { fresca?: boolean } = {}): Promise<MetaApiOverview & { lidaEm: string; falhou: boolean; cfFalhou: boolean }> {
  const agora = Date.now()
  if (!opcoes.fresca && fotoMetaApi && agora - fotoMetaApi.em < 60_000) {
    return { ...fotoMetaApi.v, lidaEm: new Date(fotoMetaApi.em).toISOString(), falhou: false, cfFalhou: cfFalhou(fotoMetaApi.v) }
  }
  if (!emCurso) {
    emCurso = fetchMetaApiOverview().finally(() => { emCurso = null })
  }
  try {
    const v = await emCurso
    // Uma listagem vazia com token configurado é quase sempre falha de rede (a função engole erros).
    const falhou = v.configured && v.accounts.length === 0
    if (!falhou) fotoMetaApi = { v, em: Date.now() }
    return { ...v, lidaEm: new Date().toISOString(), falhou, cfFalhou: falhou || cfFalhou(v) }
  } catch {
    return { configured: false, accounts: [], provisioningProfiles: [], strategies: [], subscribers: [], regions: [], lidaEm: new Date().toISOString(), falhou: true, cfFalhou: true }
  }
}

const cfFalhou = (v: MetaApiOverview) => v.configured && v.strategies.length === 0

export function esquecerFotografiaMetaApi() {
  fotoMetaApi = null
}

export async function lerInterruptores(): Promise<Interruptores> {
  const { data, error } = await db().from('site_settings').select('key, value').in('key', ['copia_contas', 'copia_contas_live_desbloqueado'])
  if (error) return { ...INTERRUPTORES_FECHADOS }
  const porChave = new Map((data ?? []).map((r) => [String(r.key), r.value as unknown]))
  const global = porChave.get('copia_contas') as { ligado?: boolean } | null | undefined
  return {
    globalLigado: global?.ligado === true,
    liveDesbloqueado: porChave.get('copia_contas_live_desbloqueado') === true,
    // O processo do site nunca escreve; só o serviço do VPS com COPIA_ESCRITA=1.
    escritaNoProcesso: false,
  }
}

/** Contas MetaApi que não são de clientes: providers, mestres de estratégia, streaming. */
export async function idsMetaApiDeSistema(): Promise<Set<string>> {
  const ids = new Set<string>(
    [
      CANONICAL_PREMIUM_ACCOUNT_ID, CANONICAL_GOLDKILLER_ACCOUNT_ID, CANONICAL_BOOSTER_ACCOUNT_ID,
      CANONICAL_COPYTRADER_RG_ACCOUNT_ID, CANONICAL_AURUMFLOW_ACCOUNT_ID, SENSEI_PROVIDER_ACCOUNT_ID,
      ...contasStreaming(process.env.PREMIUM_STREAMING_CONTAS),
    ].filter((v): v is string => Boolean(v)),
  )
  const [{ data: provs }, { data: contas }] = await Promise.all([
    db().from('mtmauto_providers').select('metaapi_account_id').not('metaapi_account_id', 'is', null),
    db().from('mtm_trading_accounts').select('metaapi_account_id').not('metaapi_account_id', 'is', null),
  ])
  for (const r of [...(provs ?? []), ...(contas ?? [])]) if (r.metaapi_account_id) ids.add(String(r.metaapi_account_id))
  return ids
}

export const erroJson = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300)
