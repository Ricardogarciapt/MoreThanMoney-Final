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
  accaoSeguimentoPremium, bloqueioPelaAnterior, decidirSinalPremium, legadoPremiumCortado, SLUG_PREMIUM,
  type PosicaoMestrePremium, type SinalLido,
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

async function posicoesPremiumDaMestre(contaMestreId: string): Promise<PosicaoMestrePremium[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('funded_positions')
    .select('symbol, direcao, preco_entrada, sl, volume, volume_inicial, be_feito, ideia_ref, mae_id')
    .eq('account_id', contaMestreId)
    .eq('estado', 'aberta')
    .like('ideia_ref', `sinal:${SLUG_PREMIUM}:%`)
    .is('mae_id', null)
    .limit(50)
  if (error) throw new Error(`posições da mestre: ${error.message}`)
  return (data ?? []).map((r) => ({
    symbol: String(r.symbol), direcao: String(r.direcao),
    preco_entrada: r.preco_entrada == null ? null : Number(r.preco_entrada),
    sl: r.sl == null ? null : Number(r.sl),
    volume: r.volume == null ? null : Number(r.volume),
    volume_inicial: r.volume_inicial == null ? null : Number(r.volume_inicial),
    be_feito: r.be_feito === true,
  }))
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
      if (est.legadoCortado && accaoSeguimentoPremium(kind) === 'contar_sl') {
        const { incrementPremiumSlToday } = await import('@/lib/mtmcopy/premium-daily-stop')
        const n = await incrementPremiumSlToday()
        return { ...base, detalhe: `seguimento ${kind}: SL do dia nº ${n} (a mestre fecha pelo preço)` }
      }
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

    if (est.contaMestreId) {
      const anterior = bloqueioPelaAnterior(await posicoesPremiumDaMestre(est.contaMestreId), decisao.sinal.symbol)
      if (anterior) return await recusar(anterior)
    }

    const r = await encaminharSinalParaMestre({
      fonte: 'premium',
      symbol: decisao.sinal.symbol,
      direcao: decisao.sinal.direcao,
      // a MERCADO com os níveis absolutos do trader (como a rota antiga: sl/tp «from_room»)
      entrada: null,
      entradaReferencia: decisao.sinal.referencia,
      sl: decisao.sinal.sl,
      tps: decisao.sinal.tps,
      externalRef: msgRef,
    })
    const contas = r.contas ?? []
    const abertas = contas.filter((c) => c.estado === 'aberta').length
    const detalhe = r.modo === 'live'
      ? `mestre SIM: ${abertas}/${contas.length} conta(s) abertas${r.motivo ? ` (${r.motivo})` : ''}`
      : `mestre SIM ${r.modo}${r.motivo ? ` (${r.motivo})` : ''}`
    return { ...base, detalhe }
  } catch (e) {
    return { ...base, detalhe: `erro: ${e instanceof Error ? e.message : String(e)}` }
  }
}
