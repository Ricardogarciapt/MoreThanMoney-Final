/**
 * O ESCOPO — que posições abertas o motor acompanha e em que contas. Lido da base de 15 em 15 s
 * (poucas consultas, todas às linhas ABERTAS), nunca por tick.
 *
 * Os filtros são os mesmos dos monitores, para a sombra comparar laranjas com laranjas:
 *  · Premium: linhas `open` de mtmcopy_premium_active nas contas de ORIGEM (mestre e as que executam
 *    por Telegram directo) — as copiadoras a CopyFactory replica; com `premium_price_monitor` ligado.
 *  · T2T: mtmcopy_signal_log aberto com broker_position_id, 14 dias, sem os «set & forget»
 *    (ideias-e-sinais), ligações não desligadas e contas que existem; com `t2t_price_monitor`.
 *  · MTM Auto: execuções `open` em contas MetaApi (TradeLocker/MTM Funded ficam para a fase 2), com a
 *    configuração do provider (ativo+espelhar, não apagado) e a chave da equipa quando existe.
 *  · Provider: as contas MESTRE das estratégias (`lib/mtmcopy/contas-provider-estrategia.ts`, linhas
 *    `mtm_trading_accounts` tipo='provider' cruzadas com `mtmauto_providers.metaapi_account_id`).
 *    Aqui não há linha por posição: o item é a ESTRATÉGIA (ref = slug) e as regras são as dela
 *    (`sinais_config` + colunas antigas). Só entram estratégias com gestão configurada — ver
 *    `temGestaoProvider`. O MTM Scanner NUNCA executa: fica de fora da gestão e só é ligado, em modo
 *    de observação (sem item, logo sem decisão possível), com MOTOR_REAL_PROVIDER_OBSERVAR_SCANNER=1.
 *  · Subscritores do Premium (opcional): só com posição mestre aberta.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { idsDeLigacao } from '../../lib/mtmcopy/ids-de-ligacao'
import { getExecSwitches, type ExecSwitches } from '../../lib/mtmcopy/exec-switches'
import { CANONICAL_PREMIUM_ACCOUNT_ID } from '../../lib/mtmcopy/provider-constants'
import {
  carregarContasDeEstrategia,
  contasDeEstrategiaEmCache,
  ehContaDeMotorViva,
  SLUGS_QUE_NAO_EXECUTAM,
} from '../../lib/mtmcopy/contas-provider-estrategia'
import { estrategiasGeridas, type EstadoProvider } from '../../lib/gestao-real/provider'
import { t2tUsaTrailing } from '../../lib/mtmcopy/t2t-source'
import { filtrarContasExistentes } from '../../lib/mtmcopy/metaapi-inexistentes'
import { resolverToken, type TokenResolvido } from '../../lib/copia-contas/tokens'
import { contasSubscritoras } from '../../lib/gestao-real/espelho-premium'
import { legadoPremiumCortado, SLUG_PREMIUM } from '../../lib/mestres/premium'
import type { ItemGestao } from '../../lib/gestao-real/avaliar'
import type { LinhaPremium } from '../../lib/gestao-real/premium'
import type { EstadoT2T, LinhaT2T } from '../../lib/gestao-real/t2t'
import type { PedidoConta } from '../../lib/gestao-real/planeamento'

type Linha = Record<string, unknown>

export interface Escopo {
  switches: ExecSwitches
  itens: ItemGestao[]
  pedidos: PedidoConta[]
  tokens: Map<string, TokenResolvido>
  subscritores: string[]
  notas: string[]
}

export interface OpcoesEscopo {
  tokenCasa: string
  contasFotografia: string[]
  subscritores: boolean
  tipos: { premium: boolean; t2t: boolean; mtmauto: boolean; provider: boolean }
  /** Ligar (só para ver) a conta do MTM Scanner, que não executa nem é gerida. */
  observarScanner?: boolean
  /** Travão de carga das decisões por posição das contas provider (ms). */
  intervaloProviderMs?: number
}

const T2T_SEM_GESTAO = new Set(['ideias-e-sinais'])

export async function carregarEscopo(db: SupabaseClient, o: OpcoesEscopo): Promise<Escopo> {
  const switches = await getExecSwitches()
  // As contas mestre de cada estratégia vêm da base (contas provider MT5 do VPS): sem isto o
  // motor só conhecia a lista fixa de ids e as posições das estratégias novas ficavam sem
  // parciais, sem break-even e sem trailing — e o espelho só leva às MTM Funded o que acontece
  // na mestre, por isso a falta contagiava as seguidoras.
  await carregarContasDeEstrategia().catch(() => undefined)
  const itens: ItemGestao[] = []
  const pedidos: PedidoConta[] = []
  const tokens = new Map<string, TokenResolvido>()
  const notas: string[] = []
  const casa: TokenResolvido = { chave: 'casa', token: o.tokenCasa }

  for (const conta of o.contasFotografia) {
    pedidos.push({ conta, prioridade: 0, chaveToken: 'casa', motivos: ['fotografia'], fixa: true })
    tokens.set(conta, casa)
  }

  // Premium pelo motor das mestres (mestres_estrategias.sinal_modo='live' do premium-ouro): a gestão é da
  // mestre SIM e chega às contas pelo serviço mtm-copia-contas. Aqui ficam de fora a conta MT5 mestre, as
  // contas de execução directa e o espelho aos subscritores — senão duas mãos na mesma posição. Leitura
  // falhada (tirando a tabela em falta) = cortado: na dúvida não se mexe em contas de clientes.
  const { data: linhaPremium, error: erroPremium } = await db.from('mestres_estrategias').select('sinal_modo').ilike('slug', SLUG_PREMIUM).maybeSingle()
  const premiumCortado = erroPremium ? erroPremium.code !== '42P01' : legadoPremiumCortado(linhaPremium)
  if (premiumCortado) notas.push('premium: executado pelo motor das mestres — legado fora do escopo')

  // ── Premium ────────────────────────────────────────────────────────────────
  let mestreAberto = false
  if (o.tipos.premium && switches.premium_price_monitor && !premiumCortado) {
    const [{ data: rows, error }, { data: diretas }] = await Promise.all([
      db.from('mtmcopy_premium_active').select('*').eq('status', 'open').order('created_at', { ascending: true }).limit(200),
      db.from('mtmcopy_connections').select('metaapi_account_id').eq('is_active', true).eq('copy_method', 'telegram_group')
        .neq('mt5_status', 'disconnected').not('metaapi_account_id', 'is', null),
    ])
    if (error) throw new Error(`premium_active: ${error.message}`)
    const precisam = new Set((diretas ?? []).map((c) => String(c.metaapi_account_id)))
    for (const r of (rows ?? []) as unknown as LinhaPremium[]) {
      if (!(ehContaDeMotorViva(r.account_id) || precisam.has(r.account_id))) continue
      const mestre = r.account_id === CANONICAL_PREMIUM_ACCOUNT_ID
      mestreAberto ||= mestre
      itens.push({ tipo: 'premium', conta: r.account_id, ref: r.id, linha: r, espelhar: mestre })
      pedidos.push({ conta: r.account_id, prioridade: mestre ? 0 : 1, chaveToken: 'casa', motivos: ['premium'] })
      tokens.set(r.account_id, casa)
    }
  }

  // ── T2T ────────────────────────────────────────────────────────────────────
  if (o.tipos.t2t && switches.t2t_price_monitor) {
    const { data: rows, error } = await db
      .from('mtmcopy_signal_log')
      .select('id, connection_id, chat_message_id, channel_key, symbol, direction, entry, sl, tp, lot, raw_message, broker_position_id, created_at')
      .in('status', ['open', 'ok', 'active', 'filled'])
      .not('broker_position_id', 'is', null)
      .gte('created_at', new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
      .limit(200)
    if (error) throw new Error(`signal_log: ${error.message}`)
    const geriveis = ((rows ?? []) as unknown as LinhaT2T[]).filter((r) => !T2T_SEM_GESTAO.has(String(r.channel_key ?? '')) && r.symbol)
    // Linhas sem `connection_id` não se gerem (não há conta) e, pior, mandavam `id=in.(null)` ao
    // PostgREST — o pedido inteiro era recusado (erro de uuid) e nenhuma ligação era lida.
    const connIds = idsDeLigacao(geriveis)
    if (connIds.length) {
      const [{ data: conns }, { data: estado }] = await Promise.all([
        db.from('mtmcopy_connections').select('id, metaapi_account_id').in('id', connIds).neq('mt5_status', 'disconnected'),
        db.from('site_settings').select('value').eq('key', 't2t_monitor_state').maybeSingle(),
      ])
      const existentes = new Set(await filtrarContasExistentes((conns ?? []).map((c) => c.metaapi_account_id as string | null)))
      const contaDe = new Map((conns ?? []).map((c) => [String(c.id), existentes.has(String(c.metaapi_account_id)) ? String(c.metaapi_account_id) : null]))
      let st: Record<string, EstadoT2T> = {}
      const v = estado?.value
      try { st = (typeof v === 'string' ? JSON.parse(v) : v) ?? {} } catch { st = {} }
      for (const r of geriveis) {
        const conta = contaDe.get(r.connection_id)
        if (!conta) continue
        itens.push({
          tipo: 't2t', conta, ref: r.id, linha: r as LinhaT2T & { symbol: string },
          estado: st[r.id] ? { ...st[r.id]! } : { exitsDone: 0, beDone: false, trailing: false, announced: false },
          podeTrailing: t2tUsaTrailing(r.channel_key, r.raw_message),
        })
        pedidos.push({ conta, prioridade: 2, chaveToken: 'casa', motivos: ['t2t'] })
        tokens.set(conta, casa)
      }
    }
  }

  // ── MTM Auto ───────────────────────────────────────────────────────────────
  if (o.tipos.mtmauto) {
    const { data: execs, error } = await db.from('mtmauto_executions').select('*, mtmauto_signals(*)').eq('estado', 'open').limit(300)
    if (error) throw new Error(`mtmauto_executions: ${error.message}`)
    const lista = (execs ?? []) as Linha[]
    if (lista.length) {
      const contaIds = [...new Set(lista.map((e) => e.account_id).filter(Boolean))] as string[]
      const { data: contas } = contaIds.length ? await db.from('mtmauto_accounts').select('*').in('id', contaIds) : { data: [] as Linha[] }
      const provIds = [...new Set(lista.map((e) => (e.mtmauto_signals as Linha | null)?.provider_id).filter(Boolean))] as string[]
      const { data: provs } = provIds.length ? await db.from('mtmauto_providers').select('*').in('id', provIds) : { data: [] as Linha[] }
      const userIds = [...new Set((contas ?? []).map((c) => c.user_id).filter(Boolean))] as string[]
      const tenantIds = new Set<string>((provs ?? []).map((p) => p.tenant_id as string).filter(Boolean))
      const { data: users } = userIds.length ? await db.from('mtmauto_users').select('user_id, tenant_id').in('user_id', userIds) : { data: [] as Linha[] }
      for (const u of users ?? []) if (u.tenant_id) tenantIds.add(String(u.tenant_id))
      const { data: tenants } = tenantIds.size ? await db.from('mtmauto_tenants').select('id, metaapi_token').in('id', [...tenantIds]) : { data: [] as Linha[] }
      const tokenDaEquipa = new Map((tenants ?? []).map((t) => [String(t.id), (t.metaapi_token as string | null) ?? null]))
      const equipaDoUser = new Map((users ?? []).map((u) => [String(u.user_id), (u.tenant_id as string | null) ?? null]))

      const metaIds = (contas ?? []).map((c) => metaApiDaConta(c))
      const provMeta = (provs ?? []).map((p) => (p.metaapi_account_id as string | null) ?? null)
      const vivas = new Set(await filtrarContasExistentes([...metaIds, ...provMeta]))

      for (const e of lista) {
        const sinal = e.mtmauto_signals as Linha | null
        const conta = (contas ?? []).find((c) => c.id === e.account_id)
        if (!sinal || !conta) continue
        const mid = metaApiDaConta(conta)
        if (!mid || !vivas.has(mid) || /disconnect|undeploy|delet|remov|apagad|desligad/i.test(String(conta.estado ?? ''))) continue
        const tenant = equipaDoUser.get(String(conta.user_id)) ?? null
        const tk = resolverToken({ ref: `auto:${conta.id}`, tenantId: tenant, tokenEquipa: tenant ? tokenDaEquipa.get(tenant) ?? null : null, tokenCasa: o.tokenCasa })
        if (!tk) { notas.push(`mtmauto ${String(mid).slice(0, 8)}: sem chave MetaApi`); continue }
        const prov = (provs ?? []).find((p) => p.id === sinal.provider_id) ?? null
        const provVivo = Boolean(prov && prov.ativo !== false && prov.espelhar !== false && !prov.apagado_em && prov.metaapi_account_id && vivas.has(String(prov.metaapi_account_id)))
        const espelha = conta.espelhar_saidas === true && provVivo
        let contaEducador: string | null = null
        if (espelha && prov) {
          const tkp = resolverToken({ ref: `prov:${prov.id}`, tenantId: (prov.tenant_id as string | null) ?? null, tokenEquipa: prov.tenant_id ? tokenDaEquipa.get(String(prov.tenant_id)) ?? null : null, providerNaChaveEquipa: prov.metaapi_chave_equipa === true, tokenCasa: o.tokenCasa })
          if (tkp) {
            contaEducador = String(prov.metaapi_account_id)
            pedidos.push({ conta: contaEducador, prioridade: 4, chaveToken: tkp.chave, motivos: ['educador'] })
            tokens.set(contaEducador, tkp)
          }
        }
        itens.push({
          tipo: 'mtmauto', conta: mid, ref: String(e.id),
          execucao: e as never,
          sinal: sinal as never,
          opcoes: {
            beAtivo: conta.be_ativo !== false,
            trailingAtivo: conta.trailing_ativo !== false,
            saidasPct: (conta.saidas_pct as number[]) ?? [50, 30, 20],
            trailingArrancaPips: (prov?.trailing_arranca_pips as number | null) ?? null,
            trailingTempoReal: prov?.trailing_tempo_real === true,
            trailingDistanciaPips: (prov?.trailing_distancia_pips as number | null) ?? null,
            trailingPassoPips: (prov?.trailing_passo_pips as number | null) ?? null,
          },
          contaEducador,
        })
        pedidos.push({ conta: mid, prioridade: 3, chaveToken: tk.chave, motivos: ['mtmauto'] })
        tokens.set(mid, tk)
      }
    }
  }

  // ── Provider (contas mestre das estratégias) ───────────────────────────────
  if (o.tipos.provider) {
    // Uma consulta por ciclo de escopo (15 s), às linhas das estratégias — nunca por tick.
    const { data: provs, error } = await db
      .from('mtmauto_providers')
      .select('id, slug, metaapi_account_id, ativo, apagado_em, tenant_id, metaapi_chave_equipa, be_gatilho, trailing_arranca_pips, trailing_distancia_pips, trailing_passo_pips, saidas_pct, sinais_config')
      .limit(500)
    if (error) throw new Error(`mtmauto_providers: ${error.message}`)
    const porSlug = new Map((provs ?? []).map((p) => [String(p.slug ?? '').toLowerCase(), p as Linha]))
    // Só quando alguma estratégia foi criada na chave de uma equipa (as da casa não são).
    const equipas = [...new Set((provs ?? []).filter((p) => p.metaapi_chave_equipa === true && p.tenant_id).map((p) => String(p.tenant_id)))]
    const { data: tenants } = equipas.length
      ? await db.from('mtmauto_tenants').select('id, metaapi_token').in('id', equipas)
      : { data: [] as Linha[] }
    const tokenDaEquipaProv = new Map((tenants ?? []).map((t) => [String(t.id), (t.metaapi_token as string | null) ?? null]))
    const escolha = estrategiasGeridas(contasDeEstrategiaEmCache(), porSlug, {
      naoExecutam: SLUGS_QUE_NAO_EXECUTAM,
      observarQuemNaoExecuta: o.observarScanner,
      intervaloMinimoMs: o.intervaloProviderMs,
    })
    notas.push(...escolha.notas)
    for (const conta of escolha.observar) {
      pedidos.push({ conta, prioridade: 1, chaveToken: 'casa', motivos: ['provider:observar'] })
      if (!tokens.has(conta)) tokens.set(conta, casa)
    }
    for (const g of escolha.geridas) {
      if (premiumCortado && String(g.slug).toLowerCase() === SLUG_PREMIUM) continue
      const prov = g.provider
      const tk = prov
        ? resolverToken({
            ref: `prov:${prov.id}`,
            tenantId: (prov.tenant_id as string | null) ?? null,
            tokenEquipa: prov.tenant_id ? tokenDaEquipaProv.get(String(prov.tenant_id)) ?? null : null,
            providerNaChaveEquipa: prov.metaapi_chave_equipa === true,
            tokenCasa: o.tokenCasa,
          })
        : casa
      if (!tk) { notas.push(`provider ${g.slug}: sem chave MetaApi`); continue }
      itens.push({ tipo: 'provider', conta: g.conta, ref: g.slug, cfg: g.cfg, estados: new Map<string, EstadoProvider>() })
      pedidos.push({ conta: g.conta, prioridade: 1, chaveToken: tk.chave, motivos: ['provider'] })
      if (!tokens.has(g.conta)) tokens.set(g.conta, tk)
    }
  }

  // ── Subscritores do Premium (sombra do espelho por conta) ───────────────────
  let subscritores: string[] = []
  if (o.subscritores && mestreAberto && switches.premium_subscriber_exits && !premiumCortado) {
    const { data } = await db
      .from('mtmcopy_connections')
      .select('metaapi_account_id, copy_method, is_active, mt5_status, copyfactory_strategy_id, copyfactory_strategy_pick, strategy_lots')
      .eq('is_active', true)
      .eq('mt5_status', 'connected')
    subscritores = await filtrarContasExistentes(contasSubscritoras((data ?? []) as never))
    for (const s of subscritores) {
      pedidos.push({ conta: s, prioridade: 5, chaveToken: 'casa', motivos: ['subscritor'] })
      if (!tokens.has(s)) tokens.set(s, casa)
    }
  }

  return { switches, itens, pedidos, tokens, subscritores, notas }
}

/** Conta MetaApi de uma linha de mtmauto_accounts (MTM Funded e TradeLocker não vão à MetaApi). */
export function metaApiDaConta(c: Linha): string | null {
  const plat = String(c.plataforma ?? '').toLowerCase()
  if (plat === 'mtmfunded' || plat === 'tradelocker') return null
  return c.metaapi_account_id ? String(c.metaapi_account_id) : null
}

/** Chave de identidade de um item (para não perder o estado virtual entre leituras). */
export const chaveItem = (i: ItemGestao) => `${i.tipo}:${i.ref}`
