import { lerRef, type LinhaContaCopia } from '../regras'
import { resolverToken, type TokenResolvido } from '../tokens'
import type { PlataformaCopia } from '../tipos'
import { db } from './base'

const txt = (v: unknown) => (v == null || v === '' ? null : String(v))
const plat = (v: unknown): PlataformaCopia => {
  const p = String(v ?? 'mt5').toLowerCase()
  return p === 'mt4' || p === 'tradelocker' || p === 'mtmfunded' ? p : 'mt5'
}

export type ContaPorRef = LinhaContaCopia & {
  linha: Record<string, unknown>
  /** equipa MTM Auto da conta (auto: pelo dono; prov: pela dona do provider) */
  tenantId?: string | null
  /** prov: conta MetaApi criada com a chave da equipa */
  providerNaChaveEquipa?: boolean
}

/** Plataforma de uma conta de estratégia; null = tipo que não é uma conta (mtm_t2t, telegram). */
export function plataformaDoProvider(p: Record<string, unknown>): PlataformaCopia | null {
  // fonte_execucao='espelho' (084): a estratégia é lida da conta MTM Funded espelho da casa
  if (p.fonte_execucao === 'espelho' && p.espelho_funded_account_id) return 'mtmfunded'
  if (p.tipo === 'mtmfunded') return 'mtmfunded'
  if (p.tipo === 'tradelocker') return 'tradelocker'
  if (p.tipo === 'metaapi') return p.plataforma === 'mt4' ? 'mt4' : 'mt5'
  return null
}

/** A linha de uma conta pela referência, no formato das regras de rota. */
export async function lerContaPorRef(ref: string): Promise<ContaPorRef | null> {
  const r = lerRef(ref)
  if (!r) return null
  if (r.origem === 'site') {
    const { data } = await db().from('mtmcopy_connections').select('*').eq('id', r.id).maybeSingle()
    if (!data || data.mt5_status === 'disconnected') return null
    const plataforma = plat(data.mt5_platform)
    return {
      ref: `site:${r.id}`, plataforma, userId: String(data.user_id), login: txt(data.mt5_login), servidor: txt(data.mt5_server),
      tlEnv: txt(data.tl_env), tlAccountId: txt(data.tl_account_id), fundedAccountId: txt(data.funded_account_id),
      metaapiAccountId: txt(data.metaapi_account_id), soLeitura: data.funded_somente_leitura === true, linha: data, tenantId: null,
    }
  }
  if (r.origem === 'auto') {
    const { data } = await db().from('mtmauto_accounts').select('*').eq('id', r.id).maybeSingle()
    if (!data) return null
    const { data: u } = await db().from('mtmauto_users').select('tenant_id').eq('user_id', data.user_id).maybeSingle()
    return {
      ref: `auto:${r.id}`, plataforma: plat(data.plataforma), userId: String(data.user_id), login: txt(data.login), servidor: txt(data.servidor),
      tlEnv: txt(data.tl_env), tlAccountId: txt(data.tl_account_id), fundedAccountId: txt(data.funded_account_id),
      metaapiAccountId: txt(data.metaapi_account_id), soLeitura: data.funded_somente_leitura === true, linha: data,
      tenantId: txt(u?.tenant_id),
    }
  }
  if (r.origem === 'wt') {
    const { data } = await db().from('webtrader_contas_mt5').select('*').eq('id', r.id).maybeSingle()
    if (!data) return null
    return { ref: `wt:${r.id}`, plataforma: data.plataforma === 'mt4' ? 'mt4' : 'mt5', userId: String(data.user_id), login: txt(data.login), servidor: txt(data.servidor), metaapiAccountId: txt(data.metaapi_account_id), linha: data, tenantId: null }
  }
  if (r.origem === 'prov') {
    const { data } = await db().from('mtmauto_providers').select('*').eq('id', r.id).maybeSingle()
    if (!data) return null
    const plataforma = plataformaDoProvider(data)
    if (!plataforma) return null
    const tenantId = txt(data.tenant_id)
    return {
      ref: `prov:${r.id}`, plataforma,
      // o «dono» de uma estratégia é quem a criou (a regra do mesmo dono não se lhe aplica)
      userId: String(data.criado_por ?? data.tenant_id ?? 'provider'),
      login: txt(data.login), servidor: txt(data.servidor), tlEnv: txt(data.tl_env), tlAccountId: txt(data.tl_account_id),
      fundedAccountId: plataforma === 'mtmfunded' && data.fonte_execucao === 'espelho' ? txt(data.espelho_funded_account_id) : txt(data.funded_account_id),
      metaapiAccountId: plataforma === 'mtmfunded' ? null : txt(data.metaapi_account_id),
      // um provider nunca recebe ordens
      soLeitura: true, linha: data, provider: { id: r.id, tenantId }, tenantId,
      providerNaChaveEquipa: data.metaapi_chave_equipa === true,
    }
  }
  const { data } = await db().from('mtm_trading_accounts').select('id, user_id, motor, estado, sim_saldo, mt5_login').eq('id', r.id).maybeSingle()
  if (!data || data.motor !== 'sim' || !data.user_id) return null
  return { ref: `funded:${r.id}`, plataforma: 'mtmfunded', userId: String(data.user_id), fundedAccountId: r.id, soLeitura: data.estado !== 'ativa', linha: data, tenantId: null }
}

const tokensEquipa = new Map<string, { token: string | null; em: number }>()

/** Chave MetaApi de uma equipa (cache 5 min). Nunca sai deste módulo para logs. */
async function tokenDaEquipa(tenantId: string): Promise<string | null> {
  const c = tokensEquipa.get(tenantId)
  if (c && Date.now() - c.em < 300_000) return c.token
  const { data } = await db().from('mtmauto_tenants').select('metaapi_token').eq('id', tenantId).maybeSingle()
  const token = txt(data?.metaapi_token)
  tokensEquipa.set(tenantId, { token, em: Date.now() })
  return token
}

/**
 * A chave MetaApi desta conta (lib/copia-contas/tokens.ts decide). null = não há chave utilizável
 * (provider criado na chave de uma equipa que já não a tem) — a conta não entra na cópia.
 */
export async function tokenDaConta(conta: Pick<ContaPorRef, 'ref' | 'tenantId' | 'providerNaChaveEquipa'>): Promise<TokenResolvido | null> {
  const tokenEquipa = conta.tenantId ? await tokenDaEquipa(conta.tenantId) : null
  return resolverToken({
    ref: conta.ref, tenantId: conta.tenantId ?? null, tokenEquipa, providerNaChaveEquipa: conta.providerNaChaveEquipa,
    tokenCasa: process.env.METAAPI_TOKEN ?? null,
  })
}

/**
 * A conta MT usa a chave MetaApi da casa? (Vista do admin e acções de conta continuam só na casa.)
 * Uma conta de equipa SEM chave própria usa a da casa — como mtm-auto/lib/token-tenant.ts.
 */
export async function usaChaveMetaApiDaCasa(conta: { ref: string; userId: string; plataforma: string; tenantId?: string | null; providerNaChaveEquipa?: boolean }): Promise<boolean> {
  if (conta.plataforma !== 'mt4' && conta.plataforma !== 'mt5') return true
  const origem = lerRef(conta.ref)?.origem
  if (origem !== 'auto' && origem !== 'prov') return true
  let tenantId = conta.tenantId
  if (tenantId === undefined && origem === 'auto') {
    const { data } = await db().from('mtmauto_users').select('tenant_id').eq('user_id', conta.userId).maybeSingle()
    tenantId = txt(data?.tenant_id)
  }
  const t = await tokenDaConta({ ref: conta.ref, tenantId: tenantId ?? null, providerNaChaveEquipa: conta.providerNaChaveEquipa })
  return t?.chave === 'casa'
}
