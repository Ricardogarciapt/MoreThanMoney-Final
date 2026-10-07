/**
 * PREMIUM PELA MESTRE SIM — o cano (as decisões estão em ../premium.ts, com teste).
 *
 *  · `estadoPremiumNoMotor` / `legadoPremiumDesligado`: lêem `mestres_estrategias.sinal_modo` do
 *    `premium-ouro` (cache 5 s). É a pergunta que TODOS os caminhos antigos do Premium fazem antes de
 *    abrir, gerir ou espelhar uma ordem (processador, monitor de preço, espelho de saídas aos
 *    subscritores, zona, master-poll, motor-real). Com `live` calam-se todos.
 *  · `premiumPeloMotor`: chamado pelo processador (lib/mtmcopy/processor.ts) para cada mensagem do canal
 *    Premium — venha do relay-post (SME via gmi-relay) ou do webhook do bot. Entradas → mestre SIM
 *    (sombra: regista; live: abre na mestre e nas SIM que seguem o premium-ouro); o motor das mestres
 *    (VPS) leva cada facto da mestre às contas dos clientes.
 *
 * Leitura falhada: fica o último estado lido. Sem nenhum lido (arranque a frio com a base a falhar) o
 * legado é tratado como CORTADO — na dúvida não se abre ordem em conta de cliente (a regra da casa em
 * filterEligibleSubscribers); ordens em dobro são piores do que um sinal perdido. Sem a tabela (116 por
 * aplicar) → não cortado.
 *
 * Nunca lança.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  accaoSeguimentoPremium, bloqueioPorExposicao, decidirSinalPremium, entradaPremium, lerEntradaPremium, legadoPremiumCortado,
  saidaDoTraderPremium, SLUG_PREMIUM, type SinalLido,
} from '../premium'
import type { ModoEstrategia } from '../tipos'
import { encaminharSinalParaMestre } from './sinal-mestre'

export interface EstadoPremiumMotor {
  sinalModo: ModoEstrategia
  legadoCortado: boolean
  contaMestreId: string | null
  /** leitura falhada sem estado anterior → tratado como cortado */
  incerto?: boolean
}

const DESLIGADO: EstadoPremiumMotor = { sinalModo: 'desligado', legadoCortado: false, contaMestreId: null }
let cache: { v: EstadoPremiumMotor; em: number } | null = null
const CACHE_MS = 5_000

export async function estadoPremiumNoMotor(): Promise<EstadoPremiumMotor> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.v
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('mestres_estrategias')
      .select('slug, sinal_modo, conta_mestre_id')
      .ilike('slug', SLUG_PREMIUM)
      .maybeSingle()
    if (error?.code === '42P01') { cache = { v: DESLIGADO, em: Date.now() }; return DESLIGADO }
    if (error) throw new Error(error.message)
    const modo = (['desligado', 'sombra', 'live'] as const).find((m) => m === data?.sinal_modo) ?? 'desligado'
    const v: EstadoPremiumMotor = {
      sinalModo: modo,
      legadoCortado: legadoPremiumCortado(data),
      contaMestreId: data?.conta_mestre_id ? String(data.conta_mestre_id) : null,
    }
    cache = { v, em: Date.now() }
    return v
  } catch (e) {
    console.error('[mestres/premium] leitura de mestres_estrategias falhou:', e instanceof Error ? e.message : e)
    if (cache) return cache.v
    return { sinalModo: 'desligado', legadoCortado: true, contaMestreId: null, incerto: true }
  }
}

/** true = o Premium é executado pelo motor das mestres: a rota antiga NÃO abre, gere nem espelha nada. */
export async function legadoPremiumDesligado(): Promise<boolean> {
  return (await estadoPremiumNoMotor()).legadoCortado
}

/** Para testes. */
export function limparCachePremium(): void {
  cache = null
}

/**
 * Trades Premium VIVAS na mestre: posições abertas (sem as partes já fechadas das parciais) +
 * ordens limite ainda pendentes. É a conta da regra `bloqueioPorExposicao` (07/10).
 */
async function vivasPremiumDaMestre(contaMestreId: string): Promise<number> {
  const db = getSupabaseAdmin()
  const [pos, ord] = await Promise.all([
    db.from('funded_positions').select('id', { count: 'exact', head: true })
      .eq('account_id', contaMestreId).eq('estado', 'aberta').like('ideia_ref', `sinal:${SLUG_PREMIUM}:%`).is('mae_id', null),
    db.from('funded_orders').select('id', { count: 'exact', head: true })
      .eq('account_id', contaMestreId).eq('estado', 'pendente').like('ideia_ref', `sinal:${SLUG_PREMIUM}:%`),
  ])
  if (pos.error) throw new Error(`posições da mestre: ${pos.error.message}`)
  if (ord.error) throw new Error(`pendentes da mestre: ${ord.error.message}`)
  return (pos.count ?? 0) + (ord.count ?? 0)
}

let cacheCfg: { v: unknown; em: number } | null = null
/** `mtmauto_providers.sinais_config` do premium-ouro (cache 5 s) — onde mora `entradaPremium`. */
async function sinaisConfigPremium(): Promise<unknown> {
  if (cacheCfg && Date.now() - cacheCfg.em < CACHE_MS) return cacheCfg.v
  const { data } = await getSupabaseAdmin().from('mtmauto_providers').select('sinais_config').eq('slug', SLUG_PREMIUM).maybeSingle()
  cacheCfg = { v: data?.sinais_config ?? null, em: Date.now() }
  return cacheCfg.v
}

/** Contas que executam o Premium pelo motor: a mestre + as SIM que seguem o premium-ouro. */
async function contasDoPremium(contaMestreId: string): Promise<string[]> {
  const { data } = await getSupabaseAdmin().from('mtm_trading_accounts').select('id')
    .eq('motor', 'sim').eq('estado', 'ativa').ilike('segue_estrategia', SLUG_PREMIUM).limit(2000)
  return [...new Set([contaMestreId, ...(data ?? []).map((r) => String(r.id))])]
}

/**
 * O trader saiu de um sinal («Close all now», «HIT SL»): em cada conta do Premium cancela a limite
 * desse sinal que ainda não encheu e fecha o que estiver aberto. O motor das mestres leva o fecho
 * da mestre às contas dos clientes (fechar_com_origem). Nunca lança.
 */
async function sairDoSinal(contaMestreId: string, paiMessageId: number, tudo: boolean): Promise<string> {
  const db = getSupabaseAdmin()
  const ref = `sinal:${SLUG_PREMIUM}:msg:tg:${paiMessageId}`
  // «Close all now» fecha todas as camadas Premium; «HIT SL» só o sinal a que responde.
  const padrao = tudo ? `sinal:${SLUG_PREMIUM}:%` : ref
  const contas = await contasDoPremium(contaMestreId)
  const ex = await import('@/lib/mtmfunded/simulado/execucao')
  // `like` sem curingas é igualdade: o mesmo filtro serve aos dois casos.
  const { data: ordens } = await db.from('funded_orders').update({ estado: 'cancelada' })
    .in('account_id', contas).eq('estado', 'pendente').like('ideia_ref', padrao).select('id')
  const { data: posicoes } = await db.from('funded_positions').select('id, account_id')
    .in('account_id', contas).eq('estado', 'aberta').like('ideia_ref', padrao)
  let fechadas = 0
  for (const p of posicoes ?? []) {
    try {
      const conta = await ex.lerConta(String(p.account_id))
      if (!conta) continue
      await ex.fecharPosicao(conta, String(p.id), null, 'estrategia')
      fechadas++
    } catch {
      // já fechada pelo SL/motor entretanto
    }
  }
  return `trader saiu ${tudo ? 'de TODAS as camadas' : `do sinal ${paiMessageId}`}: ${ordens?.length ?? 0} pendente(s) cancelada(s), ${fechadas} posição(ões) fechada(s)`
}

export interface PedidoPremiumMotor {
  texto: string
  /** id da mensagem no canal Premium (destino do relay) — chave exacta do sinal */
  messageId: number | null | undefined
  /** o processador classificou como gestão / resposta (HIT TP, SL hit, trade active…) */
  gestao: boolean
  /** ruído do canal (aviso «NEW POSITION», recap…) */
  ignorar: boolean
  sinal: SinalLido | null
  /** id (no canal Premium) do sinal a que este seguimento responde — para espelhar as saídas do trader */
  paiMessageId?: number | null
}

export interface ResultadoPremiumMotor {
  modo: ModoEstrategia
  legadoCortado: boolean
  detalhe: string
}

export async function premiumPeloMotor(p: PedidoPremiumMotor): Promise<ResultadoPremiumMotor> {
  const est = await estadoPremiumNoMotor()
  const base = { modo: est.sinalModo, legadoCortado: est.legadoCortado }
  if (est.incerto) return { ...base, detalhe: 'motor das mestres ilegível — Premium não executa (nem pelo legado)' }
  if (est.sinalModo === 'desligado') return { ...base, detalhe: 'mestre SIM desligada' }
  if (p.ignorar) return { ...base, detalhe: 'ruído do canal' }
  const db = getSupabaseAdmin()

  try {
    if (p.gestao) {
      // A mestre gere por preço. O «SL hit» conta para o limite diário — em sombra quem conta é o legado
      // (applyPremiumManagement), por isso só se conta aqui com o legado cortado.
      const { classifyPremiumMessage } = await import('@/lib/mtmcopy/premium-management-exec')
      const kind = classifyPremiumMessage(p.texto)?.kind ?? null
      const partes: string[] = []
      // Saídas que só a mensagem diz (07/10): «Close all now» / «HIT SL» em resposta a um sinal.
      if (est.legadoCortado && est.sinalModo === 'live' && est.contaMestreId && p.paiMessageId && p.paiMessageId > 0
        && saidaDoTraderPremium(p.texto) !== 'nada') {
        partes.push(await sairDoSinal(est.contaMestreId, p.paiMessageId, saidaDoTraderPremium(p.texto) === 'fechar_tudo'))
      }
      if (est.legadoCortado && accaoSeguimentoPremium(kind) === 'contar_sl') {
        const { incrementPremiumSlToday } = await import('@/lib/mtmcopy/premium-daily-stop')
        const n = await incrementPremiumSlToday()
        partes.push(`SL do dia nº ${n}`)
      }
      if (partes.length) return { ...base, detalhe: `seguimento ${kind ?? 'n/d'}: ${partes.join(' · ')}` }
      return { ...base, detalhe: `seguimento ${kind ?? 'n/d'}: a mestre gere pelo preço (sinais_config)` }
    }

    const { isPremiumPausedToday } = await import('@/lib/mtmcopy/premium-daily-stop')
    const pausa = await isPremiumPausedToday().catch(() => ({ paused: false }))
    const decisao = decidirSinalPremium({ sinal: p.sinal, agora: new Date(), pausadoHoje: pausa.paused })
    const msgRef = p.messageId && p.messageId > 0 ? String(p.messageId) : ''

    const recusar = async (motivo: string) => {
      if (p.sinal?.symbol && p.sinal.direction && msgRef) {
        await db.from('mestres_sinais').upsert({
          estrategia: SLUG_PREMIUM, chave: `${SLUG_PREMIUM}:msg:tg:${msgRef}`, modo: est.sinalModo === 'live' ? 'live' : 'sombra',
          symbol: p.sinal.symbol, direcao: p.sinal.direction, entrada: p.sinal.zoneFirst ?? p.sinal.entry ?? null,
          sl: p.sinal.sl, tps: p.sinal.tp ?? [], resultado: { recusado: motivo },
        }, { onConflict: 'estrategia,chave,modo', ignoreDuplicates: true })
      }
      return { ...base, detalhe: `não abre: ${motivo}` }
    }
    if (!decisao.abrir) return await recusar(decisao.motivo)

    const cfgEntrada = lerEntradaPremium(await sinaisConfigPremium())
    if (est.contaMestreId) {
      const { arrumarPontesPendentes } = await import('@/lib/mtmfunded/estrategias-sinais/pendente')
      await arrumarPontesPendentes(await contasDoPremium(est.contaMestreId), SLUG_PREMIUM)
      const exposicao = bloqueioPorExposicao(await vivasPremiumDaMestre(est.contaMestreId), cfgEntrada)
      if (exposicao) return await recusar(exposicao)
    }

    // ONDE entrar: meio da zona do trader por limite (o que ele faz), ou a mercado se o preço já lá
    // está do lado bom. O tick só decide isto — a limite não precisa de preço fresco para nascer.
    let tick: { bid: number; ask: number } | null = null
    try {
      const { carregarPrecos } = await import('@/lib/mtmfunded/simulado/execucao')
      const { precoFresco } = await import('@/lib/mtmfunded/simulado/ordens')
      const { precos, em } = await carregarPrecos([decisao.sinal.symbol], [decisao.sinal.symbol])
      const px = precos[decisao.sinal.symbol]
      if (px && precoFresco(em[decisao.sinal.symbol])) tick = { bid: px.bid, ask: px.ask }
    } catch { /* sem tick → decide pela zona */ }
    const entrada = entradaPremium({
      direcao: decisao.sinal.direcao, zona: decisao.sinal.zona, sl: decisao.sinal.sl, tp1: decisao.sinal.tps[0] ?? null,
      preco: tick, cfg: cfgEntrada, agora: new Date(),
    })
    if (entrada.tipo === 'recusar') return await recusar(entrada.motivo)

    const r = await encaminharSinalParaMestre({
      fonte: 'premium',
      symbol: decisao.sinal.symbol,
      direcao: decisao.sinal.direcao,
      // níveis ABSOLUTOS do trader (como a rota antiga: sl/tp «from_room»); a entrada é a limite no
      // meio da zona, ou o mercado quando o preço já está do lado bom dela.
      entrada: null,
      entradaReferencia: decisao.sinal.referencia,
      sl: decisao.sinal.sl,
      tps: decisao.sinal.tps,
      externalRef: msgRef,
      limite: entrada.tipo === 'limite' ? { preco: entrada.preco, expiraEm: entrada.expiraEm } : null,
    })
    const contas = r.contas ?? []
    const abertas = contas.filter((c) => c.estado === 'aberta').length
    const pendentes = contas.filter((c) => c.estado === 'pendente').length
    const detalhe = r.modo === 'live'
      ? `mestre SIM: ${abertas} aberta(s), ${pendentes} limite(s) @${entrada.tipo === 'limite' ? entrada.preco : 'mercado'} de ${contas.length} conta(s)${r.motivo ? ` (${r.motivo})` : ''}`
      : `mestre SIM ${r.modo}${r.motivo ? ` (${r.motivo})` : ''}`
    return { ...base, detalhe }
  } catch (e) {
    return { ...base, detalhe: `erro: ${e instanceof Error ? e.message : String(e)}` }
  }
}
