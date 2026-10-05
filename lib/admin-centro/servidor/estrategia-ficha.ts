/**
 * A PÁGINA DE UMA ESTRATÉGIA — tudo o que ela é, de ponta a ponta, numa leitura.
 *
 * Pedido do dono (05/10): abrir uma estratégia no Centro mostra a CADEIA INTEIRA por esta ordem —
 *   1. fonte do sinal (tipo, conta/chat, estado),
 *   2. conta mestre (qual, modo de sinal/execução/T2T, posições abertas agora),
 *   3. rotas (`copia_rotas` da mestre: destino, estado, motivo de pausa),
 *   4. subscritores (MTM Auto, contas MTM Funded que a seguem, ligações T2T/site que recebem),
 * cada elo com o seu interruptor (pela camada única `estrategia-escrita.ts`) e uma linha de alerta
 * quando dois elos se contradizem (`estrategia-contradicoes.ts`, puro).
 *
 * Não há uma segunda leitura da cadeia: o «live/sombra» de cada rota vem de `carregarCadeia()` — a
 * mesma regra do motor (`lib/mestres/decisao.ts`) que o quadro de cópias usa. Aqui junta-se o que a
 * cadeia não tem: o direito de cada pessoa, a última actividade, as subscrições cruas e a fonte.
 *
 * Supabase frágil: uma consulta por tabela, com limite; nada por linha.
 */
import { db, ler, num, txt, ehUuid, type Linha } from './base'
import { carregarCadeia } from '@/lib/copia-contas/servidor/cadeia'
import type { NoEstrategia } from '@/lib/copia-contas/cadeia'
import { textoDaFonte } from '@/lib/copia-contas/cadeia'
import { direitosEmLote } from '@/lib/copia-contas/servidor/direitos-lote'
import { lerConfigGlobal, lerEstrategiaMestre } from '@/lib/mestres/tipos'
import { executorDe, motivoBloqueioLive } from '@/lib/mestres/painel'
import { canalChatDoProvider } from '@/lib/mestres/canal-t2t'
import { contradicoesDaEstrategia, type Contradicao } from '../estrategia-contradicoes'
import { ALCANCE, podeDecidir, type QuemDecide } from '../estrategia-escrita-plano'

export interface FichaEstrategia {
  id: string
  slug: string
  nome: string
  tipo: string | null
  equipa: { id: string; nome: string | null } | null
  ativo: boolean
  espelhar: boolean
  apagada: boolean
  fonte: {
    tipo: string | null
    texto: string
    conta: string | null
    chat: string | null
    estado: 'viva' | 'desligada' | 'por_ligar' | 'sem_fonte'
    desligada: { em: string; motivo: string | null } | null
    canalChat: string
    ultimoSinal: string | null
  }
  mestre: null | {
    modo: string
    sinalModo: string
    t2tModo: string
    executor: string
    executorNota: string
    bloqueioLive: Record<'modo' | 'sinal_modo' | 't2t_modo', string | null>
    conta: { id: string; login: string | null; saldo: number | null; equity: number | null; saldoInicial: number | null } | null
    posicoesAbertas: number
    copyfactoryPorCortar: string[]
  }
  motor: { ligado: boolean; kill: boolean; liveDesbloqueado: boolean; escritaNoProcesso: boolean }
  rotas: Array<{
    id: string
    ref: string
    tipo: string
    quem: string
    email: string | null
    userId: string | null
    activa: boolean
    estado: string
    efectivo: string
    motivo: string
    pausadaMotivo: string | null
    abertas: number
    lote: string
    ultimoEvento: string | null
    temDireito: boolean | null
  }>
  subscritores: {
    mtmauto: Array<{ id: string; userId: string; email: string | null; contaId: string | null; ativo: boolean; autoAceitar: boolean; lote: string; temDireito: boolean | null; temRota: boolean }>
    funded: Array<{ id: string; login: string | null; userId: string | null; email: string | null; estado: string | null }>
  }
  rotasProvider: Array<{ routeId: string; label: string; copia: boolean; t2t: boolean }>
  espelho: { contaId: string | null; ativo: boolean; config: Record<string, unknown> }
  saidasPct: number[] | null
  /** o nó da cadeia (para desenhar a mesma coluna do quadro de cópias) */
  no: NoEstrategia | null
  contradicoes: Contradicao[]
  /** o que ESTE admin pode decidir aqui — o ecrã esconde o resto */
  pode: Record<string, boolean>
}

export type RespostaFicha = { ok: true; ficha: FichaEstrategia } | { ok: false; status: number; erro: string }

export async function carregarFicha(quem: QuemDecide, ref: string): Promise<RespostaFicha> {
  const base = db().from('mtmauto_providers').select('*').limit(1)
  const pr = await ler(ehUuid(ref) ? base.eq('id', ref) : base.ilike('slug', ref))
  const p = pr.linhas[0]
  if (!p) return { ok: false, status: 404, erro: 'Estratégia não encontrada.' }
  // Ler também tem fronteira: o franchisado só vê as da sua equipa (a carteira de outro é dele).
  if (!quem.tudo && (p.tenant_id == null || String(p.tenant_id) !== quem.tenantId)) return { ok: false, status: 403, erro: 'Esta estratégia não é da tua equipa.' }

  const id = String(p.id)
  const slug = String(p.slug)
  const [mest, cadeia, rotasR, subsR, fundedR, sinalR, equipaR, cfgR] = await Promise.all([
    ler(db().from('mestres_estrategias').select('*').eq('provider_id', id).maybeSingle()),
    carregarCadeia().catch(() => null),
    ler(db().from('copia_rotas').select('id, ativa, estado, destino_ref, user_id, tipo_rota').eq('mestres', true).ilike('estrategia_slug', slug).neq('estado', 'recusada').limit(1000)),
    ler(db().from('mtmauto_subscriptions').select('id, user_id, conta_id, ativo, auto_aceitar, modo_risco, risco_pct, lote_fixo, multiplicador').eq('provider_id', id).limit(2000)),
    ler(db().from('mtm_trading_accounts').select('id, mt5_login, user_id, estado').ilike('segue_estrategia', slug).limit(1000)),
    ler(db().from('mtmauto_signals').select('created_at').eq('provider_id', id).order('created_at', { ascending: false }).limit(1)),
    p.tenant_id ? ler(db().from('mtmauto_tenants').select('id, nome').eq('id', String(p.tenant_id)).maybeSingle()) : Promise.resolve({ linhas: [] as Linha[] }),
    ler(db().from('site_settings').select('value').eq('key', 'mtmcopy_signal_sources').maybeSingle()),
  ])

  const em = mest.linhas[0] ? lerEstrategiaMestre(mest.linhas[0]) : null
  const no = cadeia?.estrategias.find((n) => n.providerId === id) ?? null
  const motor = cadeia?.motor ?? { ligado: false, kill: false, liveDesbloqueado: false, escritaNoProcesso: false }

  // conta mestre + posições abertas AGORA nela
  let conta: NonNullable<FichaEstrategia['mestre']>['conta'] = null
  let posicoesAbertas = 0
  if (em?.contaMestreId && ehUuid(em.contaMestreId)) {
    const [c, pos] = await Promise.all([
      ler(db().from('mtm_trading_accounts').select('id, mt5_login, sim_saldo, sim_equity, saldo_inicial').eq('id', em.contaMestreId).maybeSingle()),
      ler(db().from('funded_positions').select('id', { count: 'exact', head: true }).eq('account_id', em.contaMestreId).eq('estado', 'aberta')),
    ])
    const l = c.linhas[0]
    if (l) conta = { id: String(l.id), login: txt(l.mt5_login), saldo: num(l.sim_saldo), equity: num(l.sim_equity), saldoInicial: num(l.saldo_inicial) }
    posicoesAbertas = pos.contagem ?? 0
  }

  // última actividade de cada rota (copia_eventos) — uma consulta para todas
  const rotaIds = rotasR.linhas.map((r) => String(r.id))
  const ultimo = new Map<string, string>()
  if (rotaIds.length) {
    const ev = await ler(db().from('copia_eventos').select('rota_id, criado_em').in('rota_id', rotaIds.slice(0, 300)).order('criado_em', { ascending: false }).limit(1000))
    for (const e of ev.linhas) if (!ultimo.has(String(e.rota_id))) ultimo.set(String(e.rota_id), String(e.criado_em))
  }

  // direito de cada pessoa (rotas + subscrições + funded) em lote
  const userIds = [
    ...rotasR.linhas.map((r) => txt(r.user_id)),
    ...subsR.linhas.map((s) => txt(s.user_id)),
    ...fundedR.linhas.map((f) => txt(f.user_id)),
  ].filter((x): x is string => Boolean(x))
  const direitos = await direitosEmLote(userIds).catch(() => new Map())
  const direitoDe = (u: string | null) => (u ? direitos.get(u)?.temMtmAuto ?? null : null)
  const emailDe = (u: string | null) => (u ? direitos.get(u)?.email ?? null : null)

  const linhaRota = new Map(rotasR.linhas.map((r) => [String(r.id), r]))
  const rotas: FichaEstrategia['rotas'] = (no?.subscritores ?? []).map((s) => {
    const r = linhaRota.get(s.rotaId)
    return {
      id: s.rotaId, ref: s.ref, tipo: s.tipo, quem: s.etiqueta ?? s.descricao ?? s.ref, email: s.email ?? emailDe(s.userId), userId: s.userId,
      activa: r ? r.ativa !== false : true, estado: r ? String(r.estado ?? '') : '', efectivo: s.efectivo, motivo: s.motivo,
      pausadaMotivo: s.pausadaMotivo, abertas: s.abertas, lote: s.lote, ultimoEvento: ultimo.get(s.rotaId) ?? null, temDireito: direitoDe(s.userId),
    }
  })
  const destinosComRota = new Set(rotas.filter((r) => r.activa).map((r) => r.ref))
  const usersComRota = new Set(rotas.filter((r) => r.activa).map((r) => r.userId).filter(Boolean))
  const loteSub = (s: Linha) => {
    const m = String(s.modo_risco ?? '')
    if (s.lote_fixo != null) return `${s.lote_fixo} lotes`
    if (s.multiplicador != null) return `×${s.multiplicador}`
    if (s.risco_pct != null) return `${s.risco_pct} % risco`
    return m || '—'
  }
  const mtmauto = subsR.linhas.map((s) => {
    const u = String(s.user_id)
    const contaId = txt(s.conta_id)
    return {
      id: String(s.id), userId: u, email: emailDe(u), contaId, ativo: s.ativo !== false, autoAceitar: s.auto_aceitar === true, lote: loteSub(s),
      temDireito: direitoDe(u), temRota: contaId ? destinosComRota.has(`auto:${contaId}`) : usersComRota.has(u),
    }
  })
  const funded = fundedR.linhas.map((f) => ({ id: String(f.id), login: txt(f.mt5_login), userId: txt(f.user_id), email: emailDe(txt(f.user_id)), estado: txt(f.estado) }))

  // interruptores das rotas provider desta estratégia (site_settings), mesma leitura das fachadas
  const { ROTA_PARA_SLUGS_MTMAUTO } = await import('@/lib/mtmauto/espelho-interruptores')
  const { normalizeProviderRoutes } = await import('@/lib/mtmcopy/provider-routes')
  let cfg: unknown = cfgR.linhas[0]?.value ?? {}
  if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch { cfg = {} } }
  const rotasCfg = normalizeProviderRoutes((cfg ?? {}) as never)
  const rotasProvider = rotasCfg
    .filter((r) => (ROTA_PARA_SLUGS_MTMAUTO[r.id] ?? []).some((s) => s.toLowerCase() === slug.toLowerCase()))
    .map((r) => ({ routeId: r.id, label: String(r.label ?? r.tag ?? r.id), copia: r.enabled !== false, t2t: r.tap_to_trade === true }))

  // a fonte, dita como o dono a reconhece
  const tipo = txt(p.tipo)
  const desligada = p.fonte_desligada_em ? { em: String(p.fonte_desligada_em), motivo: txt(p.fonte_desligada_motivo) } : null
  const conta_ = tipo === 'metaapi' ? txt(p.metaapi_account_id) : tipo === 'mt5' ? (p.login ? `${p.login} @ ${p.servidor ?? '?'}` : null) : tipo === 'mtmfunded' ? txt(p.funded_account_id) : tipo === 'tradelocker' ? txt(p.tl_acc_num) : null
  const chat = tipo === 'telegram' ? `${txt(p.telegram_chat_titulo) ?? ''} ${txt(p.telegram_chat_id) ?? ''}`.trim() || null : null
  const semFonte = !txt(p.fonte_sinais) && !txt(p.fonte_mtm) && !conta_ && !chat && !no?.canalChat
  const porLigar = tipo === 'mt5' && (txt(p.mt5_estado) ?? 'por_ligar') === 'por_ligar'
  const estadoFonte: FichaEstrategia['fonte']['estado'] = desligada ? 'desligada' : porLigar ? 'por_ligar' : semFonte ? 'sem_fonte' : 'viva'
  const textoFonte = no?.fonte && no.fonte !== 'Sem fonte declarada'
    ? no.fonte
    : textoDaFonte({ fonteSinais: txt(p.fonte_sinais) ?? (tipo === 'mtm_t2t' ? txt(p.fonte_mtm) : null), fonteFiltro: txt(p.fonte_filtro), canalChat: no?.canalChat ?? null, slug })

  const global = { ligado: motor.ligado, kill: motor.kill, liveDesbloqueado: motor.liveDesbloqueado }
  const mestre: FichaEstrategia['mestre'] = em ? {
    modo: em.modo, sinalModo: em.sinalModo, t2tModo: em.t2tModo,
    ...(() => { const x = executorDe(em); return { executor: x.executor, executorNota: x.nota } })(),
    bloqueioLive: {
      modo: motivoBloqueioLive(em, 'modo', lerConfigGlobal({ ligado: global.ligado, kill: global.kill, live_desbloqueado: global.liveDesbloqueado })),
      sinal_modo: motivoBloqueioLive(em, 'sinal_modo', lerConfigGlobal({ ligado: global.ligado, kill: global.kill, live_desbloqueado: global.liveDesbloqueado })),
      t2t_modo: motivoBloqueioLive(em, 't2t_modo', lerConfigGlobal({ ligado: global.ligado, kill: global.kill, live_desbloqueado: global.liveDesbloqueado })),
    },
    conta, posicoesAbertas,
    copyfactoryPorCortar: em.copyfactoryCortadoEm ? [] : em.copyfactoryIds,
  } : null

  const apagada = Boolean(p.apagado_em)
  const ativo = p.ativo === true
  const contradicoes = contradicoesDaEstrategia({
    ativo, apagada,
    fonte: { desligada: Boolean(desligada), porLigar, semFonte },
    mestre: mestre ? { modo: mestre.modo, sinalModo: mestre.sinalModo, t2tModo: mestre.t2tModo, temConta: Boolean(mestre.conta), copyfactoryPorCortar: mestre.copyfactoryPorCortar.length } : null,
    motor: { ligado: motor.ligado, kill: motor.kill },
    rotas: rotas.map((r) => ({ id: r.id, activa: r.activa, pausada: Boolean(r.pausadaMotivo), efectivo: r.efectivo, temDireito: r.temDireito, quem: r.email ?? r.quem, tipo: r.tipo })),
    subscricoes: mtmauto.map((s) => ({ id: s.id, ativo: s.ativo, autoAceitar: s.autoAceitar, temRota: s.temRota, temDireito: s.temDireito, quem: s.email ?? s.userId })),
    rotaProvider: rotasProvider.length ? { copia: rotasProvider.every((r) => r.copia), t2t: rotasProvider.some((r) => r.t2t) } : null,
  })

  const pode: Record<string, boolean> = {}
  for (const a of Object.keys(ALCANCE)) pode[a] = podeDecidir(quem, a, p).ok

  let saidas: number[] | null = null
  if (Array.isArray(p.saidas_pct)) saidas = (p.saidas_pct as unknown[]).map(Number).filter(Number.isFinite)

  return {
    ok: true,
    ficha: {
      id, slug, nome: String(p.nome ?? slug), tipo,
      equipa: p.tenant_id ? { id: String(p.tenant_id), nome: txt(equipaR.linhas[0]?.nome) } : null,
      ativo, espelhar: p.espelhar === true, apagada,
      fonte: { tipo, texto: textoFonte, conta: conta_, chat, estado: estadoFonte, desligada, canalChat: canalChatDoProvider({ slug, canal_chat: txt(p.canal_chat), fonte_mtm: txt(p.fonte_mtm) }), ultimoSinal: txt(sinalR.linhas[0]?.created_at) },
      mestre, motor, rotas, subscritores: { mtmauto, funded }, rotasProvider,
      espelho: { contaId: txt(p.espelho_funded_account_id), ativo: p.espelho_provider_ativo === true, config: (p.espelho_config ?? {}) as Record<string, unknown> },
      saidasPct: saidas, no, contradicoes, pode,
    },
  }
}

/**
 * A LISTA de estratégias no âmbito de quem pede — o que a aba strategies da MTM Auto mostrava, agora
 * lido aqui (filtro de equipa pela mesma regra). Inclui as apagadas? Não: ficam fora, como lá.
 */
export async function listarEstrategias(quem: QuemDecide, equipa: { todas: boolean; tenantId: string | null }) {
  let q = db().from('mtmauto_providers').select('*').is('apagado_em', null).order('nome').limit(500)
  if (!equipa.todas) q = q.eq('tenant_id', equipa.tenantId ?? '00000000-0000-0000-0000-000000000000')
  const provs = await ler(q)
  const ids = provs.linhas.map((p) => String(p.id))
  const [mapa, subs, fundeds, mest] = await Promise.all([
    ler(db().from('mtmauto_provider_tenants').select('provider_id, tenant_id').limit(5000)),
    ler(db().from('mtmauto_subscriptions').select('provider_id, auto_aceitar').eq('ativo', true).limit(5000)),
    ler(db().from('mtm_trading_accounts').select('segue_estrategia').not('segue_estrategia', 'is', null).limit(5000)),
    ids.length ? ler(db().from('mestres_estrategias').select('provider_id, modo, sinal_modo, t2t_modo').in('provider_id', ids)) : Promise.resolve({ linhas: [] as Linha[] }),
  ])
  const equipasDe = new Map<string, string[]>()
  for (const m of mapa.linhas) equipasDe.set(String(m.provider_id), [...(equipasDe.get(String(m.provider_id)) ?? []), String(m.tenant_id)])
  const segue = new Map<string, { total: number; auto: number }>()
  for (const s of subs.linhas) { const k = String(s.provider_id); const a = segue.get(k) ?? { total: 0, auto: 0 }; a.total++; if (s.auto_aceitar === true) a.auto++; segue.set(k, a) }
  const fundedDe = new Map<string, number>()
  for (const f of fundeds.linhas) fundedDe.set(String(f.segue_estrategia), (fundedDe.get(String(f.segue_estrategia)) ?? 0) + 1)
  const mestreDe = new Map(mest.linhas.map((m) => [String(m.provider_id), { modo: String(m.modo), sinalModo: String(m.sinal_modo), t2tModo: String(m.t2t_modo) }]))
  const alinhado = new Map<string, boolean | null>()
  for (const p of provs.linhas.filter((x) => x.espelho_funded_account_id)) {
    const { data, error } = await db().rpc('espelho_alinhado', { p_slug: String(p.slug) })
    alinhado.set(String(p.id), error ? null : Boolean(data))
  }
  return provs.linhas.map((p) => {
    // A password MT5 cifrada nunca sai do servidor, nem para o admin.
    const { mt5_password_cifrada: _w, ...semSegredo } = p
    void _w
    return {
      ...semSegredo,
      equipas: equipasDe.get(String(p.id)) ?? [],
      fonte_execucao: p.fonte_execucao ?? 'mestre',
      espelho_alinhado: alinhado.get(String(p.id)) ?? null,
      seguidores: { ...(segue.get(String(p.id)) ?? { total: 0, auto: 0 }), funded: fundedDe.get(String(p.slug)) ?? 0 },
      mestre: mestreDe.get(String(p.id)) ?? null,
      podeEditar: podeDecidir(quem, 'gravar', p).ok,
    }
  })
}
