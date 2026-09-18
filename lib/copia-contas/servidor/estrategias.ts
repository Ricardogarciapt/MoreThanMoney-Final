import { getSubscriberConfiguration } from '@/lib/mtmcopy/copyfactory'
import { removeConnectionCopyFactory, syncConnectionCopyFactory, syncMtmStrategyReplication } from '@/lib/mtmcopy/connection-sync'
import { connectionCopyMethod } from '@/lib/mtmcopy/copy-limits'
import type { MTMcopierConnection } from '@/lib/mtmcopy/types'
import { invalidateCopyConnectionsCache } from '@/lib/mtmcopy/db'
import { estrategiasPedidas, montarEstrategias, type LinhaEstrategia } from '../estrategias'
import { db, esquecerFotografiaMetaApi, metaApiFotografia } from './base'
import { direitosEmLote } from './direitos-lote'
import { idsServidosPeloMotor } from '@/lib/mestres/copyfactory-corte'

/** ESTRATÉGIAS (admin) — fotografias + tabela pura + re-sync com releitura. */

export async function lerEstrategias(): Promise<{ estrategias: LinhaEstrategia[]; emails: Record<string, string | null>; metaapiFalhou: boolean; lidaEm: string }> {
  const [meta, site, auto, subs, provs, funded] = await Promise.all([
    metaApiFotografia(),
    db().from('mtmcopy_connections').select('id, user_id, metaapi_account_id, mt5_login, mt5_server, mt5_platform, mt5_status, is_active, purpose, copy_method, copyfactory_strategy_pick, copyfactory_subscribed, strategy_lots, lot_mode, lot_value, max_risk_percent, account_label').neq('mt5_status', 'disconnected'),
    db().from('mtmauto_accounts').select('id, user_id, metaapi_account_id, login, servidor, plataforma, estado, copia_ativa'),
    db().from('mtmauto_subscriptions').select('id, user_id, conta_id, provider_id, ativo, modo_risco, risco_pct, lote_fixo, multiplicador'),
    db().from('mtmauto_providers').select('id, slug, nome, ativo, metaapi_account_id'),
    db().from('mtm_trading_accounts').select('id, user_id, segue_estrategia, estado, mt5_login').eq('motor', 'sim').not('segue_estrategia', 'is', null).limit(1000),
  ])
  const motor = await lerMotorParaReconciliacao()
  const parada = new Map((auto.data ?? []).map((a) => [String(a.id), a.copia_ativa === false || String(a.estado ?? '').toLowerCase() === 'error']))
  const estrategias = montarEstrategias({
    estrategiasCf: meta.cfFalhou ? null : meta.strategies,
    subscritoresCf: meta.cfFalhou ? null : meta.subscribers,
    providers: (provs.data ?? []) as never,
    site: (site.data ?? []) as never,
    auto: (auto.data ?? []) as never,
    subsAuto: (subs.data ?? []) as never,
    funded: ((funded.data ?? []) as Record<string, unknown>[]).filter((f) => f.user_id) as never,
    contaAutoParada: (id) => parada.get(id) === true,
    motor,
  })
  const users = [...new Set(estrategias.flatMap((e) => e.seguidores.map((s) => s.userId)))]
  const d = await direitosEmLote(users)
  return { estrategias, emails: Object.fromEntries(users.map((u) => [u, d.get(u)?.email ?? null])), metaapiFalhou: meta.falhou, lidaEm: meta.lidaEm }
}

/** Motor das mestres (116): ids CopyFactory cortados e slugs no motor. Sem a 116 → vazio. */
async function lerMotorParaReconciliacao(): Promise<{ idsCortados: Set<string>; slugs: Set<string>; slugsLive: Set<string> }> {
  const { data, error } = await db().from('mestres_estrategias').select('slug, modo, copyfactory_ids, copyfactory_cortado_em')
  if (error || !data) return { idsCortados: new Set(), slugs: new Set(), slugsLive: new Set() }
  return {
    idsCortados: idsServidosPeloMotor(data),
    slugs: new Set(data.map((e) => String(e.slug).toLowerCase())),
    slugsLive: new Set(data.filter((e) => e.modo === 'live').map((e) => String(e.slug).toLowerCase())),
  }
}

/**
 * Re-sync em lote das ligações do site assinaladas, com as mesmas primitivas do PATCH de sempre
 * (/api/mtmcopy/connection: pausada → desubscreve; activa por estratégia → subscreve a config da BD).
 * NÃO usa runMtmcopySystemSync: esse também reconstrói as rotas provider, e as canónicas
 * reconstruídas apagam flags (gotcha do repairProviderRoutes). Depois RELÊ a CopyFactory ligação a
 * ligação — a resposta de uma escrita não é prova.
 */
export async function resyncLigacoes(ids: string[]): Promise<{ id: string; ok: boolean; mensagem: string; subscricoes: string[] | null }[]> {
  const unicos = [...new Set(ids)].slice(0, 25)
  const out: { id: string; ok: boolean; mensagem: string; subscricoes: string[] | null }[] = []
  for (const id of unicos) {
    const { data: l } = await db().from('mtmcopy_connections').select('*').eq('id', id).maybeSingle()
    if (!l) { out.push({ id, ok: false, mensagem: 'ligação não encontrada', subscricoes: null }); continue }
    const conn = l as unknown as MTMcopierConnection
    let r: { ok: boolean; error?: string } = { ok: true }
    if (!conn.metaapi_account_id || conn.account_role === 'master' || (l as { purpose?: string }).purpose === 'tap_to_trade') {
      r = { ok: false, error: 'sem conta MetaApi, mestre ou Tap to Trade — nada a sincronizar na CopyFactory' }
    } else if (conn.is_active === false) {
      r = await removeConnectionCopyFactory(conn.metaapi_account_id)
    } else {
      const metodo = connectionCopyMethod(conn)
      const label = String(conn.account_label ?? '')
      r = metodo === 'strategy' ? await syncMtmStrategyReplication(conn, label) : metodo === 'master_slave' ? await syncConnectionCopyFactory(conn, label) : { ok: false, error: `método ${metodo}: executa por sinais, não pela CopyFactory` }
    }
    const cf = l.metaapi_account_id ? await getSubscriberConfiguration(String(l.metaapi_account_id)) : null
    const subscricoes = cf?.ok ? ((cf.data?.subscriptions as { strategyId: string }[] | undefined) ?? []).map((s) => s.strategyId) : cf && /404|not found/i.test(String(cf.error)) ? [] : null
    const pedidas = l.is_active === false ? [] : estrategiasPedidas(l as never)
    const bate = subscricoes != null && pedidas.every((p) => subscricoes.includes(p)) && (l.is_active !== false || subscricoes.length === 0)
    if (subscricoes != null) {
      await db().from('mtmcopy_connections').update({ copyfactory_subscribed: subscricoes.length > 0, last_error: r.ok ? null : r.error ?? null, updated_at: new Date().toISOString() }).eq('id', id)
    }
    out.push({
      id, ok: r.ok && bate, subscricoes,
      mensagem: subscricoes == null ? 'não foi possível reler a CopyFactory' : bate ? `confirmado: ${subscricoes.join(', ') || 'sem subscrições'}` : `depois do re-sync: pedidas ${pedidas.join(', ') || '—'} · na CopyFactory ${subscricoes.join(', ') || '—'}`,
    })
  }
  invalidateCopyConnectionsCache()
  esquecerFotografiaMetaApi()
  return out
}

export { direitosEmLote }
