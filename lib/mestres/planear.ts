/**
 * QUEM SEGUE CADA ESTRATÉGIA — as rotas do motor (copia_rotas com `mestres=true`) que devem existir,
 * calculadas a partir do que os clientes escolheram. Puro e testado (__tests__/mestres.check.ts); o
 * script scripts/mestres/sincronizar-rotas.ts lê a base, chama isto e escreve (em seco por omissão).
 *
 * Seguidores:
 *  · Site (mtmcopy_connections): a ligação que hoje copia a estratégia pela CopyFactory
 *    (`copyfactory_strategy_pick` ou chave de `strategy_lots` ∈ ids CopyFactory da estratégia) — a
 *    MESMA escolha passa a ser servida pelo motor. Contas só de T2T (`purpose='tap_to_trade'`) não
 *    seguem por cópia (a não ser que tenham estratégia escolhida — caso Cayo/Pedro).
 *  · MTM Auto (mtmauto_subscriptions ativo + auto_aceitar) — só com `incluir_mtmauto` na estratégia.
 *    Conta: a da subscrição, senão a principal, senão a primeira que não é MTM Funded (a mesma ordem
 *    do executor do mtm-auto).
 *  · Contas MTM Funded (simuladas) NUNCA são destino: seguem pelo espelho do motor simulado.
 *
 * A origem é sempre `prov:<provider>` com a chave física da MESTRE SIM (`mtmfunded:<conta>`), que é a
 * chave que o trigger 083 procura — e dá o fan-out de 2000 das estratégias.
 *
 * Pausas: uma conta pausada pelo cliente (site `is_active=false`, MTM Auto `copia_ativa=false` ou
 * subscrição inactiva) mantém a rota ACTIVA com `pausada_motivo` — deixa de abrir, mas o que está
 * aberto continua a ser gerido até fechar.
 */
import { chaveFisica } from '../copia-contas/regras'
import type { PlataformaCopia } from '../copia-contas/tipos'
import { loteDaLigacaoSite, loteDaSubscricaoAuto, type ContaAuto, type LigacaoSite, type LoteDaRota, type SubscricaoAuto } from './lote'

export interface EstrategiaParaPlanear {
  providerId: string
  slug: string
  nome: string
  contaMestreId: string
  copyfactoryIds: string[]
  incluirMtmauto: boolean
}

export type LigacaoSiteSeguidora = LigacaoSite & {
  id: string
  user_id: string
  is_active?: boolean | null
  purpose?: string | null
  copy_method?: string | null
  copyfactory_strategy_pick?: string | null
  mt5_platform?: string | null
  mt5_login?: string | null
  mt5_server?: string | null
  mt5_status?: string | null
  metaapi_account_id?: string | null
  tl_env?: string | null
  tl_account_id?: string | null
  funded_account_id?: string | null
  funded_somente_leitura?: boolean | null
}

export type ContaAutoSeguidora = ContaAuto & {
  id: string
  user_id: string
  plataforma?: string | null
  login?: string | null
  servidor?: string | null
  tl_env?: string | null
  tl_account_id?: string | null
  principal?: boolean | null
  copia_ativa?: boolean | null
  estado?: string | null
  funded_account_id?: string | null
  funded_somente_leitura?: boolean | null
}

export type SubscricaoAutoSeguidora = SubscricaoAuto & {
  id: string
  user_id: string
  provider_id: string
  ativo?: boolean | null
  auto_aceitar?: boolean | null
  conta_id?: string | null
}

export interface RotaDesejada {
  user_id: string
  origem_tipo: 'mtmfunded'
  origem_ref: string
  origem_chave: string
  destino_tipo: PlataformaCopia
  destino_ref: string
  destino_chave: string
  rotulo: string
  modo_lote: LoteDaRota['modo_lote']
  valor: number
  lote_max: number | null
  copiar_sl: boolean
  copiar_tp: boolean
  filtro_simbolos: string[]
  max_abertas: number | null
  pausada_motivo: string | null
  mestres: true
  tipo_rota: 'estrategia'
  estrategia_slug: string
  notas: string
}

export interface Ignorado { ref: string; motivo: string }

const plataformaSite = (l: LigacaoSiteSeguidora): PlataformaCopia | null => {
  const p = String(l.mt5_platform ?? 'mt5').toLowerCase()
  if (p === 'mtmfunded' || l.funded_account_id) return null
  if (l.tl_account_id) return 'tradelocker'
  return p === 'mt4' ? 'mt4' : 'mt5'
}

const plataformaAuto = (c: ContaAutoSeguidora): PlataformaCopia | null => {
  const p = String(c.plataforma ?? 'mt5').toLowerCase()
  if (p === 'mtmfunded' || c.funded_account_id) return null
  if (p === 'tradelocker') return 'tradelocker'
  return p === 'mt4' ? 'mt4' : 'mt5'
}

export function ligacaoSegueEstrategia(l: LigacaoSiteSeguidora, ids: string[], slug?: string | null): boolean {
  // `strategy_lots` também aceita o SLUG da estratégia do motor (ex.: {"mtm-auto-edge": true}) — é
  // assim que uma ligação do site segue uma estratégia que não tem código na CopyFactory (Edge/King/Wolf).
  // Valor numérico = lote fixo; `true` = risco % da ligação (lot_mode/lot_value).
  const chaves = slug ? [...ids, slug] : ids
  if (!chaves.length) return false
  const lots = l.strategy_lots && typeof l.strategy_lots === 'object' ? Object.keys(l.strategy_lots) : []
  if (lots.length) return lots.some((k) => chaves.some((c) => c.toLowerCase() === k.toLowerCase()))
  if (!ids.length) return false
  return String(l.copy_method ?? '') === 'strategy' && Boolean(l.copyfactory_strategy_pick) && ids.includes(String(l.copyfactory_strategy_pick))
}

export function contaDaSubscricao(s: SubscricaoAutoSeguidora, contasDoUser: ContaAutoSeguidora[]): ContaAutoSeguidora | null {
  if (s.conta_id) return contasDoUser.find((c) => c.id === s.conta_id) ?? null
  const reais = contasDoUser.filter((c) => plataformaAuto(c) != null)
  return reais.find((c) => c.principal === true) ?? reais[0] ?? null
}

export function planearRotasDaEstrategia(p: {
  estrategia: EstrategiaParaPlanear
  site: LigacaoSiteSeguidora[]
  subsAuto: SubscricaoAutoSeguidora[]
  contasAuto: ContaAutoSeguidora[]
  /** conta_chave → lote fixo forçado (mestres_contas) */
  lotesForcados?: Record<string, number>
}): { rotas: RotaDesejada[]; ignorados: Ignorado[] } {
  const e = p.estrategia
  const origemChave = `mtmfunded:${e.contaMestreId.toLowerCase()}`
  const rotas: RotaDesejada[] = []
  const ignorados: Ignorado[] = []
  const vistas = new Set<string>()
  const base = {
    origem_tipo: 'mtmfunded' as const, origem_ref: `prov:${e.providerId}`, origem_chave: origemChave,
    mestres: true as const, tipo_rota: 'estrategia' as const, estrategia_slug: e.slug,
  }

  for (const l of p.site) {
    if (!ligacaoSegueEstrategia(l, e.copyfactoryIds, e.slug)) continue
    const ref = `site:${l.id}`
    const plataforma = plataformaSite(l)
    if (!plataforma) { ignorados.push({ ref, motivo: 'conta MTM Funded (segue pelo espelho simulado)' }); continue }
    if (l.mt5_status === 'disconnected') { ignorados.push({ ref, motivo: 'ligação desligada' }); continue }
    if (l.funded_somente_leitura) { ignorados.push({ ref, motivo: 'só leitura' }); continue }
    const chave = chaveFisica({ plataforma, login: l.mt5_login, servidor: l.mt5_server, tlEnv: l.tl_env, tlAccountId: l.tl_account_id, ref })
    if (!chave) { ignorados.push({ ref, motivo: 'sem identidade física (login/servidor)' }); continue }
    if (vistas.has(chave)) { ignorados.push({ ref, motivo: 'a mesma conta física já segue esta estratégia por outra ligação' }); continue }
    const lote = loteDaLigacaoSite(l, { idsCopyFactory: [...e.copyfactoryIds, e.slug], loteFixoForcado: p.lotesForcados?.[chave] ?? null })
    if (!lote.ok) { ignorados.push({ ref, motivo: lote.motivo }); continue }
    vistas.add(chave)
    rotas.push({
      ...base, user_id: l.user_id, destino_tipo: plataforma, destino_ref: ref, destino_chave: chave,
      rotulo: `${e.nome} → ${ref.slice(0, 13)}`, ...semOrigem(lote.lote),
      pausada_motivo: l.is_active === false ? 'ligação pausada pelo cliente' : null,
      notas: `mestres 116 · ${lote.lote.origem}`,
    })
  }

  if (e.incluirMtmauto) {
    const porUser = new Map<string, ContaAutoSeguidora[]>()
    for (const c of p.contasAuto) porUser.set(c.user_id, [...(porUser.get(c.user_id) ?? []), c])
    for (const s of p.subsAuto) {
      if (s.provider_id !== e.providerId || s.auto_aceitar !== true) continue
      const conta = contaDaSubscricao(s, porUser.get(s.user_id) ?? [])
      const refSub = `sub:${s.id}`
      if (!conta) { ignorados.push({ ref: refSub, motivo: 'subscrição sem conta real' }); continue }
      const ref = `auto:${conta.id}`
      const plataforma = plataformaAuto(conta)
      if (!plataforma) { ignorados.push({ ref, motivo: 'conta MTM Funded (segue pelo espelho simulado)' }); continue }
      if (conta.funded_somente_leitura) { ignorados.push({ ref, motivo: 'só leitura' }); continue }
      const chave = chaveFisica({ plataforma, login: conta.login, servidor: conta.servidor, tlEnv: conta.tl_env, tlAccountId: conta.tl_account_id, ref })
      if (!chave) { ignorados.push({ ref, motivo: 'sem identidade física (login/servidor)' }); continue }
      if (vistas.has(chave)) { ignorados.push({ ref, motivo: 'a mesma conta física já segue esta estratégia (site ou outra subscrição)' }); continue }
      const lote = loteDaSubscricaoAuto(s, conta, { loteFixoForcado: p.lotesForcados?.[chave] ?? null })
      if (!lote.ok) { ignorados.push({ ref, motivo: lote.motivo }); continue }
      vistas.add(chave)
      const pausa = s.ativo === false ? 'subscrição inactiva' : conta.copia_ativa === false ? 'cópia pausada na conta MTM Auto' : String(conta.estado ?? '').toLowerCase() === 'error' ? 'conta MTM Auto em erro' : null
      rotas.push({
        ...base, user_id: s.user_id, destino_tipo: plataforma, destino_ref: ref, destino_chave: chave,
        rotulo: `${e.nome} → ${ref.slice(0, 13)}`, ...semOrigem(lote.lote), pausada_motivo: pausa,
        notas: `mestres 116 · ${lote.lote.origem}`,
      })
    }
  }
  return { rotas, ignorados }
}

function semOrigem(l: LoteDaRota): Omit<LoteDaRota, 'origem'> {
  const { origem: _o, ...resto } = l
  void _o
  return resto
}

export interface RotaExistente {
  id: string
  destino_chave: string
  destino_ref: string
  ativa: boolean
  modo_lote: string
  valor: number
  copiar_sl: boolean
  copiar_tp: boolean
  filtro_simbolos: string[] | null
  max_abertas: number | null
  pausada_motivo: string | null
  /** cópias ainda abertas nesta rota (sombra/enviando/aberta) */
  abertas: number
}

export interface PlanoDeEscrita {
  criar: RotaDesejada[]
  actualizar: Array<{ id: string; patch: Partial<RotaDesejada> & { ativa?: boolean } }>
  /** já não segue: fica activa e pausada até fechar o que tem aberto; sem nada aberto → desligada */
  retirar: Array<{ id: string; patch: { ativa?: boolean; pausada_motivo?: string | null } }>
}

/** O que escrever para passar das rotas existentes (desta estratégia) às desejadas. Idempotente. */
export function planoDeEscrita(desejadas: RotaDesejada[], existentes: RotaExistente[]): PlanoDeEscrita {
  const porChave = new Map(existentes.map((r) => [r.destino_chave, r]))
  const criar: RotaDesejada[] = []
  const actualizar: PlanoDeEscrita['actualizar'] = []
  const retirar: PlanoDeEscrita['retirar'] = []
  const iguaisArr = (a: string[] | null, b: string[] | null) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort())
  for (const d of desejadas) {
    const r = porChave.get(d.destino_chave)
    if (!r) { criar.push(d); continue }
    const patch: Partial<RotaDesejada> & { ativa?: boolean } = {}
    if (r.modo_lote !== d.modo_lote) patch.modo_lote = d.modo_lote
    if (Number(r.valor) !== d.valor) patch.valor = d.valor
    if (r.copiar_sl !== d.copiar_sl) patch.copiar_sl = d.copiar_sl
    if (r.copiar_tp !== d.copiar_tp) patch.copiar_tp = d.copiar_tp
    if (!iguaisArr(r.filtro_simbolos, d.filtro_simbolos)) patch.filtro_simbolos = d.filtro_simbolos
    if ((r.max_abertas ?? null) !== (d.max_abertas ?? null)) patch.max_abertas = d.max_abertas
    if ((r.pausada_motivo ?? null) !== d.pausada_motivo) patch.pausada_motivo = d.pausada_motivo
    if (r.destino_ref !== d.destino_ref) patch.destino_ref = d.destino_ref
    if (!r.ativa) patch.ativa = true
    if (Object.keys(patch).length) actualizar.push({ id: r.id, patch })
  }
  const desejadasChaves = new Set(desejadas.map((d) => d.destino_chave))
  for (const r of existentes) {
    if (desejadasChaves.has(r.destino_chave) || !r.ativa) continue
    if (r.abertas > 0) {
      if (r.pausada_motivo !== 'deixou de seguir a estratégia') retirar.push({ id: r.id, patch: { pausada_motivo: 'deixou de seguir a estratégia' } })
    } else {
      retirar.push({ id: r.id, patch: { ativa: false, pausada_motivo: 'deixou de seguir a estratégia' } })
    }
  }
  return { criar, actualizar, retirar }
}
