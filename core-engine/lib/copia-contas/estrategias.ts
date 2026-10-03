/**
 * ESTRATÉGIAS E SEGUIDORES — uma tabela por estratégia com quem a segue em cada plataforma
 * (subscritores CopyFactory, subscrições MTM Auto, contas MTM Funded que a espelham) e as
 * divergências que custam dinheiro. Puro e testado.
 */
import type { EstrategiaCfFoto, LinhaAutoFoto, ProviderFoto, SubscritorCfFoto } from './reconciliar'

export interface LinhaSiteSeguidor {
  id: string
  user_id: string
  metaapi_account_id?: string | null
  mt5_login?: string | null
  mt5_server?: string | null
  mt5_platform?: string | null
  mt5_status?: string | null
  is_active?: boolean | null
  purpose?: string | null
  copy_method?: string | null
  copyfactory_strategy_pick?: string | null
  copyfactory_subscribed?: boolean | null
  strategy_lots?: Record<string, number> | null
  lot_mode?: string | null
  lot_value?: number | null
  max_risk_percent?: number | null
  account_label?: string | null
}

export interface SubAutoSeguidor {
  id: string
  user_id: string
  conta_id?: string | null
  provider_id: string
  ativo?: boolean | null
  modo_risco?: string | null
  risco_pct?: number | null
  lote_fixo?: number | null
  multiplicador?: number | null
}

export interface ContaFundedSeguidora { id: string; user_id: string; segue_estrategia: string; estado?: string | null; mt5_login?: string | null }

export type FlagDivergencia = 'devia_copiar_nao_copia' | 'copia_estrategia_morta' | 'pausada_mas_copia' | 'conta_auto_parada' | 'sem_estrategia_cf' | 'copia_cortada'

export const TEXTO_FLAG: Record<FlagDivergencia, string> = {
  devia_copiar_nao_copia: 'devia copiar e não está subscrita na CopyFactory',
  copia_estrategia_morta: 'subscrita a uma estratégia que já não existe',
  pausada_mas_copia: 'pausada no site mas ainda subscrita na CopyFactory',
  conta_auto_parada: 'subscrição activa numa conta MTM Auto parada ou em erro',
  sem_estrategia_cf: 'estratégia sem estratégia CopyFactory viva',
  copia_cortada: 'ainda subscrita na CopyFactory a uma estratégia cortada (o motor das mestres já a serve: ordens em dobro)',
}

export interface Seguidor {
  plataforma: 'copyfactory' | 'mtmauto' | 'mtmfunded'
  ref: string
  userId: string
  conta: string
  risco: string
  estado: string
  flags: FlagDivergencia[]
  /** ligação do site que o re-sync CopyFactory pode reparar */
  reparavelSiteId?: string
}

export interface LinhaEstrategia {
  chave: string
  nome: string
  slug: string | null
  strategyId: string | null
  accountId: string | null
  viva: boolean
  seguidores: Seguidor[]
  flags: FlagDivergencia[]
  /** CopyFactory cortada: quem executa é o motor das mestres (116) */
  servidaPeloMotor?: boolean
}

const riscoSite = (l: LinhaSiteSeguidor, sid: string) => {
  const fixo = l.strategy_lots?.[sid]
  if (fixo != null) return `fixo ${fixo}`
  if (l.lot_mode === 'fixed') return `fixo ${l.lot_value ?? '?'}`
  if (l.lot_mode === 'multiplier') return `× ${l.lot_value ?? '?'}${l.max_risk_percent ? ` (máx ${l.max_risk_percent}%)` : ''}`
  if (l.lot_mode === 'risk_percent') return `${l.lot_value ?? l.max_risk_percent ?? '?'}% risco`
  return l.lot_mode ?? '—'
}
const riscoAuto = (s: SubAutoSeguidor) =>
  s.modo_risco === 'fixo' || (s.lote_fixo != null && s.modo_risco !== 'pct')
    ? `fixo ${s.lote_fixo ?? '?'}`
    : s.multiplicador != null && s.modo_risco === 'multiplicador'
      ? `× ${s.multiplicador}`
      : `${s.risco_pct ?? '?'}% risco`

/** Estratégias que uma ligação do site pede à CopyFactory. */
export function estrategiasPedidas(l: LinhaSiteSeguidor): string[] {
  if (l.purpose === 'tap_to_trade') return []
  const lots = l.strategy_lots && typeof l.strategy_lots === 'object' ? Object.keys(l.strategy_lots) : []
  if (lots.length) return lots
  return l.copyfactory_strategy_pick ? [String(l.copyfactory_strategy_pick)] : []
}

export function montarEstrategias(f: {
  estrategiasCf: EstrategiaCfFoto[] | null
  subscritoresCf: SubscritorCfFoto[] | null
  providers: (ProviderFoto & { nome?: string | null })[]
  site: LinhaSiteSeguidor[]
  auto: LinhaAutoFoto[]
  subsAuto: SubAutoSeguidor[]
  funded: ContaFundedSeguidora[]
  /** conta (mtmauto_accounts) parada? copia_ativa=false ou estado=error */
  contaAutoParada?: (id: string) => boolean
  /**
   * Motor das mestres (116): ids CopyFactory CORTADOS (servidos pelo motor) e slugs das estratégias que
   * estão no motor. Uma ligação que pede um id cortado não «devia copiar» na CopyFactory; uma que
   * ainda lá está subscrita copia em dobro; uma estratégia do motor sem CopyFactory não é divergência.
   */
  motor?: { idsCortados: Set<string>; slugs: Set<string>; slugsLive: Set<string> }
}): LinhaEstrategia[] {
  const cortado = (sid: string) => f.motor?.idsCortados.has(sid) === true
  const doMotor = (slug: string | null | undefined) => Boolean(slug && f.motor?.slugs.has(String(slug).toLowerCase()))
  const liveNoMotor = (slug: string | null | undefined) => Boolean(slug && f.motor?.slugsLive.has(String(slug).toLowerCase()))
  const cfListada = f.estrategiasCf != null
  const estrategias = new Map((f.estrategiasCf ?? []).map((s) => [s.id, s]))
  const subsCf = new Map((f.subscritoresCf ?? []).map((s) => [s.id, new Set(s.subscriptions.map((x) => x.strategyId))]))
  const linhas = new Map<string, LinhaEstrategia>()

  const obter = (strategyId: string | null, provider?: ProviderFoto & { nome?: string | null }): LinhaEstrategia => {
    const acc = strategyId ? estrategias.get(strategyId)?.accountId ?? null : provider?.metaapi_account_id ?? null
    const chave = strategyId ? `cf:${strategyId}` : `prov:${provider?.id}`
    let l = linhas.get(chave)
    if (!l) {
      const prov = provider ?? f.providers.find((p) => p.metaapi_account_id && p.metaapi_account_id === acc)
      l = {
        chave, nome: prov?.nome ?? (strategyId ? estrategias.get(strategyId)?.name ?? strategyId : prov?.slug ?? '—'),
        slug: prov?.slug ?? null, strategyId, accountId: acc ?? null,
        viva: strategyId ? estrategias.has(strategyId) || !cfListada : true, seguidores: [], flags: [],
      }
      linhas.set(chave, l)
    }
    return l
  }

  const inactivasSemCf = new Set<string>()
  for (const s of estrategias.values()) obter(s.id)
  for (const p of f.providers) {
    const s = [...estrategias.values()].find((x) => x.accountId && x.accountId === p.metaapi_account_id)
    const l = obter(s?.id ?? null, p)
    // Estratégia inactiva sem CopyFactory e sem ninguém a segui-la (ex.: Gold Did, abandonado): não aparece.
    if (!s && p.ativo === false) inactivasSemCf.add(l.chave)
    if (!s && cfListada && p.ativo !== false && !doMotor(p.slug)) l.flags.push('sem_estrategia_cf')
  }

  for (const c of f.site) {
    if (String(c.mt5_status ?? '').toLowerCase() === 'disconnected') continue
    const pedidas = estrategiasPedidas(c)
    const subscritas = c.metaapi_account_id ? subsCf.get(String(c.metaapi_account_id)) ?? new Set<string>() : new Set<string>()
    const ativa = c.is_active !== false
    for (const sid of new Set([...pedidas, ...subscritas])) {
      const l = obter(sid)
      const flags: FlagDivergencia[] = []
      if (cortado(sid) || doMotor(sid)) {
        if (cortado(sid) || liveNoMotor(sid)) l.servidaPeloMotor = true
        if (cfListada && f.subscritoresCf && subscritas.has(sid)) flags.push('copia_cortada')
      } else if (cfListada && f.subscritoresCf) {
        if (ativa && pedidas.includes(sid) && !subscritas.has(sid)) flags.push('devia_copiar_nao_copia')
        if (!ativa && subscritas.has(sid)) flags.push('pausada_mas_copia')
        if (!estrategias.has(sid) && (subscritas.has(sid) || pedidas.includes(sid))) flags.push('copia_estrategia_morta')
      }
      l.seguidores.push({
        plataforma: 'copyfactory', ref: `site:${c.id}`, userId: c.user_id,
        conta: `${c.account_label ? `${c.account_label} · ` : ''}${c.mt5_login ?? '?'} @ ${c.mt5_server ?? '?'}`,
        risco: riscoSite(c, sid), estado: ativa ? (subscritas.has(sid) ? 'a copiar' : 'activa') : 'pausada', flags,
        reparavelSiteId: flags.some((x) => x === 'devia_copiar_nao_copia' || x === 'pausada_mas_copia' || x === 'copia_estrategia_morta' || x === 'copia_cortada') ? c.id : undefined,
      })
    }
  }

  const contasAuto = new Map(f.auto.map((a) => [a.id, a]))
  for (const s of f.subsAuto) {
    const p = f.providers.find((x) => x.id === s.provider_id)
    const est = p ? [...estrategias.values()].find((x) => x.accountId && x.accountId === p.metaapi_account_id) : undefined
    const l = obter(est?.id ?? null, p ?? { id: s.provider_id, slug: s.provider_id })
    const conta = s.conta_id ? contasAuto.get(s.conta_id) : undefined
    const flags: FlagDivergencia[] = []
    if (s.ativo !== false && s.conta_id && f.contaAutoParada?.(s.conta_id)) flags.push('conta_auto_parada')
    l.seguidores.push({
      plataforma: 'mtmauto', ref: `autosub:${s.id}`, userId: s.user_id,
      conta: conta ? `${conta.login ?? '?'} @ ${conta.servidor ?? '?'} (${conta.plataforma ?? 'mt5'})` : 'conta principal',
      risco: riscoAuto(s), estado: s.ativo === false ? 'inactiva' : 'activa', flags,
    })
  }

  for (const c of f.funded) {
    const p = f.providers.find((x) => x.slug === c.segue_estrategia)
    const est = p ? [...estrategias.values()].find((x) => x.accountId && x.accountId === p.metaapi_account_id) : undefined
    const l = obter(est?.id ?? null, p ?? { id: `slug:${c.segue_estrategia}`, slug: c.segue_estrategia })
    l.seguidores.push({
      plataforma: 'mtmfunded', ref: `funded:${c.id}`, userId: c.user_id, conta: `MTM Funded ${c.mt5_login ?? c.id.slice(0, 8)}`,
      risco: 'proporcional ao saldo', estado: c.estado ?? '—', flags: [],
    })
  }

  for (const l of linhas.values()) {
    if (liveNoMotor(l.slug) || (l.strategyId && cortado(l.strategyId))) l.servidaPeloMotor = true
    for (const s of l.seguidores) for (const x of s.flags) if (!l.flags.includes(x)) l.flags.push(x)
  }
  return [...linhas.values()]
    .filter((l) => l.seguidores.length || (l.viva && !inactivasSemCf.has(l.chave)))
    .sort((a, b) => b.flags.length - a.flags.length || b.seguidores.length - a.seguidores.length || a.nome.localeCompare(b.nome))
}
