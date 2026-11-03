/**
 * A FICHA DE CÓPIA DE UMA CONTA — ler e escrever, do lado do servidor.
 *
 * Lê a FONTE do desejo (mtmcopy_connections / mtmauto_accounts + mtmauto_subscriptions), os
 * limites do motor por conta física (mestres_contas) e as rotas derivadas que existem hoje
 * (copia_rotas com mestres=true, destino_ref = esta conta), e põe tudo lado a lado com o que a regra
 * de lote dá (lib/mestres/lote.ts) — para o admin ver, ANTES de ressincronizar, o que a rota vai ficar.
 *
 * Escreve SEMPRE na fonte e nunca na rota; a seguir corre `sincronizarRotasDaEstrategia` para cada
 * estratégia tocada (a mesma função do script e do quadro de cópias). Ligar/desligar reutiliza
 * `ligarSubscritor` do quadro — uma regra, duas portas. Tudo relido e auditado.
 */
import { acessoEstrategia, EXPLICACAO_ACESSO_ESTRATEGIA } from '@/lib/acesso-estrategias'
import { perfisAcessoEstrategia } from '@/lib/acesso-estrategias-servidor'
import { esquecerCache } from '@/lib/admin-centro/cache'
import { db } from '@/lib/admin-centro/servidor/base'
import { registarAuditoria } from '@/lib/admin-centro/servidor/outros'
import { loteDaLigacaoSite, loteDaSubscricaoAuto } from '@/lib/mestres/lote'
import { contaDaSubscricao, ligacaoSegueEstrategia, ligacaoSegueGrupoTelegram, type ContaAutoSeguidora, type LigacaoSiteSeguidora, type SubscricaoAutoSeguidora } from '@/lib/mestres/planear'
import { seguidoresExtra } from '@/lib/mestres/premium'
import { sincronizarRotasDaEstrategia, type ResultadoSincronizacao } from '@/lib/mestres/servidor/sincronizar-rotas'
import { lerContaMestres, lerEstrategiaMestre, type ContaMestres } from '@/lib/mestres/tipos'
import { chaveFisica, lerRef } from '../regras'
import type { PlataformaCopia } from '../tipos'
import { CHAVE_CACHE_CADEIA, ligarSubscritor } from './cadeia'
import {
  PALAVRA_RETIRAR, patchContaAuto, patchLigacaoSite, patchMestresConta, patchRetirarSite, patchSubscricaoAuto, textoLote,
  type EstrategiaDaFicha, type FonteFicha, type PedidoFicha,
} from '../ficha-copia-regras'

export interface FichaCopia {
  ref: string
  fonte: FonteFicha
  userId: string | null
  plataforma: PlataformaCopia | null
  /** 'mt:<login>@<servidor>' · 'tl:<env>:<id>' — a chave das rotas e de mestres_contas; null = sem identidade física */
  chave: string | null
  /** a conta é MTM Funded ou só leitura: nunca é destino do motor das mestres */
  naoEDestino: string | null
  parametros: Record<string, unknown>
  limites: (ContaMestres & { existe: boolean })
  estrategias: EstrategiaDaFicha[]
  /** outras contas MTM Auto do mesmo utilizador (a subscrição pode estar a apontar para uma delas) */
  outrasContasAuto: Array<{ id: string; login: string | null; plataforma: string | null; principal: boolean }>
  avisos: string[]
}

export interface RespostaFicha { ok: boolean; status: number; mensagem: string; detalhe?: unknown }

const CAMPOS_SITE = 'id, user_id, is_active, purpose, copy_method, copyfactory_strategy_pick, strategy_lots, lot_mode, lot_value, max_risk_percent, copy_sl, copy_tp, symbols_whitelist, prop_firm_type, auto_trailing_stop, trailing_stop_points, mt5_platform, mt5_login, mt5_server, mt5_status, metaapi_account_id, tl_env, tl_account_id, funded_account_id, funded_somente_leitura, telegram_groups, telegram_group, account_role, sender_mode'

const CAMPOS_AUTO = 'id, user_id, plataforma, login, servidor, tl_env, tl_account_id, principal, copia_ativa, estado, funded_account_id, funded_somente_leitura, modo_lote, lote_valor, risco_pct, risco_max_pct, multiplicador, copiar_sl, copiar_tp, max_posicoes, simbolos_permitidos, prop_firm, preset, be_ativo, be_gatilho, trailing_ativo, espelhar_saidas, protecao_equity, equity_minima, perda_diaria_max, ganho_diario_max, saidas_pct'

const plataformaDe = (p: unknown, funded: unknown): PlataformaCopia | null => {
  const s = String(p ?? 'mt5').toLowerCase()
  if (s === 'mtmfunded' || funded) return null
  if (s === 'tradelocker') return 'tradelocker'
  return s === 'mt4' ? 'mt4' : 'mt5'
}

interface Estrategias {
  linhas: Array<{ slug: string; nome: string; providerId: string; incluirMtmauto: boolean; modo: string; copyfactoryIds: string[]; picks: string[]; grupos: string[] }>
}

async function lerEstrategias(): Promise<Estrategias> {
  const { data: ests } = await db().from('mestres_estrategias').select('*').limit(100)
  const ids = (ests ?? []).map((e) => String(e.provider_id))
  const { data: provs } = ids.length ? await db().from('mtmauto_providers').select('id, nome, apagado_em').in('id', ids) : { data: [] as Array<Record<string, unknown>> }
  const nome = new Map((provs ?? []).map((p) => [String(p.id), { nome: String(p.nome ?? ''), apagada: Boolean(p.apagado_em) }]))
  return {
    linhas: (ests ?? [])
      .map((l) => lerEstrategiaMestre(l as Record<string, unknown>))
      .filter((e) => !nome.get(e.providerId)?.apagada)
      .map((e) => {
        const extra = seguidoresExtra(e.slug)
        return { slug: e.slug, nome: nome.get(e.providerId)?.nome || e.slug, providerId: e.providerId, incluirMtmauto: e.incluirMtmauto, modo: e.modo, copyfactoryIds: e.copyfactoryIds, picks: extra.picks, grupos: extra.gruposTelegram }
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
  }
}

async function lerRotasDaConta(ref: string) {
  const { data: rotas } = await db().from('copia_rotas')
    .select('id, estrategia_slug, ativa, modo, estado, modo_lote, valor, pausada_motivo, copiar_parciais, copiar_modificacoes')
    .eq('mestres', true).eq('tipo_rota', 'estrategia').eq('destino_ref', ref).neq('estado', 'recusada').limit(100)
  const ids = (rotas ?? []).map((r) => String(r.id))
  const { data: abertas } = ids.length
    ? await db().from('copia_posicoes').select('rota_id').in('rota_id', ids).in('estado', ['sombra', 'enviando', 'aberta']).limit(2000)
    : { data: [] as Array<{ rota_id: string }> }
  const n = new Map<string, number>()
  for (const p of abertas ?? []) n.set(String(p.rota_id), (n.get(String(p.rota_id)) ?? 0) + 1)
  const porSlug = new Map<string, EstrategiaDaFicha['rota']>()
  for (const r of rotas ?? []) {
    porSlug.set(String(r.estrategia_slug ?? '').toLowerCase(), {
      id: String(r.id), ativa: r.ativa === true, modo: String(r.modo ?? 'shadow'), estado: String(r.estado ?? ''), modoLote: String(r.modo_lote ?? ''), valor: Number(r.valor ?? 0),
      pausadaMotivo: r.pausada_motivo ? String(r.pausada_motivo) : null, copiarParciais: r.copiar_parciais !== false, copiarModificacoes: r.copiar_modificacoes !== false, abertas: n.get(String(r.id)) ?? 0,
    })
  }
  return porSlug
}

async function lerLimites(chave: string | null, ref: string, userId: string | null): Promise<FichaCopia['limites']> {
  const vazio = lerContaMestres({ conta_chave: chave ?? '', conta_ref: ref, user_id: userId })
  if (!chave) return { ...vazio, existe: false }
  const { data } = await db().from('mestres_contas').select('*').eq('conta_chave', chave).maybeSingle()
  return data ? { ...lerContaMestres(data as Record<string, unknown>), existe: true } : { ...vazio, existe: false }
}

const previsao = (r: ReturnType<typeof loteDaLigacaoSite>): EstrategiaDaFicha['lotePrevisto'] =>
  r.ok ? { ok: true, texto: textoLote(r.lote.modo_lote, r.lote.valor), origem: r.lote.origem } : { ok: false, motivo: r.motivo }

/**
 * Acesso por estratégia (03/11, dono): Premium II só Premium (65 €) ou corretora validada, Edge só
 * PU Prime validada. A ficha diz ao admin quais as estratégias que esta pessoa NÃO pode seguir — e,
 * se já as segue, que a rota não abre (o planeador ignora-a com o mesmo motivo).
 */
async function avisosDeAcesso(userId: string | null | undefined, estrategias: EstrategiaDaFicha[]): Promise<string[]> {
  if (!userId) return []
  try {
    const perfis = await perfisAcessoEstrategia([userId])
    const perfil = perfis.get(userId) ?? null
    const out: string[] = []
    for (const e of estrategias) {
      const a = acessoEstrategia(e.slug, perfil)
      if (a.pode) continue
      out.push(`${e.nome}: ${EXPLICACAO_ACESSO_ESTRATEGIA[a.nivel]}${e.segue ? ' Esta conta segue-a mas a rota NÃO abre.' : ''}`)
    }
    return out
  } catch {
    return []
  }
}

export async function lerFichaCopia(ref: string): Promise<FichaCopia | null> {
  const x = lerRef(ref)
  if (!x || (x.origem !== 'site' && x.origem !== 'auto')) return null
  const avisos: string[] = []
  const ests = await lerEstrategias()
  const rotas = await lerRotasDaConta(`${x.origem}:${x.id}`)

  if (x.origem === 'site') {
    const { data: l, error } = await db().from('mtmcopy_connections').select(CAMPOS_SITE).eq('id', x.id).maybeSingle()
    if (error || !l) return null
    const lig = l as unknown as LigacaoSiteSeguidora
    const plataforma = plataformaDe(lig.mt5_platform, lig.funded_account_id)
    const chave = plataforma ? chaveFisica({ plataforma, login: lig.mt5_login, servidor: lig.mt5_server, tlEnv: lig.tl_env, tlAccountId: lig.tl_account_id, ref }) : null
    const limites = await lerLimites(chave, ref, lig.user_id)
    const lots = (lig.strategy_lots && typeof lig.strategy_lots === 'object' ? lig.strategy_lots : {}) as Record<string, unknown>
    const estrategias: EstrategiaDaFicha[] = ests.linhas.map((e) => {
      const ids = [...e.copyfactoryIds, ...e.picks]
      const porEstrategia = ligacaoSegueEstrategia(lig, ids, e.slug)
      const porGrupo = !porEstrategia && ligacaoSegueGrupoTelegram(lig, e.grupos)
      const chaveLots = Object.keys(lots).find((k) => [...ids, e.slug].some((c) => c.toLowerCase() === k.toLowerCase()))
      const bruto = chaveLots ? lots[chaveLots] : null
      const loteSite: number | true | null = chaveLots ? (typeof bruto === 'number' || typeof bruto === 'string') && Number(bruto) > 0 ? Number(bruto) : true : null
      const segue = porEstrategia || porGrupo
      return {
        slug: e.slug, nome: e.nome, providerId: e.providerId, incluirMtmauto: e.incluirMtmauto, modoMotor: e.modo, segue,
        via: !segue ? null : chaveLots ? 'strategy_lots' : porGrupo ? 'grupo Telegram' : 'pick CopyFactory',
        loteSite,
        lotePrevisto: segue ? previsao(loteDaLigacaoSite(lig, { idsCopyFactory: [...ids, e.slug], loteFixoForcado: limites.loteFixoForcado })) : null,
        subscricao: null,
        rota: rotas.get(e.slug.toLowerCase()) ?? null,
      }
    })
    if (lig.purpose === 'tap_to_trade') avisos.push('Ligação só de Tap to Trade: só segue por cópia se tiver uma estratégia escolhida.')
    avisos.push(...await avisosDeAcesso(lig.user_id, estrategias))
    return {
      ref, fonte: 'site', userId: lig.user_id ?? null, plataforma, chave,
      naoEDestino: !plataforma ? 'conta MTM Funded (segue pelo espelho simulado)' : lig.funded_somente_leitura ? 'só leitura' : lig.mt5_status === 'disconnected' ? 'ligação desligada' : null,
      parametros: {
        is_active: lig.is_active !== false, lot_mode: lig.lot_mode ?? 'risk_percent', lot_value: lig.lot_value ?? null, max_risk_percent: lig.max_risk_percent ?? null,
        copy_sl: lig.copy_sl !== false, copy_tp: lig.copy_tp !== false, symbols_whitelist: lig.symbols_whitelist ?? [], prop_firm_type: lig.prop_firm_type ?? null,
        auto_trailing_stop: (l as Record<string, unknown>).auto_trailing_stop === true, trailing_stop_points: (l as Record<string, unknown>).trailing_stop_points ?? null,
        copy_method: lig.copy_method ?? null, copyfactory_strategy_pick: lig.copyfactory_strategy_pick ?? null,
      },
      limites, estrategias, outrasContasAuto: [], avisos,
    }
  }

  const { data: c, error } = await db().from('mtmauto_accounts').select(CAMPOS_AUTO).eq('id', x.id).maybeSingle()
  if (error || !c) return null
  const conta = c as unknown as ContaAutoSeguidora
  const plataforma = plataformaDe(conta.plataforma, conta.funded_account_id)
  const chave = plataforma ? chaveFisica({ plataforma, login: conta.login, servidor: conta.servidor, tlEnv: conta.tl_env, tlAccountId: conta.tl_account_id, ref }) : null
  const [limites, { data: subs }, { data: outras }] = await Promise.all([
    lerLimites(chave, ref, conta.user_id),
    db().from('mtmauto_subscriptions').select('*').eq('user_id', conta.user_id),
    db().from('mtmauto_accounts').select('id, login, plataforma, principal, funded_account_id').eq('user_id', conta.user_id),
  ])
  const contasDoUser = (outras ?? []) as unknown as ContaAutoSeguidora[]
  const estrategias: EstrategiaDaFicha[] = ests.linhas.map((e) => {
    const s = ((subs ?? []) as unknown as SubscricaoAutoSeguidora[]).find((k) => k.provider_id === e.providerId) ?? null
    const alvo = s ? contaDaSubscricao(s, contasDoUser.map((k) => ({ ...k, user_id: conta.user_id }))) : null
    const nestaConta = Boolean(s && alvo && alvo.id === conta.id)
    const segue = Boolean(s && s.ativo !== false && s.auto_aceitar === true && nestaConta)
    return {
      slug: e.slug, nome: e.nome, providerId: e.providerId, incluirMtmauto: e.incluirMtmauto, modoMotor: e.modo, segue,
      via: segue ? 'subscrição' : null, loteSite: null,
      lotePrevisto: s && nestaConta ? previsao(loteDaSubscricaoAuto(s, conta, { loteFixoForcado: limites.loteFixoForcado })) : null,
      subscricao: s ? {
        id: String(s.id), ativo: s.ativo !== false, autoAceitar: s.auto_aceitar === true, contaId: s.conta_id ?? null, modoRisco: s.modo_risco ?? null,
        riscoPct: s.risco_pct == null ? null : Number(s.risco_pct), loteFixo: s.lote_fixo == null ? null : Number(s.lote_fixo), multiplicador: s.multiplicador == null ? null : Number(s.multiplicador),
        maxPosicoes: s.max_posicoes ?? null, beAtivo: (s as unknown as Record<string, unknown>).be_ativo as boolean | null ?? null, trailingAtivo: (s as unknown as Record<string, unknown>).trailing_ativo as boolean | null ?? null,
        simbolos: Array.isArray(s.simbolos) ? s.simbolos : [], noutraConta: Boolean(s && !nestaConta),
      } : null,
      rota: rotas.get(e.slug.toLowerCase()) ?? null,
    }
  })
  avisos.push(...await avisosDeAcesso(conta.user_id, estrategias))
  if (conta.copia_ativa === false) avisos.push('Cópia pausada na conta (copia_ativa=false): as rotas ficam pausadas, o que está aberto continua a ser gerido.')
  return {
    ref, fonte: 'auto', userId: conta.user_id ?? null, plataforma, chave,
    naoEDestino: !plataforma ? 'conta MTM Funded (segue pelo espelho simulado)' : conta.funded_somente_leitura ? 'só leitura' : null,
    parametros: {
      copia_ativa: conta.copia_ativa !== false, estado: conta.estado ?? null, principal: conta.principal === true,
      modo_lote: conta.modo_lote ?? 'risk_percent', lote_valor: conta.lote_valor ?? null, risco_pct: conta.risco_pct ?? null, risco_max_pct: conta.risco_max_pct ?? null, multiplicador: conta.multiplicador ?? null,
      max_posicoes: conta.max_posicoes ?? null, copiar_sl: conta.copiar_sl !== false, copiar_tp: conta.copiar_tp !== false, simbolos_permitidos: conta.simbolos_permitidos ?? [],
      be_ativo: conta.be_ativo !== false, be_gatilho: (c as Record<string, unknown>).be_gatilho ?? null, trailing_ativo: conta.trailing_ativo !== false, espelhar_saidas: conta.espelhar_saidas === true,
      protecao_equity: (c as Record<string, unknown>).protecao_equity === true, equity_minima: (c as Record<string, unknown>).equity_minima ?? null,
      perda_diaria_max: (c as Record<string, unknown>).perda_diaria_max ?? null, ganho_diario_max: (c as Record<string, unknown>).ganho_diario_max ?? null,
      prop_firm: conta.prop_firm ?? conta.preset ?? null,
    },
    limites, estrategias,
    outrasContasAuto: contasDoUser.filter((k) => k.id !== conta.id).map((k) => ({ id: String(k.id), login: k.login ?? null, plataforma: k.plataforma ?? null, principal: k.principal === true })),
    avisos,
  }
}

// ── escrita ─────────────────────────────────────────────────────────────────

/** As estratégias cuja rota desta conta pode mudar com o pedido: as que segue agora + as que têm rota. */
async function slugsATocar(ficha: FichaCopia, extra: string[] = []): Promise<string[]> {
  const s = new Set<string>(extra.map((x) => x.toLowerCase()))
  for (const e of ficha.estrategias) if (e.segue || e.rota) s.add(e.slug.toLowerCase())
  return [...s]
}

async function ressincronizar(slugs: string[]): Promise<Record<string, ResultadoSincronizacao | { erro: string }>> {
  const out: Record<string, ResultadoSincronizacao | { erro: string }> = {}
  for (const slug of slugs) out[slug] = await sincronizarRotasDaEstrategia(slug).catch((e) => ({ erro: e instanceof Error ? e.message : String(e) }))
  return out
}

function resumoSinc(r: Record<string, ResultadoSincronizacao | { erro: string }>): string {
  const partes = Object.entries(r).map(([slug, x]) => 'erro' in x ? `${slug}: erro (${x.erro})` : `${slug}: +${x.criadas} ~${x.actualizadas} −${x.retiradas}${x.erros.length ? ` · ${x.erros.length} erro(s)` : ''}`)
  return partes.length ? `Rotas ressincronizadas → ${partes.join(' · ')}.` : 'Nenhuma estratégia a ressincronizar.'
}

export async function escreverFichaCopia(adminId: string, p: PedidoFicha): Promise<RespostaFicha> {
  let r: RespostaFicha
  try {
    const ficha = await lerFichaCopia(p.ref)
    if (!ficha) r = { ok: false, status: 404, mensagem: 'Conta não encontrada (só site: e auto:).' }
    else r = await aplicar(adminId, ficha, p)
  } catch (e) {
    r = { ok: false, status: 500, mensagem: (e instanceof Error ? e.message : String(e)).slice(0, 300) }
  }
  esquecerCache(CHAVE_CACHE_CADEIA)
  for (const k of ['centro:contas', 'centro:estrategias', 'centro:ficha', 'centro:cockpit']) esquecerCache(k)
  await registarAuditoria({ adminId, acao: `ficha-copia:${p.accao}`, alvo: p.ref, pedido: p, resultado: { mensagem: r.mensagem, status: r.status }, ok: r.ok })
  return r
}

async function aplicar(adminId: string, ficha: FichaCopia, p: PedidoFicha): Promise<RespostaFicha> {
  const agora = new Date().toISOString()
  switch (p.accao) {
    case 'parametros': {
      const v = ficha.fonte === 'site' ? patchLigacaoSite(p.campos) : patchContaAuto(p.campos)
      if (!v.ok) return { ok: false, status: 400, mensagem: v.erro }
      const tabela = ficha.fonte === 'site' ? 'mtmcopy_connections' : 'mtmauto_accounts'
      const id = lerRef(p.ref)!.id
      const { error } = await db().from(tabela).update({ ...v.patch, updated_at: agora }).eq('id', id)
      if (error) return { ok: false, status: /column/i.test(error.message) ? 409 : 500, mensagem: `A base recusou: ${error.message}` }
      // Relê: a resposta de uma escrita não é prova.
      const { data: relida } = await db().from(tabela).select(Object.keys(v.patch).join(', ')).eq('id', id).maybeSingle()
      const diverge = Object.entries(v.patch).filter(([k, val]) => JSON.stringify((relida as Record<string, unknown> | null)?.[k] ?? null) !== JSON.stringify(val ?? null)).map(([k]) => k)
      if (diverge.length) return { ok: false, status: 500, mensagem: `Gravado mas a releitura não bate em ${diverge.join(', ')} — confirmar na base.` }
      const sinc = await ressincronizar(await slugsATocar(ficha))
      return { ok: true, status: 200, mensagem: `Parâmetros da conta gravados (${Object.keys(v.patch).join(', ')}). ${v.avisos.join(' ')} ${resumoSinc(sinc)}`.replace(/\s+/g, ' ').trim(), detalhe: { patch: v.patch, sincronizacao: sinc } }
    }

    case 'subscricao': {
      if (ficha.fonte !== 'auto') return { ok: false, status: 400, mensagem: 'Só contas da MTM Auto têm subscrições por estratégia. No site, o lote por estratégia grava-se com «ligar» (strategy_lots).' }
      const e = ficha.estrategias.find((x) => x.slug.toLowerCase() === p.slug.toLowerCase())
      if (!e) return { ok: false, status: 404, mensagem: `Estratégia «${p.slug}» não está no motor das mestres.` }
      if (!e.subscricao) return { ok: false, status: 409, mensagem: 'Esta pessoa não tem subscrição a esta estratégia — liga primeiro.' }
      const v = patchSubscricaoAuto(p.campos)
      if (!v.ok) return { ok: false, status: 400, mensagem: v.erro }
      const { error } = await db().from('mtmauto_subscriptions').update(v.patch).eq('id', e.subscricao.id)
      if (error) return { ok: false, status: /column/i.test(error.message) ? 409 : 500, mensagem: `A base recusou: ${error.message}` }
      const { data: relida } = await db().from('mtmauto_subscriptions').select(Object.keys(v.patch).join(', ')).eq('id', e.subscricao.id).maybeSingle()
      const diverge = Object.entries(v.patch).filter(([k, val]) => JSON.stringify((relida as Record<string, unknown> | null)?.[k] ?? null) !== JSON.stringify(val ?? null)).map(([k]) => k)
      if (diverge.length) return { ok: false, status: 500, mensagem: `Gravado mas a releitura não bate em ${diverge.join(', ')} — confirmar na base.` }
      const sinc = await ressincronizar([e.slug])
      return { ok: true, status: 200, mensagem: `Subscrição a «${e.nome}» gravada (${Object.keys(v.patch).join(', ')}). ${v.avisos.join(' ')} ${resumoSinc(sinc)}`.replace(/\s+/g, ' ').trim(), detalhe: { patch: v.patch, sincronizacao: sinc } }
    }

    case 'ligar':
    case 'desligar': {
      if (ficha.naoEDestino) return { ok: false, status: 409, mensagem: `Esta conta não é destino do motor: ${ficha.naoEDestino}.` }
      const e = ficha.estrategias.find((x) => x.slug.toLowerCase() === p.slug.toLowerCase())
      if (!e) return { ok: false, status: 404, mensagem: `Estratégia «${p.slug}» não está no motor das mestres.` }
      const avisos: string[] = []
      if (p.accao === 'ligar' && ficha.fonte === 'auto' && !e.incluirMtmauto) avisos.push(`ATENÇÃO: «${e.nome}» não inclui contas MTM Auto (incluir_mtmauto=false) — a subscrição fica gravada mas a rota não nasce até se ligar isso na ficha da estratégia.`)
      const x = await ligarSubscritor(adminId, { ref: p.ref, slug: e.slug, ligar: p.accao === 'ligar', lote: p.accao === 'ligar' ? p.lote : null })
      return { ok: x.ok, status: x.status, mensagem: [x.mensagem, ...avisos].join(' '), detalhe: x.detalhe }
    }

    case 'limites': {
      if (!ficha.chave) return { ok: false, status: 409, mensagem: 'Conta sem identidade física (login/servidor): não há chave para mestres_contas.' }
      const v = patchMestresConta(p.campos)
      if (!v.ok) return { ok: false, status: 400, mensagem: v.erro }
      const escrita = ficha.limites.existe
        ? await db().from('mestres_contas').update(v.patch).eq('conta_chave', ficha.chave)
        : await db().from('mestres_contas').insert({ conta_chave: ficha.chave, conta_ref: p.ref, user_id: ficha.userId, modo: 'sombra', ...v.patch, notas: `criada pela ficha de cópia (admin ${adminId})` })
      if (escrita.error) return { ok: false, status: 409, mensagem: `A base recusou: ${escrita.error.message}` }
      const { data: relida } = await db().from('mestres_contas').select('*').eq('conta_chave', ficha.chave).maybeSingle()
      const agoraL = relida ? lerContaMestres(relida as Record<string, unknown>) : null
      if (!agoraL) return { ok: false, status: 500, mensagem: 'Gravado mas a releitura não encontra a linha — confirmar na base.' }
      // O lote fixo forçado entra no cálculo das rotas (lotesForcados): ressincroniza.
      const sinc = 'lote_fixo_forcado' in v.patch ? await ressincronizar(await slugsATocar(ficha)) : {}
      return {
        ok: true, status: 200,
        mensagem: `Limites do motor para ${ficha.chave}: lote forçado ${agoraL.loteFixoForcado ?? '—'} · máx. ${agoraL.maxPosicoes} posições · risco total ${agoraL.maxRiscoTotalPct} % · lote total ${agoraL.maxLoteTotal ?? '—'}. Valem para TODAS as estratégias desta conta. ${resumoSinc(sinc)}`,
        detalhe: { limites: agoraL, sincronizacao: sinc },
      }
    }

    case 'retirar': {
      if (p.confirmacao !== PALAVRA_RETIRAR) return { ok: false, status: 400, mensagem: `Escreve «${PALAVRA_RETIRAR}» para confirmar.` }
      const seguia = ficha.estrategias.filter((e) => e.segue).map((e) => e.slug)
      const id = lerRef(p.ref)!.id
      if (ficha.fonte === 'site') {
        const patch = patchRetirarSite({ copy_method: ficha.parametros.copy_method as string | null })
        const { error } = await db().from('mtmcopy_connections').update({ ...patch, updated_at: agora }).eq('id', id)
        if (error) return { ok: false, status: 500, mensagem: `A base recusou: ${error.message}` }
      } else {
        const { error } = await db().from('mtmauto_subscriptions').update({ ativo: false, auto_aceitar: false }).eq('user_id', ficha.userId!).eq('conta_id', id)
        if (error) return { ok: false, status: 500, mensagem: `A base recusou: ${error.message}` }
        // Subscrições sem conta_id caem na conta principal: se esta for a principal, também saem.
        if (ficha.parametros.principal === true) {
          const { error: e2 } = await db().from('mtmauto_subscriptions').update({ ativo: false, auto_aceitar: false }).eq('user_id', ficha.userId!).is('conta_id', null)
          if (e2) return { ok: false, status: 500, mensagem: `A base recusou: ${e2.message}` }
        }
      }
      const depois = await lerFichaCopia(p.ref)
      const aindaSegue = (depois?.estrategias ?? []).filter((e) => e.segue).map((e) => e.slug)
      if (aindaSegue.length) return { ok: false, status: 500, mensagem: `Gravado mas a releitura diz que ainda segue ${aindaSegue.join(', ')} — confirmar na base.` }
      const sinc = await ressincronizar(await slugsATocar(ficha, seguia))
      const abertas = ficha.estrategias.reduce((n, e) => n + (e.rota?.abertas ?? 0), 0)
      return {
        ok: true, status: 200,
        mensagem: `Conta retirada da cópia (deixou ${seguia.join(', ') || 'nenhuma estratégia'}). ${abertas > 0 ? `${abertas} posição(ões) aberta(s) continuam geridas até fechar; as rotas ficam pausadas até lá.` : 'Sem posições abertas: as rotas foram desligadas.'} A conta em si fica — para a apagar é «Remover…». ${resumoSinc(sinc)}`,
        detalhe: { seguia, sincronizacao: sinc },
      }
    }
  }
  return { ok: false, status: 400, mensagem: 'acção desconhecida' }
}
