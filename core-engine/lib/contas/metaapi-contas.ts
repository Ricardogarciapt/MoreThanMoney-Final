import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { deleteMetaApiAccount } from '@/lib/mtmcopy/metaapi-provision'

/**
 * Operações MetaApi do ligador de contas — com RELEITURA depois de escrever.
 *
 * Lição de 2026-09-01 (copyfactory-desubscricao-partida): com a MetaApi, a resposta de uma
 * chamada não é prova. Depois de apagar ou mudar uma conta, lê-se outra vez e confirma-se.
 */

const PROVISIONING_BASE =
  process.env.METAAPI_PROVISIONING_URL ?? 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

/**
 * Chave MetaApi de uma conta do MTM Auto: a do inquilino (franchisado) ganha à da casa — é o
 * mesmo critério de `tokenPara` na app MTM Auto. Contas do site usam sempre a da casa.
 */
export async function tokenMetaApiDoUtilizador(userId: string, origem: 'site' | 'auto'): Promise<string | null> {
  if (origem === 'auto') {
    const db = getSupabaseAdmin()
    const { data: u } = await db.from('mtmauto_users').select('tenant_id').eq('user_id', userId).maybeSingle()
    if (u?.tenant_id) {
      const { data: t } = await db.from('mtmauto_tenants').select('metaapi_token').eq('id', u.tenant_id).maybeSingle()
      if (t?.metaapi_token) return String(t.metaapi_token)
    }
  }
  return process.env.METAAPI_TOKEN ?? null
}

/** Lê a conta na MetaApi. `null` = já não existe (404). `undefined` = não deu para ler. */
export async function lerContaMetaApi(
  accountId: string,
  token: string,
): Promise<{ server?: string; login?: string; state?: string; connectionStatus?: string } | null | undefined> {
  try {
    const r = await fetch(`${PROVISIONING_BASE}/users/current/accounts/${accountId}`, {
      headers: { 'auth-token': token },
      cache: 'no-store',
    })
    if (r.status === 404) return null
    if (!r.ok) return undefined
    return (await r.json()) as { server?: string; login?: string; state?: string; connectionStatus?: string }
  } catch {
    return undefined
  }
}

/**
 * Apaga a conta na MetaApi (undeploy + delete) pelo caminho de sempre e CONFIRMA relendo.
 * Com a chave da casa reutiliza `deleteMetaApiAccount`; com a de um inquilino faz o mesmo à mão.
 */
export async function apagarContaMetaApiConfirmado(accountId: string, token: string): Promise<{ ok: boolean; erro?: string }> {
  let pedido = false
  if (token === process.env.METAAPI_TOKEN) {
    pedido = await deleteMetaApiAccount(accountId).catch(() => false)
  } else {
    await fetch(`${PROVISIONING_BASE}/users/current/accounts/${accountId}/undeploy`, {
      method: 'POST',
      headers: { 'auth-token': token },
    }).catch(() => null)
    for (let i = 0; i < 6 && !pedido; i++) {
      const r = await fetch(`${PROVISIONING_BASE}/users/current/accounts/${accountId}`, {
        method: 'DELETE',
        headers: { 'auth-token': token },
      }).catch(() => null)
      if (r && (r.status === 404 || (r.status >= 200 && r.status < 300))) pedido = true
      else await new Promise((ok) => setTimeout(ok, 3000))
    }
  }
  // Releitura: só é "apagada" quando a MetaApi diz que já não a conhece (ou está a ser apagada).
  const lida = await lerContaMetaApi(accountId, token)
  if (lida === null || lida?.state === 'DELETING') return { ok: true }
  return { ok: false, erro: pedido ? 'A MetaApi aceitou o pedido mas a conta ainda aparece — o reconciliador volta a tentar.' : 'A MetaApi não apagou a conta.' }
}

/**
 * Muda a password e/ou o servidor de uma conta MetaApi existente e volta a pô-la a ligar.
 * Confirma relendo o servidor. A password nunca é devolvida nem escrita em logs.
 */
export async function atualizarCredenciaisMetaApi(
  accountId: string,
  token: string,
  alteracoes: { password?: string; server?: string; nome?: string },
): Promise<{ ok: boolean; erro?: string }> {
  const lida = await lerContaMetaApi(accountId, token)
  if (lida === null) return { ok: false, erro: 'Esta conta já não existe na MetaApi. Remove-a e liga-a de novo.' }
  if (lida === undefined) return { ok: false, erro: 'A MetaApi não respondeu. Tenta daqui a pouco.' }
  const corpo: Record<string, unknown> = { name: alteracoes.nome ?? (lida as { name?: string }).name ?? `MTM ${lida.login ?? ''}` }
  if (alteracoes.password) corpo.password = alteracoes.password
  if (alteracoes.server) corpo.server = alteracoes.server
  const r = await fetch(`${PROVISIONING_BASE}/users/current/accounts/${accountId}`, {
    method: 'PUT',
    headers: { 'auth-token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  }).catch(() => null)
  if (!r || !(r.status >= 200 && r.status < 300)) {
    const msg = r ? await r.json().then((j: { message?: string }) => j.message).catch(() => null) : null
    return { ok: false, erro: msg ? `A MetaApi recusou: ${msg}` : 'A MetaApi recusou a alteração.' }
  }
  await fetch(`${PROVISIONING_BASE}/users/current/accounts/${accountId}/redeploy`, {
    method: 'POST',
    headers: { 'auth-token': token },
  }).catch(() => null)
  if (alteracoes.server) {
    const relida = await lerContaMetaApi(accountId, token)
    if (!relida || String(relida.server ?? '').toLowerCase() !== alteracoes.server.toLowerCase()) {
      return { ok: false, erro: 'A MetaApi não confirmou o servidor novo.' }
    }
  }
  return { ok: true }
}
