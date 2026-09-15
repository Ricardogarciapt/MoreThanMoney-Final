import { lerRef, type LinhaContaCopia } from '../regras'
import type { PlataformaCopia } from '../tipos'
import { db } from './base'

const txt = (v: unknown) => (v == null || v === '' ? null : String(v))
const plat = (v: unknown): PlataformaCopia => {
  const p = String(v ?? 'mt5').toLowerCase()
  return p === 'mt4' || p === 'tradelocker' || p === 'mtmfunded' ? p : 'mt5'
}

/** A linha de uma conta pela referência, no formato das regras de rota. */
export async function lerContaPorRef(ref: string): Promise<(LinhaContaCopia & { linha: Record<string, unknown> }) | null> {
  const r = lerRef(ref)
  if (!r) return null
  if (r.origem === 'site') {
    const { data } = await db().from('mtmcopy_connections').select('*').eq('id', r.id).maybeSingle()
    if (!data || data.mt5_status === 'disconnected') return null
    const plataforma = plat(data.mt5_platform)
    return {
      ref: `site:${r.id}`, plataforma, userId: String(data.user_id), login: txt(data.mt5_login), servidor: txt(data.mt5_server),
      tlEnv: txt(data.tl_env), tlAccountId: txt(data.tl_account_id), fundedAccountId: txt(data.funded_account_id),
      metaapiAccountId: txt(data.metaapi_account_id), soLeitura: data.funded_somente_leitura === true, linha: data,
    }
  }
  if (r.origem === 'auto') {
    const { data } = await db().from('mtmauto_accounts').select('*').eq('id', r.id).maybeSingle()
    if (!data) return null
    return {
      ref: `auto:${r.id}`, plataforma: plat(data.plataforma), userId: String(data.user_id), login: txt(data.login), servidor: txt(data.servidor),
      tlEnv: txt(data.tl_env), tlAccountId: txt(data.tl_account_id), fundedAccountId: txt(data.funded_account_id),
      metaapiAccountId: txt(data.metaapi_account_id), soLeitura: data.funded_somente_leitura === true, linha: data,
    }
  }
  if (r.origem === 'wt') {
    const { data } = await db().from('webtrader_contas_mt5').select('*').eq('id', r.id).maybeSingle()
    if (!data) return null
    return { ref: `wt:${r.id}`, plataforma: data.plataforma === 'mt4' ? 'mt4' : 'mt5', userId: String(data.user_id), login: txt(data.login), servidor: txt(data.servidor), metaapiAccountId: txt(data.metaapi_account_id), linha: data }
  }
  const { data } = await db().from('mtm_trading_accounts').select('id, user_id, motor, estado, sim_saldo, mt5_login').eq('id', r.id).maybeSingle()
  if (!data || data.motor !== 'sim' || !data.user_id) return null
  return { ref: `funded:${r.id}`, plataforma: 'mtmfunded', userId: String(data.user_id), fundedAccountId: r.id, soLeitura: data.estado !== 'ativa', linha: data }
}


/**
 * A conta MT usa a chave MetaApi da casa? Contas MTM Auto de uma equipa (franchisado) vivem noutra
 * chave; a cópia entre contas só fala com a da casa nesta entrega.
 */
export async function usaChaveMetaApiDaCasa(conta: { ref: string; userId: string; plataforma: string }): Promise<boolean> {
  if (conta.plataforma !== 'mt4' && conta.plataforma !== 'mt5') return true
  if (lerRef(conta.ref)?.origem !== 'auto') return true
  const { data } = await db().from('mtmauto_users').select('tenant_id').eq('user_id', conta.userId).maybeSingle()
  return !data?.tenant_id
}
