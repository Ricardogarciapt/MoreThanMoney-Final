import { ehContaMetaApi } from '@/lib/contas/quota-metaapi'
import { apagarContaMetaApiConfirmado, lerContaMetaApi, tokenMetaApiDoUtilizador } from '@/lib/contas/metaapi-contas'
import { getSubscriberConfiguration, unsubscribeFromStrategy } from '@/lib/mtmcopy/copyfactory'
import { removeConnectionCopyFactory, syncMtmStrategyReplication } from '@/lib/mtmcopy/connection-sync'
import { connectionCopyMethod } from '@/lib/mtmcopy/copy-limits'
import { invalidateCopyConnectionsCache } from '@/lib/mtmcopy/db'
import { undeployMetaApiAccount } from '@/lib/mtmcopy/metaapi-provision'
import { ligarContaMt5 } from '@/lib/webtrader/corretoras/mt5'
import type { MTMcopierConnection } from '@/lib/mtmcopy/types'
import { chaveFisica, lerRef } from '../regras'
import type { PlataformaCopia } from '../tipos'
import { db, esquecerFotografiaMetaApi, metaApiFotografia } from './base'
import { direitosEmLote } from './direitos-lote'
import { lerContaPorRef } from './refs'
import { lerEtiquetas } from '@/lib/contas/etiquetas-servidor'
import { lerMestresPorConta } from '@/lib/mestres/servidor/painel-leitura'
import { rotuloUsoT2T } from '@/lib/mtmcopy/alvo-t2t'

export { lerContaPorRef }

/**
 * CONTAS (admin) — todas as contas ligadas nos produtos, numa lista: T2T/site
 * (mtmcopy_connections), MTM Auto (mtmauto_accounts), WebTrader MT5 (webtrader_contas_mt5) e MTM
 * Funded (mtm_trading_accounts ligadas, a seguir estratégias ou em rotas de cópia).
 *
 * Nunca devolve passwords, nem cifradas. Saldos sim (é o admin). Custo: 4–6 consultas com colunas
 * escolhidas + a fotografia MetaApi em cache de 60 s.
 */

export interface ContaAdmin {
  ref: string
  origem: 'site' | 'auto' | 'wt' | 'funded'
  plataforma: PlataformaCopia
  userId: string
  email: string | null
  nome: string | null
  rotulo: string | null
  /** 113 — a etiqueta que o DONO escreveu (null = nenhuma) */
  etiqueta: string | null
  /** 116 — conta SIM mestre de uma estratégia do motor («Mestre · Sensei») */
  mestre: string | null
  login: string | null
  servidor: string | null
  estado: string
  ativa: boolean
  erro: string | null
  demo: boolean
  soLeitura: boolean
  metaapiAccountId: string | null
  metaapiEstado: string | null
  metaapiLigacao: string | null
  /** conta MTM Auto de uma equipa (franchisado): vive noutra chave MetaApi, fora da listagem da casa */
  chaveEquipa: boolean
  contaMetaApi: boolean
  chaveFisica: string | null
  usos: string[]
  saldo: number | null
  plano: string
  motivoDireito: string
  quota: { emUso: number; limite: number | null; acima: boolean }
  criadaEm: string | null
}

const txt = (v: unknown) => (v == null || v === '' ? null : String(v))
const plat = (v: unknown): PlataformaCopia => {
  const p = String(v ?? 'mt5').toLowerCase()
  return p === 'mt4' || p === 'tradelocker' || p === 'mtmfunded' ? p : 'mt5'
}
const demoPeloNome = (s: unknown) => /\b(demo|trial|practice|paper|contest)\b/i.test(String(s ?? ''))

export async function listarContasAdmin(filtro: { userId?: string | null } = {}): Promise<{ contas: ContaAdmin[]; metaapiLidaEm: string; metaapiFalhou: boolean }> {
  const porUser = (q: any) => (filtro.userId ? q.eq('user_id', filtro.userId) : q)
  type Linhas = { data: Record<string, unknown>[] | null; error?: unknown }
  const [site, auto, wt, subs, copiadores, rotas, meta] = (await Promise.all([
    porUser(db().from('mtmcopy_connections').select('id, user_id, account_label, mt5_login, mt5_server, mt5_platform, mt5_status, is_active, last_error, metaapi_account_id, purpose, t2t_enabled, copyfactory_strategy_pick, copyfactory_subscribed, copy_method, balance, funded_account_id, funded_somente_leitura, tl_env, tl_account_id, tl_acc_num, tl_server, created_at').neq('mt5_status', 'disconnected')),
    porUser(db().from('mtmauto_accounts').select('*')),
    porUser(db().from('webtrader_contas_mt5').select('id, user_id, metaapi_account_id, plataforma, login, servidor, rotulo, estado, erro, created_at')),
    porUser(db().from('mtmauto_subscriptions').select('conta_id, provider_id, user_id').eq('ativo', true)),
    porUser(db().from('funded_copiers').select('account_id, destino_tipo, destino_id, user_id, ativo')),
    porUser(db().from('copia_rotas').select('origem_ref, destino_ref, user_id, estado, mestres, estrategia_slug').neq('estado', 'recusada')),
    metaApiFotografia(),
  ])) as [Linhas, Linhas, Linhas, Linhas, Linhas, Linhas, Awaited<ReturnType<typeof metaApiFotografia>>]

  const estadoMeta = new Map(meta.accounts.map((a) => [a.id, a]))
  const idsAuto = [...new Set((auto.data ?? []).map((c) => String(c.user_id)))]
  const { data: tenants } = idsAuto.length ? await db().from('mtmauto_users').select('user_id, tenant_id').in('user_id', idsAuto.slice(0, 500)).not('tenant_id', 'is', null) : { data: [] }
  const comEquipa = new Set((tenants ?? []).map((t) => String(t.user_id)))
  const { data: provs } = await db().from('mtmauto_providers').select('id, nome, slug')
  const nomeProv = new Map((provs ?? []).map((p) => [String(p.id), String(p.nome ?? p.slug)]))
  // Etiquetas (113) à parte: uma coluna em falta num select escolhido deixava a lista vazia.
  const [etSite, etAuto, etWt, etFunded, mestres] = await Promise.all([
    lerEtiquetas('mtmcopy_connections'), lerEtiquetas('mtmauto_accounts'), lerEtiquetas('webtrader_contas_mt5'), lerEtiquetas('mtm_trading_accounts'),
    lerMestresPorConta().catch(() => new Map<string, { rotulo: string }>()),
  ])
  const usosRota = new Map<string, string[]>()
  for (const r of rotas.data ?? []) {
    if (r.mestres === true) {
      usosRota.set(String(r.destino_ref), [...(usosRota.get(String(r.destino_ref)) ?? []), `Motor das mestres · ${r.estrategia_slug ?? '?'}`])
      continue
    }
    usosRota.set(String(r.origem_ref), [...(usosRota.get(String(r.origem_ref)) ?? []), 'Origem de cópia'])
    usosRota.set(String(r.destino_ref), [...(usosRota.get(String(r.destino_ref)) ?? []), 'Destino de cópia'])
  }
  const destinoCopiador = new Set((copiadores.data ?? []).filter((c) => c.ativo).map((c) => `${c.destino_tipo}:${c.destino_id}`))

  // Contas MTM Funded relevantes: ligadas, em rotas, em copiadores 068 ou a seguir estratégias.
  const fundedIds = new Set<string>()
  for (const l of site.data ?? []) if (l.funded_account_id) fundedIds.add(String(l.funded_account_id))
  for (const l of auto.data ?? []) if (l.funded_account_id) fundedIds.add(String(l.funded_account_id))
  for (const c of copiadores.data ?? []) fundedIds.add(String(c.account_id))
  for (const r of rotas.data ?? []) for (const ref of [r.origem_ref, r.destino_ref]) {
    const x = lerRef(ref)
    if (x?.origem === 'funded') fundedIds.add(x.id)
  }
  let fundedQ = db().from('mtm_trading_accounts').select('id, user_id, mt5_login, estado, sim_saldo, segue_estrategia, tipo, created_at').eq('motor', 'sim')
  if (filtro.userId) fundedQ = fundedQ.eq('user_id', filtro.userId)
  const { data: fundedTodas } = filtro.userId
    ? await fundedQ
    : fundedIds.size
      ? await fundedQ.in('id', [...fundedIds].slice(0, 500))
      : { data: [] as Record<string, unknown>[] }
  const { data: seguidoras } = filtro.userId ? { data: [] } : await db().from('mtm_trading_accounts').select('id, user_id, mt5_login, estado, sim_saldo, segue_estrategia, tipo, created_at').eq('motor', 'sim').not('segue_estrategia', 'is', null).limit(500)
  const funded = new Map<string, Record<string, unknown>>()
  for (const f of [...(fundedTodas ?? []), ...(seguidoras ?? [])] as Record<string, unknown>[]) if (f.user_id) funded.set(String(f.id), f)

  const contas: Omit<ContaAdmin, 'email' | 'nome' | 'plano' | 'motivoDireito' | 'quota'>[] = []
  const metaInfo = (id: unknown, equipa = false) => {
    const a = id ? estadoMeta.get(String(id)) : undefined
    if (equipa && !a) return { metaapiEstado: id ? 'chave da equipa' : null, metaapiLigacao: null, chaveEquipa: true }
    return { metaapiEstado: a?.state ?? (id && !meta.falhou ? 'NÃO EXISTE' : null), metaapiLigacao: a?.connectionStatus ?? null, chaveEquipa: false }
  }

  for (const c of site.data ?? []) {
    const plataforma = plat(c.mt5_platform)
    const usos: string[] = []
    // O MESMO rótulo do ligador do site, do painel da app e do admin (lib/mtmcopy/alvo-t2t).
    const usoT2T = rotuloUsoT2T(c)
    if (usoT2T) usos.push(usoT2T)
    if (c.purpose !== 'tap_to_trade' && plataforma !== 'mtmfunded') usos.push(c.copyfactory_strategy_pick ? `CopyFactory · ${c.copyfactory_strategy_pick}${c.copyfactory_subscribed ? '' : ' (não subscrita)'}` : `Cópia (${connectionCopyMethod(c as never)})`)
    if (destinoCopiador.has(`mtmcopy:${c.id}`)) usos.push('Destino copiador MTM Funded')
    usos.push(...(usosRota.get(`site:${c.id}`) ?? []))
    const ref = `site:${c.id}`
    contas.push({
      ref, origem: 'site', plataforma, userId: String(c.user_id), rotulo: txt(c.account_label), etiqueta: etSite.get(String(c.id)) ?? null, mestre: null,
      login: plataforma === 'tradelocker' ? txt(c.tl_acc_num) ?? txt(c.tl_account_id) : txt(c.mt5_login),
      servidor: plataforma === 'tradelocker' ? txt(c.tl_server) ?? txt(c.mt5_server) : txt(c.mt5_server),
      estado: String(c.mt5_status ?? '—'), ativa: c.is_active !== false, erro: txt(c.last_error),
      demo: plataforma === 'tradelocker' ? c.tl_env === 'demo' : demoPeloNome(c.mt5_server),
      soLeitura: plataforma === 'mtmfunded' && c.funded_somente_leitura === true,
      metaapiAccountId: txt(c.metaapi_account_id), ...metaInfo(c.metaapi_account_id),
      contaMetaApi: ehContaMetaApi({ metaapi_account_id: txt(c.metaapi_account_id), login: txt(c.mt5_login), plataforma, estado: txt(c.mt5_status) }),
      chaveFisica: chaveFisica({ ref, plataforma, login: txt(c.mt5_login), servidor: txt(c.mt5_server), tlEnv: txt(c.tl_env), tlAccountId: txt(c.tl_account_id), fundedAccountId: txt(c.funded_account_id) }),
      usos, saldo: typeof c.balance === 'number' ? c.balance : null, criadaEm: txt(c.created_at),
    })
  }
  const subsPorConta = new Map<string, string[]>()
  for (const s of subs.data ?? []) if (s.conta_id) subsPorConta.set(String(s.conta_id), [...(subsPorConta.get(String(s.conta_id)) ?? []), nomeProv.get(String(s.provider_id)) ?? '—'])
  for (const c of auto.data ?? []) {
    const plataforma = plat(c.plataforma)
    const ref = `auto:${c.id}`
    contas.push({
      ref, origem: 'auto', plataforma, userId: String(c.user_id), rotulo: txt(c.rotulo) ?? txt(c.corretora), etiqueta: etAuto.get(String(c.id)) ?? null, mestre: null,
      login: plataforma === 'tradelocker' ? txt(c.tl_acc_num) ?? txt(c.login) : txt(c.login), servidor: txt(c.servidor),
      estado: String(c.estado ?? '—'), ativa: c.copia_ativa !== false, erro: txt(c.erro) ?? txt(c.tl_last_error), demo: Boolean(c.demo),
      soLeitura: c.funded_somente_leitura === true,
      metaapiAccountId: txt(c.metaapi_account_id), ...metaInfo(c.metaapi_account_id, comEquipa.has(String(c.user_id))),
      contaMetaApi: ehContaMetaApi({ metaapi_account_id: txt(c.metaapi_account_id), login: txt(c.login), plataforma, estado: txt(c.estado) }),
      chaveFisica: chaveFisica({ ref, plataforma, login: txt(c.login), servidor: txt(c.servidor), tlEnv: txt(c.tl_env), tlAccountId: txt(c.tl_account_id), fundedAccountId: txt(c.funded_account_id) }),
      usos: ['MTM Auto', ...(subsPorConta.get(String(c.id)) ?? []).map((n) => `Estratégia ${n}`), ...(destinoCopiador.has(`mtmauto:${c.id}`) ? ['Destino copiador MTM Funded'] : []), ...(usosRota.get(ref) ?? [])],
      saldo: null, criadaEm: txt(c.created_at),
    })
  }
  for (const c of (wt.error ? [] : wt.data ?? [])) {
    const ref = `wt:${c.id}`
    const plataforma = c.plataforma === 'mt4' ? 'mt4' : 'mt5'
    contas.push({
      ref, origem: 'wt', plataforma, userId: String(c.user_id), rotulo: txt(c.rotulo), etiqueta: etWt.get(String(c.id)) ?? null, mestre: null, login: txt(c.login), servidor: txt(c.servidor),
      estado: String(c.estado ?? '—'), ativa: true, erro: txt(c.erro), demo: demoPeloNome(c.servidor), soLeitura: false,
      metaapiAccountId: txt(c.metaapi_account_id), ...metaInfo(c.metaapi_account_id),
      contaMetaApi: ehContaMetaApi({ metaapi_account_id: txt(c.metaapi_account_id), login: txt(c.login), plataforma, estado: txt(c.estado) }),
      chaveFisica: chaveFisica({ ref, plataforma, login: txt(c.login), servidor: txt(c.servidor) }),
      usos: ['WebTrader', ...(usosRota.get(ref) ?? [])], saldo: null, criadaEm: txt(c.created_at),
    })
  }
  for (const f of funded.values()) {
    const ref = `funded:${f.id}`
    contas.push({
      ref, origem: 'funded', plataforma: 'mtmfunded', userId: String(f.user_id), rotulo: f.tipo ? `MTM Funded · ${f.tipo}` : 'MTM Funded',
      etiqueta: etFunded.get(String(f.id)) ?? null, mestre: mestres.get(String(f.id))?.rotulo ?? null,
      login: txt(f.mt5_login), servidor: 'MTM Funded', estado: String(f.estado ?? '—'), ativa: f.estado === 'ativa', erro: null, demo: false, soLeitura: false,
      metaapiAccountId: null, metaapiEstado: null, metaapiLigacao: null, chaveEquipa: false, contaMetaApi: false,
      chaveFisica: `mtmfunded:${String(f.id).toLowerCase()}`,
      usos: [...(f.segue_estrategia ? [`Segue ${f.segue_estrategia}`] : []), ...(copiadores.data ?? []).filter((c) => String(c.account_id) === String(f.id)).map(() => 'Origem copiador 068'), ...(usosRota.get(ref) ?? [])],
      saldo: f.sim_saldo == null ? null : Number(f.sim_saldo), criadaEm: txt(f.created_at),
    })
  }

  const direitos = await direitosEmLote(contas.map((c) => c.userId))
  // Quota: contas MetaApi distintas por utilizador (id ou login@servidor), nos três produtos.
  const usoPorUser = new Map<string, Set<string>>()
  for (const c of contas) {
    if (!c.contaMetaApi) continue
    const k = c.metaapiAccountId ? `id:${c.metaapiAccountId}` : `k:${c.chaveFisica}`
    usoPorUser.set(c.userId, (usoPorUser.get(c.userId) ?? new Set()).add(k))
  }
  return {
    metaapiLidaEm: meta.lidaEm,
    metaapiFalhou: meta.falhou,
    contas: contas.map((c) => {
      const d = direitos.get(c.userId)
      const emUso = usoPorUser.get(c.userId)?.size ?? 0
      const limite = d ? (Number.isFinite(d.quotaBase.limite) ? d.quotaBase.limite : null) : null
      return {
        ...c, email: d?.email ?? null, nome: d?.nome ?? null, plano: d?.plano ?? '—', motivoDireito: d?.motivo ?? '—',
        quota: { emUso, limite, acima: limite != null && emUso > limite },
      }
    }),
  }
}

// ── acções ───────────────────────────────────────────────────────────────────

export type AcaoConta = 'sincronizar' | 'pausar' | 'retomar' | 'deploy' | 'undeploy' | 'remover'

export async function acaoConta(ref: string, acao: AcaoConta, opcoes: { confirmacao?: string | null } = {}): Promise<{ ok: boolean; mensagem: string; status?: number; detalhe?: Record<string, unknown> }> {
  const conta = await lerContaPorRef(ref)
  if (!conta) return { ok: false, status: 404, mensagem: 'Conta não encontrada.' }
  const r = lerRef(ref)!
  const metaApi = conta.plataforma === 'mt4' || conta.plataforma === 'mt5'
  const accId = conta.metaapiAccountId ?? null

  if (acao === 'sincronizar') {
    // Re-leitura barata: 1 GET ao provisioning (estado da conta) + a configuração do subscritor na
    // CopyFactory. Nenhuma ligação RPC, nenhum getPositions.
    if (!metaApi || !accId) return { ok: true, mensagem: 'Nada a sincronizar com a MetaApi nesta conta.' }
    const token = await tokenMetaApiDoUtilizador(conta.userId, r.origem === 'auto' ? 'auto' : 'site')
    if (!token) return { ok: false, status: 503, mensagem: 'MetaApi indisponível no servidor.' }
    const lida = await lerContaMetaApi(accId, token)
    esquecerFotografiaMetaApi()
    if (lida === undefined) return { ok: false, status: 502, mensagem: 'A MetaApi não respondeu.' }
    const cf = r.origem === 'site' ? await getSubscriberConfiguration(accId) : null
    const subscricoes = cf?.ok ? ((cf.data?.subscriptions as { strategyId: string }[] | undefined) ?? []).map((s) => s.strategyId) : null
    if (r.origem === 'site') {
      const patch: Record<string, unknown> = {}
      if (lida === null) { patch.mt5_status = 'error'; patch.last_error = 'A conta MetaApi desta ligação já não existe — volta a ligar a conta.' }
      if (subscricoes != null && Boolean(conta.linha.copyfactory_subscribed) !== subscricoes.length > 0) patch.copyfactory_subscribed = subscricoes.length > 0
      if (Object.keys(patch).length) {
        await db().from('mtmcopy_connections').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', r.id)
        invalidateCopyConnectionsCache()
      }
    } else if (r.origem === 'auto' && lida === null && conta.linha.estado !== 'error') {
      await db().from('mtmauto_accounts').update({ estado: 'error', erro: 'A conta MetaApi já não existe.' }).eq('id', r.id)
    }
    return {
      ok: true, mensagem: lida === null ? 'A conta já não existe na MetaApi (marcada em erro).' : `MetaApi: ${lida.state ?? '?'} · ${lida.connectionStatus ?? '?'}`,
      detalhe: { metaapi: lida, subscricoesCopyFactory: subscricoes },
    }
  }

  if (acao === 'pausar' || acao === 'retomar') {
    const ativa = acao === 'retomar'
    if (r.origem === 'site') {
      const conn = conta.linha as unknown as MTMcopierConnection
      await db().from('mtmcopy_connections').update({ is_active: ativa, updated_at: new Date().toISOString() }).eq('id', r.id)
      invalidateCopyConnectionsCache()
      if (!accId || conn.account_role === 'master') return { ok: true, mensagem: ativa ? 'Retomada.' : 'Pausada.' }
      if (!ativa) {
        const u = await removeConnectionCopyFactory(accId)
        // A resposta não é prova: relê-se a CopyFactory (copyfactory-desubscricao-partida).
        const cf = await getSubscriberConfiguration(accId)
        const restantes = cf.ok ? ((cf.data?.subscriptions as unknown[] | undefined) ?? []).length : null
        const parou = u.ok && (restantes === 0 || (!cf.ok && /404|not found/i.test(String(cf.error))))
        await db().from('mtmcopy_connections').update({ copyfactory_subscribed: !parou, last_error: parou ? null : `Pausa: a CopyFactory ainda tem ${restantes ?? '?'} subscrição(ões)`, updated_at: new Date().toISOString() }).eq('id', r.id)
        return { ok: parou, status: parou ? 200 : 502, mensagem: parou ? 'Pausada e confirmada na CopyFactory (0 subscrições).' : 'Marcada como pausada, mas a CopyFactory ainda mostra subscrições — tenta outra vez.' }
      }
      if (connectionCopyMethod(conn) !== 'strategy') return { ok: true, mensagem: 'Retomada (execução directa, sem CopyFactory).' }
      const s = await syncMtmStrategyReplication(conn, String(conn.account_label ?? ''))
      const cf = await getSubscriberConfiguration(accId)
      const n = cf.ok ? ((cf.data?.subscriptions as unknown[] | undefined) ?? []).length : 0
      await db().from('mtmcopy_connections').update({ copyfactory_subscribed: n > 0, last_error: s.ok ? null : s.error ?? null, updated_at: new Date().toISOString() }).eq('id', r.id)
      return { ok: s.ok && n > 0, status: s.ok && n > 0 ? 200 : 502, mensagem: s.ok && n > 0 ? `Retomada: ${n} subscrição(ões) confirmadas na CopyFactory.` : `Retomar falhou: ${s.error ?? 'sem subscrições depois de escrever'}` }
    }
    if (r.origem === 'auto') {
      await db().from('mtmauto_accounts').update({ copia_ativa: ativa }).eq('id', r.id)
      return { ok: true, mensagem: ativa ? 'Cópia MTM Auto retomada.' : 'Cópia MTM Auto pausada.' }
    }
    return { ok: false, status: 400, mensagem: 'Esta conta não tem pausa (WebTrader / MTM Funded).' }
  }

  if (acao === 'deploy' || acao === 'undeploy') {
    if (!metaApi || !accId) return { ok: false, status: 400, mensagem: 'Só contas MetaApi.' }
    if (String(opcoes.confirmacao ?? '') !== 'CONFIRMAR') return { ok: false, status: 400, mensagem: 'Confirma com «CONFIRMAR».' }
    if (r.origem === 'auto' && (await tokenMetaApiDoUtilizador(conta.userId, 'auto')) !== process.env.METAAPI_TOKEN) {
      return { ok: false, status: 400, mensagem: 'Conta de uma equipa MTM Auto (outra chave MetaApi): gere-se no admin do MTM Auto.' }
    }
    esquecerFotografiaMetaApi()
    if (acao === 'undeploy') {
      await undeployMetaApiAccount(accId)
      const token = process.env.METAAPI_TOKEN!
      const lida = await lerContaMetaApi(accId, token)
      return { ok: true, mensagem: `Undeploy pedido · MetaApi agora: ${lida?.state ?? '—'}. A cópia desta conta pára enquanto estiver desligada.` }
    }
    const x = await ligarContaMt5(accId)
    return { ok: true, mensagem: x.estado === 'ligada' ? 'Já estava ligada.' : 'Deploy pedido — demora cerca de 1 minuto a ligar.' }
  }

  if (acao === 'remover') {
    if (String(opcoes.confirmacao ?? '') !== 'REMOVER') return { ok: false, status: 400, mensagem: 'Confirma com «REMOVER».' }
    const token = await tokenMetaApiDoUtilizador(conta.userId, r.origem === 'auto' ? 'auto' : 'site')
    if (r.origem === 'wt') {
      const { removerContaWebtraderMt5 } = await import('@/lib/webtrader/entrar')
      const x = await removerContaWebtraderMt5(conta.userId, r.id)
      return { ok: true, mensagem: `Removida (MetaApi: ${x.metaapi}).` }
    }
    if (r.origem === 'funded') return { ok: false, status: 400, mensagem: 'Contas MTM Funded removem-se no painel MTM Funded.' }
    if (!metaApi) return { ok: false, status: 400, mensagem: 'TradeLocker/MTM Funded ligadas: o cliente remove-as em «As minhas contas» (o caminho apaga as credenciais cifradas).' }
    // Mesma ordem do caminho do cliente (/api/contas DELETE): parar a cópia, ver se a conta MetaApi é
    // partilhada, apagar com releitura, só depois a linha.
    let metaapi: 'apagada' | 'pendente' | 'partilhada' | 'sem_conta' = 'sem_conta'
    if (accId) {
      if (r.origem === 'site') {
        const u = await unsubscribeFromStrategy(accId)
        if (!u.ok) return { ok: false, status: 502, mensagem: 'Não foi possível parar a cópia desta conta na CopyFactory.' }
      }
      const [{ data: s }, { data: a }, { data: w }] = await Promise.all([
        db().from('mtmcopy_connections').select('id').eq('metaapi_account_id', accId).neq('mt5_status', 'disconnected').neq('id', r.origem === 'site' ? r.id : '00000000-0000-0000-0000-000000000000').limit(1),
        db().from('mtmauto_accounts').select('id').eq('metaapi_account_id', accId).neq('id', r.origem === 'auto' ? r.id : '00000000-0000-0000-0000-000000000000').limit(1),
        db().from('webtrader_contas_mt5').select('id').eq('metaapi_account_id', accId).limit(1),
      ])
      if ((s ?? []).length || (a ?? []).length || (w ?? []).length) metaapi = 'partilhada'
      else if (token) metaapi = (await apagarContaMetaApiConfirmado(accId, token)).ok ? 'apagada' : 'pendente'
    }
    if (r.origem === 'site') {
      await db().from('mtmcopy_connections').delete().eq('id', r.id)
      invalidateCopyConnectionsCache()
    } else {
      await db().from('mtmauto_subscriptions').update({ ativo: false, auto_aceitar: false, conta_id: null }).eq('conta_id', r.id)
      await db().from('mtmauto_accounts').delete().eq('id', r.id)
    }
    await db().from('copia_rotas').update({ ativa: false, pausada_motivo: 'conta removida' }).or(`origem_ref.eq.${ref},destino_ref.eq.${ref}`)
    esquecerFotografiaMetaApi()
    return { ok: true, mensagem: `Removida · MetaApi: ${metaapi}.` }
  }
  return { ok: false, status: 400, mensagem: 'Acção desconhecida.' }
}
