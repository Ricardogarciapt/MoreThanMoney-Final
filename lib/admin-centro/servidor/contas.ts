import { ehContaMetaApi } from '@/lib/contas/quota-metaapi'
import { CONTAS_MOTOR_TEMPO_REAL } from '@/lib/mtmcopy/provider-constants'
import { direitosEmLote } from '@/lib/copia-contas/servidor/direitos-lote'
import { emCache } from '../cache'
import { erroActual } from '../regras'
import { CONTAS_METAAPI_APAGADAS } from '@/lib/mtmcopy/metaapi-inexistentes'
import { ehErroDeQuotaTexto } from '@/lib/mtmcopy/erro-historico'
import { carregarInfra } from './infra'
import { lerProviders } from './sinais'
import { db, ler, num, txt, type Linha } from './base'

/**
 * CONTAS — todas as contas numa lista (MT4/MT5/TradeLocker/MTM Funded; cliente, casa, seguidoras,
 * equipas), SEM MetaApi: o estado MetaApi vem do que está gravado (mt5_status/estado), da fotografia
 * de streaming e do registo de contas inexistentes.
 *
 * Consultas (cache 30 s): 4 tabelas de contas + subscrições MTM Auto + rotas de cópia + perfis em lote.
 * O painel antigo (/api/admin/mtmauto-copia/contas) fazia o mesmo mais a listagem MetaApi.
 */

export interface ContaCentro {
  ref: string
  origem: 'site' | 'auto' | 'wt' | 'funded'
  plataforma: 'mt4' | 'mt5' | 'tradelocker' | 'mtmfunded'
  categoria: 'cliente' | 'casa' | 'seguidora' | 'equipa' | 'mestre'
  userId: string | null
  email: string | null
  nome: string | null
  plano: string
  motivoDireito: string
  temMtmAuto: boolean
  rotulo: string | null
  login: string | null
  servidor: string | null
  estado: string
  ativa: boolean
  demo: boolean
  erro: string | null
  erroEstado: 'actual' | 'velho' | null
  metaapiAccountId: string | null
  metaapi: { guardado: string | null; streaming: 'fresco' | 'velho' | null; inexistente: boolean; motorTempoReal: boolean }
  contaMetaApi: boolean
  quota: { emUso: number; limite: number | null; acima: boolean }
  usos: string[]
  estrategias: string[]
  saldo: number | null
  equity: number | null
  ultimaActividade: string | null
  criadaEm: string | null
  atualizadaEm: string | null
}

const plat = (v: unknown): ContaCentro['plataforma'] => {
  const p = String(v ?? 'mt5').toLowerCase()
  return p === 'mt4' || p === 'tradelocker' || p === 'mtmfunded' ? p : 'mt5'
}
const demoPeloNome = (s: unknown) => /\b(demo|trial|practice|paper|contest)\b/i.test(String(s ?? ''))

export async function carregarContas(): Promise<{ contas: ContaCentro[]; avisos: string[]; lidaEm: string }> {
  const r = await emCache('centro:contas', 30_000, lerContas)
  return { ...r.v, avisos: r.velho ? [...r.v.avisos, 'leitura nova falhou — a mostrar a última boa'] : r.v.avisos }
}

async function lerContas(): Promise<{ contas: ContaCentro[]; avisos: string[]; lidaEm: string }> {
  const avisos: string[] = []
  const agora = Date.now()
  const [site, auto, wt, funded, subs, rotas, tenants, providers, infra] = await Promise.all([
    ler(db().from('mtmcopy_connections').select('id, user_id, account_label, mt5_login, mt5_server, mt5_platform, mt5_status, is_active, last_error, last_signal_at, metaapi_account_id, purpose, t2t_enabled, account_role, copyfactory_strategy_pick, copyfactory_subscribed, copy_method, balance, tl_env, tl_acc_num, tl_server, tl_last_error, funded_account_id, created_at, updated_at').neq('mt5_status', 'disconnected').limit(3000)),
    ler(db().from('mtmauto_accounts').select('id, user_id, metaapi_account_id, login, servidor, corretora, plataforma, estado, erro, tl_last_error, copia_ativa, rotulo, demo, saldo_maximo, saldo_visto_em, funded_account_id, created_at, updated_at').limit(3000)),
    ler(db().from('webtrader_contas_mt5').select('id, user_id, metaapi_account_id, plataforma, login, servidor, rotulo, estado, erro, created_at, updated_at').limit(3000)),
    lerFunded(),
    ler(db().from('mtmauto_subscriptions').select('conta_id, provider_id, user_id, auto_aceitar').eq('ativo', true).limit(5000)),
    ler(db().from('copia_rotas').select('origem_ref, destino_ref, estado, ativa, modo').neq('estado', 'recusada').limit(2000)),
    ler(db().from('mtmauto_users').select('user_id, tenant_id').not('tenant_id', 'is', null).limit(3000)),
    lerProviders(),
    carregarInfra(),
  ])
  for (const [n, x] of [['T2T/site', site], ['MTM Auto', auto], ['MTM Funded', funded]] as const) if (x.erro) avisos.push(`${n}: ${x.erro}`)
  if (wt.semTabela) avisos.push('WebTrader MT5 (076) por aplicar')

  const nomeProv = new Map(providers.map((p) => [String(p.id), String(p.nome ?? p.slug ?? '—')]))
  const contasProvider = new Set(providers.map((p) => txt(p.metaapi_account_id)).filter(Boolean) as string[])
  const equipa = new Set(tenants.linhas.map((t) => String(t.user_id)))
  const inexistentes = new Set([...CONTAS_METAAPI_APAGADAS, ...infra.fantasmas.contas.map((f) => f.conta)])
  const snap = new Map(infra.streaming.map((s) => [s.conta, s]))
  const usosRota = new Map<string, string[]>()
  for (const x of rotas.linhas) {
    const modo = x.modo === 'live' ? 'LIVE' : 'sombra'
    usosRota.set(String(x.origem_ref), [...(usosRota.get(String(x.origem_ref)) ?? []), `Origem de cópia (${modo})`])
    usosRota.set(String(x.destino_ref), [...(usosRota.get(String(x.destino_ref)) ?? []), `Destino de cópia (${modo})`])
  }
  const estrategiasConta = new Map<string, string[]>()
  for (const s of subs.linhas) if (s.conta_id) estrategiasConta.set(String(s.conta_id), [...(estrategiasConta.get(String(s.conta_id)) ?? []), `${nomeProv.get(String(s.provider_id)) ?? '—'}${s.auto_aceitar ? ' · auto' : ''}`])

  const metaapi = (id: string | null, guardado: string | null) => {
    const s = id ? snap.get(id) : undefined
    return {
      guardado,
      streaming: s ? ((s.idadeS ?? 9e9) < 120 && s.sincronizado ? 'fresco' as const : 'velho' as const) : null,
      inexistente: id ? inexistentes.has(id) : false,
      motorTempoReal: id ? CONTAS_MOTOR_TEMPO_REAL.includes(id) : false,
    }
  }

  const base: Omit<ContaCentro, 'email' | 'nome' | 'plano' | 'motivoDireito' | 'temMtmAuto' | 'quota'>[] = []
  for (const c of site.linhas) {
    const plataforma = plat(c.mt5_platform)
    const acc = txt(c.metaapi_account_id)
    const usos: string[] = []
    if (c.purpose === 'tap_to_trade' || c.t2t_enabled === true) usos.push('Tap to Trade')
    if (c.purpose !== 'tap_to_trade' && plataforma !== 'mtmfunded') usos.push(c.copyfactory_strategy_pick ? `CopyFactory ${c.copyfactory_strategy_pick}${c.copyfactory_subscribed ? '' : ' (não subscrita)'}` : `Cópia (${c.copy_method ?? '—'})`)
    usos.push(...(usosRota.get(`site:${c.id}`) ?? []))
    const erro = txt(c.last_error) ?? txt(c.tl_last_error)
    base.push({
      ref: `site:${c.id}`, origem: 'site', plataforma,
      categoria: c.account_role === 'master' || (acc && contasProvider.has(acc)) ? 'mestre' : 'cliente',
      userId: txt(c.user_id), rotulo: txt(c.account_label),
      login: plataforma === 'tradelocker' ? txt(c.tl_acc_num) : txt(c.mt5_login), servidor: plataforma === 'tradelocker' ? txt(c.tl_server) ?? txt(c.mt5_server) : txt(c.mt5_server),
      estado: String(c.mt5_status ?? '—'), ativa: c.is_active !== false, demo: plataforma === 'tradelocker' ? c.tl_env === 'demo' : demoPeloNome(c.mt5_server),
      erro, erroEstado: erro && ehErroDeQuotaTexto(erro) && c.last_signal_at && Date.parse(String(c.last_signal_at)) > Date.parse(String(c.updated_at ?? 0)) ? 'velho' : erroActual(erro, txt(c.updated_at), agora),
      metaapiAccountId: acc, metaapi: metaapi(acc, txt(c.mt5_status)),
      contaMetaApi: ehContaMetaApi({ metaapi_account_id: acc, login: txt(c.mt5_login), plataforma, estado: txt(c.mt5_status) }),
      usos, estrategias: c.copyfactory_strategy_pick ? [String(c.copyfactory_strategy_pick)] : [],
      saldo: num(c.balance), equity: null, ultimaActividade: txt(c.last_signal_at), criadaEm: txt(c.created_at), atualizadaEm: txt(c.updated_at),
    })
  }
  for (const c of auto.linhas) {
    const plataforma = plat(c.plataforma)
    const acc = txt(c.metaapi_account_id)
    const erro = txt(c.erro) ?? txt(c.tl_last_error)
    base.push({
      ref: `auto:${c.id}`, origem: 'auto', plataforma, categoria: equipa.has(String(c.user_id)) ? 'equipa' : acc && contasProvider.has(acc) ? 'mestre' : 'cliente',
      userId: txt(c.user_id), rotulo: txt(c.rotulo) ?? txt(c.corretora), login: txt(c.login), servidor: txt(c.servidor),
      estado: String(c.estado ?? '—'), ativa: c.copia_ativa !== false, demo: Boolean(c.demo), erro, erroEstado: erroActual(erro, txt(c.updated_at), agora),
      metaapiAccountId: acc, metaapi: metaapi(acc, txt(c.estado)),
      contaMetaApi: ehContaMetaApi({ metaapi_account_id: acc, login: txt(c.login), plataforma, estado: txt(c.estado) }),
      usos: ['MTM Auto', ...(usosRota.get(`auto:${c.id}`) ?? [])], estrategias: estrategiasConta.get(String(c.id)) ?? [],
      saldo: num(c.saldo_maximo), equity: null, ultimaActividade: txt(c.saldo_visto_em), criadaEm: txt(c.created_at), atualizadaEm: txt(c.updated_at),
    })
  }
  for (const c of wt.linhas) {
    const acc = txt(c.metaapi_account_id)
    const plataforma = c.plataforma === 'mt4' ? 'mt4' : 'mt5'
    base.push({
      ref: `wt:${c.id}`, origem: 'wt', plataforma, categoria: 'cliente', userId: txt(c.user_id), rotulo: txt(c.rotulo), login: txt(c.login), servidor: txt(c.servidor),
      estado: String(c.estado ?? '—'), ativa: true, demo: demoPeloNome(c.servidor), erro: txt(c.erro), erroEstado: erroActual(txt(c.erro), txt(c.updated_at), agora),
      metaapiAccountId: acc, metaapi: metaapi(acc, txt(c.estado)),
      contaMetaApi: ehContaMetaApi({ metaapi_account_id: acc, login: txt(c.login), plataforma, estado: txt(c.estado) }),
      usos: ['WebTrader', ...(usosRota.get(`wt:${c.id}`) ?? [])], estrategias: [], saldo: null, equity: null, ultimaActividade: null, criadaEm: txt(c.created_at), atualizadaEm: txt(c.updated_at),
    })
  }
  for (const f of funded.linhas) {
    // A conta real da casa (109) é da casa mesmo sem `conta_casa` (a de T2T do dono).
    const real = f.conta_real_casa === true
    const casa = f.conta_casa === true || real
    base.push({
      ref: `funded:${f.id}`, origem: 'funded', plataforma: 'mtmfunded', categoria: casa ? 'casa' : f.segue_estrategia ? 'seguidora' : 'cliente',
      userId: txt(f.user_id), rotulo: [real ? 'Casa · real' : casa ? 'Casa' : null, txt(f.tipo), f.recolhe_todos_sinais === true ? 'todos os sinais' : null].filter(Boolean).join(' · ') || 'MTM Funded',
      login: txt(f.mt5_login), servidor: txt(f.servidor) ?? 'MTM Funded', estado: String(f.estado ?? '—'), ativa: f.estado === 'ativa', demo: false,
      erro: txt(f.quebrou_regra), erroEstado: f.quebrou_regra ? 'actual' : null, metaapiAccountId: txt(f.metaapi_account_id),
      metaapi: metaapi(txt(f.metaapi_account_id), f.motor === 'sim' ? 'simulada' : null), contaMetaApi: false,
      usos: [f.motor === 'sim' ? 'Simulada' : 'MT5', ...(f.segue_estrategia ? [`Segue ${f.segue_estrategia}`] : []), ...(f.aceita_t2t ? ['Aceita T2T'] : []), ...(usosRota.get(`funded:${f.id}`) ?? [])],
      estrategias: f.segue_estrategia ? [String(f.segue_estrategia)] : [], saldo: num(f.sim_saldo), equity: num(f.sim_equity),
      ultimaActividade: txt(f.sim_ultimo_dia), criadaEm: txt(f.created_at), atualizadaEm: txt(f.updated_at),
    })
  }

  const ids = [...new Set(base.map((c) => c.userId).filter((x): x is string => Boolean(x)))]
  const direitos = await direitosEmLote(ids)
  const uso = new Map<string, Set<string>>()
  for (const c of base) {
    if (!c.contaMetaApi || !c.userId) continue
    uso.set(c.userId, (uso.get(c.userId) ?? new Set<string>()).add(c.metaapiAccountId ?? `${c.login}@${String(c.servidor ?? '').toLowerCase()}`))
  }
  const contas: ContaCentro[] = base.map((c) => {
    const d = c.userId ? direitos.get(c.userId) : undefined
    const emUso = c.userId ? uso.get(c.userId)?.size ?? 0 : 0
    const limite = d && Number.isFinite(d.quotaBase.limite) ? d.quotaBase.limite : null
    return { ...c, email: d?.email ?? null, nome: d?.nome ?? null, plano: d?.plano ?? '—', motivoDireito: d?.motivo ?? '—', temMtmAuto: d?.temMtmAuto ?? false, quota: { emUso, limite, acima: limite != null && emUso > limite } }
  })
  return { contas, avisos, lidaEm: new Date().toISOString() }
}

/** Contas MTM Funded (simuladas e MT5) — tenta com as colunas da 084 (conta_casa…), cai sem elas. */
async function lerFunded() {
  const cols = 'id, user_id, tipo, mt5_login, servidor, estado, motor, quebrou_regra, metaapi_account_id, sim_saldo, sim_equity, sim_ultimo_dia, segue_estrategia, aceita_t2t, created_at, updated_at'
  // 109 (`conta_real_casa`) primeiro; sem ela, como antes — a conta real da casa só não se distingue.
  const real = await ler(db().from('mtm_trading_accounts').select(`${cols}, conta_casa, recolhe_todos_sinais, conta_real_casa`).order('created_at', { ascending: false }).limit(3000))
  if (!real.semTabela) return real
  const com = await ler(db().from('mtm_trading_accounts').select(`${cols}, conta_casa, recolhe_todos_sinais`).order('created_at', { ascending: false }).limit(3000))
  if (!com.semTabela) return com
  return ler(db().from('mtm_trading_accounts').select(cols).order('created_at', { ascending: false }).limit(3000))
}

export type { Linha }
