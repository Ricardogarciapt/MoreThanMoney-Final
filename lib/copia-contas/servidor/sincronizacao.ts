import { apagarContaMetaApiConfirmado, lerContaMetaApi } from '@/lib/contas/metaapi-contas'
import { getSubscriberConfiguration } from '@/lib/mtmcopy/copyfactory'
import { invalidateCopyConnectionsCache } from '@/lib/mtmcopy/db'
import { undeployMetaApiAccount } from '@/lib/mtmcopy/metaapi-provision'
import { gerarDiffSincronizacao, seleccionarAplicaveis, type Correcao, type DiffSync } from '../reconciliar'
import { db, esquecerFotografiaMetaApi, idsMetaApiDeSistema, metaApiFotografia } from './base'
import { direitosEmLote } from './direitos-lote'

/**
 * «SINCRONIZAR TUDO» no servidor: lê as fotografias (listagens, não RPC), gera o diff puro
 * (../reconciliar) e aplica SÓ o que o admin seleccionou. Cada escrita na MetaApi/CopyFactory é
 * seguida de RELEITURA e o resultado diz o que a releitura mostrou.
 */

const COPYFACTORY_BASE = process.env.METAAPI_COPYFACTORY_URL ?? 'https://copyfactory-api-v1.new-york.agiliumtrade.ai'

export async function preverSincronizacao(): Promise<DiffSync & { lidaEm: string }> {
  const [meta, site, auto, wt, provs, subsAuto, funded, credTl, rotas, sistema, tenants] = await Promise.all([
    metaApiFotografia({ fresca: true }),
    db().from('mtmcopy_connections').select('id, user_id, metaapi_account_id, mt5_login, mt5_server, mt5_platform, mt5_status, is_active, purpose, copyfactory_strategy_pick, funded_account_id, tl_account_id'),
    db().from('mtmauto_accounts').select('id, user_id, metaapi_account_id, login, servidor, plataforma, estado, funded_account_id'),
    db().from('webtrader_contas_mt5').select('id, user_id, metaapi_account_id, login, servidor, estado'),
    db().from('mtmauto_providers').select('id, slug, ativo, metaapi_account_id'),
    db().from('mtmauto_subscriptions').select('id, user_id, conta_id, provider_id, ativo').eq('ativo', true),
    db().from('mtm_trading_accounts').select('id').eq('motor', 'sim'),
    db().from('tradelocker_credenciais').select('mtmcopy_connection_id').not('mtmcopy_connection_id', 'is', null),
    db().from('copia_rotas').select('id, user_id, origem_ref, destino_ref, ativa, estado'),
    idsMetaApiDeSistema(),
    db().from('mtmauto_users').select('user_id').not('tenant_id', 'is', null),
  ])
  const comEquipa = new Set((tenants.data ?? []).map((t) => String(t.user_id)))

  // Quota: só quem tem mais de uma conta MetaApi pode estar acima (o limite mínimo é 1).
  const contagem = new Map<string, number>()
  for (const l of [...(site.data ?? []).filter((x) => x.mt5_status !== 'disconnected'), ...(auto.data ?? []), ...(wt.error ? [] : wt.data ?? [])] as Record<string, unknown>[]) {
    if (l.metaapi_account_id) contagem.set(String(l.user_id), (contagem.get(String(l.user_id)) ?? 0) + 1)
  }
  const candidatos = [...contagem.entries()].filter(([, n]) => n > 1).map(([u]) => u)
  const direitos = await direitosEmLote(candidatos)
  const limitePorUser = new Map(candidatos.map((u) => [u, direitos.get(u)?.quotaBase.limite ?? 1]))

  // O PostgREST corta em 1000 linhas: uma tabela cortada faria contas de clientes parecerem órfãs.
  const truncada = [site, auto, wt].some((r) => (r.data?.length ?? 0) >= 1000)
  const diff = gerarDiffSincronizacao({
    metaapi: meta.falhou || truncada ? null : meta.accounts,
    estrategiasCf: meta.cfFalhou ? null : meta.strategies,
    subscritoresCf: meta.cfFalhou ? null : meta.subscribers,
    site: (site.data ?? []) as never,
    auto: ((auto.data ?? []) as Record<string, unknown>[]).map((a) => ({ ...a, outraChave: comEquipa.has(String(a.user_id)) })) as never,
    webtrader: (wt.error ? [] : wt.data ?? []) as never,
    providers: (provs.data ?? []) as never,
    subsAuto: (subsAuto.data ?? []) as never,
    contasFunded: new Set((funded.data ?? []).map((f) => String(f.id))),
    credenciaisTl: new Set((credTl.data ?? []).map((c) => String(c.mtmcopy_connection_id))),
    rotas: (rotas.error ? [] : rotas.data ?? []) as never,
    idsDeSistema: sistema,
    limitePorUser,
  })
  if (truncada) diff.avisos.push('Uma das tabelas de contas passou das 1000 linhas — órfãs MetaApi não verificadas (paginar antes de confiar).')
  if (rotas.error) diff.avisos.push('copia_rotas não existe ainda (migração 078 por aplicar) — rotas de cópia não verificadas.')
  return { ...diff, lidaEm: meta.lidaEm }
}

async function aplicarUma(c: Correcao): Promise<{ id: string; ok: boolean; mensagem: string }> {
  const a = c.acao
  const token = process.env.METAAPI_TOKEN
  switch (a.tipo) {
    case 'undeploy_metaapi': {
      if (!token) return { id: c.id, ok: false, mensagem: 'METAAPI_TOKEN em falta' }
      await undeployMetaApiAccount(a.accountId)
      const lida = await lerContaMetaApi(a.accountId, token)
      const ok = lida === null || /UNDEPLOY/i.test(String(lida?.state ?? ''))
      return { id: c.id, ok, mensagem: `releitura: ${lida === null ? 'não existe' : lida?.state ?? 'sem resposta'}` }
    }
    case 'apagar_metaapi': {
      if (!token) return { id: c.id, ok: false, mensagem: 'METAAPI_TOKEN em falta' }
      const r = await apagarContaMetaApiConfirmado(a.accountId, token)
      return { id: c.id, ok: r.ok, mensagem: r.ok ? 'apagada (confirmado por releitura)' : r.erro ?? 'não apagou' }
    }
    case 'remover_subscricoes_cf': {
      if (!token) return { id: c.id, ok: false, mensagem: 'METAAPI_TOKEN em falta' }
      const atual = await getSubscriberConfiguration(a.subscriberId)
      if (!atual.ok) return { id: c.id, ok: /404|not found/i.test(String(atual.error)), mensagem: `leitura: ${atual.error}` }
      const subs = ((atual.data?.subscriptions as { strategyId: string }[] | undefined) ?? [])
      const ficam = a.strategyIds === 'todas' ? [] : subs.filter((s) => !(a.strategyIds as string[]).includes(s.strategyId))
      const res = await fetch(`${COPYFACTORY_BASE}/users/current/configuration/subscribers/${a.subscriberId}`, {
        method: 'PUT',
        headers: { 'auth-token': token, 'Content-Type': 'application/json' },
        // o `name` é obrigatório (copyfactory-desubscricao-partida) — mantém-se o que lá está
        body: JSON.stringify({ ...atual.data, name: (atual.data?.name as string) ?? a.subscriberId, subscriptions: ficam }),
      })
      const relida = await getSubscriberConfiguration(a.subscriberId)
      const agora = relida.ok ? ((relida.data?.subscriptions as { strategyId: string }[] | undefined) ?? []).map((s) => s.strategyId) : null
      const alvo = a.strategyIds === 'todas' ? subs.map((s) => s.strategyId) : a.strategyIds
      const ok = agora != null && alvo.every((x) => !agora.includes(x))
      if (ok) {
        await db().from('mtmcopy_connections').update({ copyfactory_subscribed: agora.length > 0, updated_at: new Date().toISOString() }).eq('metaapi_account_id', a.subscriberId)
        invalidateCopyConnectionsCache()
      }
      return { id: c.id, ok, mensagem: `PUT ${res.status} · releitura: ${agora == null ? 'falhou' : agora.join(', ') || 'sem subscrições'}` }
    }
    case 'marcar_ligacao_erro': {
      const patch = a.tabela === 'mtmcopy_connections'
        ? { mt5_status: 'error', last_error: a.erro, updated_at: new Date().toISOString() }
        : a.tabela === 'mtmauto_accounts' ? { estado: 'error', erro: a.erro } : { estado: 'error', erro: a.erro, updated_at: new Date().toISOString() }
      const { error } = await db().from(a.tabela).update(patch).eq('id', a.id)
      if (a.tabela === 'mtmcopy_connections') invalidateCopyConnectionsCache()
      return { id: c.id, ok: !error, mensagem: error ? error.message : 'marcada em erro' }
    }
    case 'desactivar_subscricao_auto': {
      const { error } = await db().from('mtmauto_subscriptions').update({ ativo: false, auto_aceitar: false }).eq('id', a.id)
      return { id: c.id, ok: !error, mensagem: error ? error.message : 'subscrição desactivada' }
    }
    case 'desactivar_rota': {
      const { error } = await db().from('copia_rotas').update({ ativa: false, pausada_motivo: a.motivo }).eq('id', a.id)
      return { id: c.id, ok: !error, mensagem: error ? error.message : 'rota desactivada' }
    }
    default:
      return { id: c.id, ok: false, mensagem: 'sem acção' }
  }
}

/** Aplica as seleccionadas: o diff é RECALCULADO agora — um id que já não aparece não se aplica. */
export async function aplicarSincronizacao(ids: string[], segundaConfirmacao: string | null | undefined) {
  const diff = await preverSincronizacao()
  const { aplicar, recusadas } = seleccionarAplicaveis(diff, ids, segundaConfirmacao)
  const resultados: { id: string; ok: boolean; mensagem: string }[] = []
  for (const c of aplicar.slice(0, 50)) {
    try {
      resultados.push(await aplicarUma(c))
    } catch (e) {
      resultados.push({ id: c.id, ok: false, mensagem: e instanceof Error ? e.message : String(e) })
    }
  }
  esquecerFotografiaMetaApi()
  return { resultados, recusadas }
}
