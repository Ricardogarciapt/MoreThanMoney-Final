/**
 * AVALIAR UM ITEM NUM TICK — liga a fotografia de uma conta (posições + preços do streaming) às
 * regras partilhadas (premium.ts, t2t.ts, mtmauto.ts), em SOMBRA ou em LIVE.
 *
 * Em SOMBRA as operações só registam a intenção (RegistoSombra) e mantêm um estado VIRTUAL: a linha
 * do item evolui como se cada ordem tivesse passado (exits_done, profit_locked…) e a posição ganha
 * uma sobreposição (SL/TP/volume pretendidos). É isso que faz o motor decidir UMA vez por regra, como
 * o monitor, e não a cada tick. A posição real (e o que o monitor lhe faz) fica intacta.
 *
 * Em LIVE (só Premium na fase 1) as operações vão ao executor (REST /trade + efeitos no site). A
 * sobreposição dura `ESPERA_REFLEXO_MS`: o streaming demora a mostrar o SL novo e, sem ela, o tick
 * seguinte pedia a mesma modificação outra vez.
 *
 * Sem IO próprio: tudo entra por parâmetros — testável com fotografias gravadas.
 */
import { acharPosicao, gerirLinhaPremium, type AcaoEspelhoPremium, type ConfigPremium, type LinhaPremium, type PosicaoGestao } from './premium'
import { gerirPosicaoT2T, type ConfigT2T, type EstadoT2T, type LinhaT2T } from './t2t'
import {
  decidirEspelho,
  decidirModificacaoEspelho,
  estadoDoEducadorPelasPosicoes,
  gerirAlvosEProtecao,
  type ConfigMtmAuto,
  type ExecucaoMtmAuto,
  type OpcoesMtmAuto,
  type SinalMtmAuto,
} from './mtmauto'
import { tamanhoPip as pipMtmAuto } from './mtmauto-regras'
import { decidirProvider, ESTADO_PROVIDER_NOVO, type ConfigProvider, type EstadoProvider } from './provider'
import { pipSizeForSymbol } from '../mtmcopy/trade-outcome'
import { decidirSubscritor } from './espelho-premium'
import { regraDaNota, type AcaoIntencao, type Intencao, type RegistoSombra } from './sombra'
import type { TrailingDistance } from '../mtmcopy/pip-points'

export const ESPERA_REFLEXO_MS = 5_000

export interface Sobreposicao {
  sl?: number
  tp?: number
  volume?: number
  /** Em live expira (ms epoch); em sombra é Infinity. */
  ate: number
}

export interface FotografiaConta {
  conta: string
  posicoes: PosicaoGestao[]
  /** (bid+ask)/2 do símbolo da corretora; null sem tick. */
  precoMedio: (simboloCorretora: string) => number | null
  agora: number
}

interface Base {
  conta: string
  ref: string
  terminado?: boolean
  /** Uma ordem live em curso: o tick não volta a avaliar. */
  ocupado?: boolean
}
export interface ItemPremium extends Base { tipo: 'premium'; linha: LinhaPremium; espelhar: boolean }
export interface ItemT2T extends Base { tipo: 't2t'; linha: LinhaT2T & { symbol: string }; estado: EstadoT2T; podeTrailing: boolean }
export interface ItemMtmAuto extends Base {
  tipo: 'mtmauto'
  execucao: ExecucaoMtmAuto & { broker_position_id: string | null; espelhado_pct?: number | null }
  sinal: SinalMtmAuto & { ref_externa?: string | null; volume_origem?: number | null }
  opcoes: OpcoesMtmAuto
  /** Conta do educador quando o cliente escolheu espelhar e ela é legível. */
  contaEducador: string | null
}
/**
 * A conta MESTRE de uma estratégia. Ao contrário dos outros, um item destes não é UMA posição: é a
 * estratégia inteira (`ref` = slug), e cada tick avalia TODAS as posições abertas da conta com a
 * configuração dela. É por isso que o estado virtual vive num mapa por posição aqui dentro.
 */
export interface ItemProvider extends Base {
  tipo: 'provider'
  cfg: ConfigProvider
  estados: Map<string, EstadoProvider>
}
export type ItemGestao = ItemPremium | ItemT2T | ItemMtmAuto | ItemProvider

export interface Configs {
  premium: Omit<ConfigPremium, 'espelhar'>
  t2t: Omit<ConfigT2T, 'podeTrailing'>
  mtmauto: ConfigMtmAuto
}

/** O que o live precisa de fazer fora das regras. */
export interface ExecutorLive {
  modificar(conta: string, posicao: string, simbolo: string, sl: number | undefined, tp: number | undefined | null, trailing?: TrailingDistance): Promise<{ ok: boolean; erro?: string }>
  fechar(conta: string, posicao: string, volume?: number): Promise<{ ok: boolean; erro?: string }>
  /** Escrita imediata na linha Premium (patch sem updated_at). */
  gravarPremium(id: string, patch: Record<string, unknown>): Promise<void>
  /** Só o pico: agrupado e gravado de poucos em poucos segundos. */
  gravarPicoPremium(id: string, pico: number): void
  /** Efeitos que vivem no site (anúncio do fecho, registo da saída, espelho aos subscritores). */
  efeito(tipo: 'premium_encerrar' | 'premium_saida' | 'premium_espelhar', corpo: Record<string, unknown>): Promise<void>
}

export interface ContextoAvaliacao {
  modo: 'sombra' | 'live'
  cfg: Configs
  registo: RegistoSombra
  sobreposicoes: Map<string, Sobreposicao>
  /** Posições de outra conta ligada (educador / subscritores). null = não ligada ou não sincronizada. */
  posicoesDe: (conta: string) => PosicaoGestao[] | null
  /** Subscritores do Premium com streaming (sombra do espelho por conta). */
  subscritores: string[]
  /**
   * Posições desta conta que já são geridas pela linha que as originou (Premium, T2T, MTM Auto).
   * O tipo `provider` gere o RESTO — a conta mestre de uma estratégia também executa Premium, e sem
   * isto a mesma posição levava duas decisões com duas regras diferentes.
   */
  posicoesGeridas?: Set<string>
  trailingTempoReal: boolean
  live?: ExecutorLive
}

const chaveSob = (conta: string, pos: string) => `${conta}|${pos}`

function aplicarSobreposicao<P extends PosicaoGestao>(pos: P, s: Sobreposicao | undefined, agora: number): P {
  if (!s || s.ate < agora) return pos
  return {
    ...pos,
    ...(s.sl != null ? { stopLoss: s.sl } : {}),
    ...(s.tp != null ? { takeProfit: s.tp } : {}),
    ...(s.volume != null ? { volume: Math.min(pos.volume ?? Infinity, s.volume) } : {}),
  }
}

function sobrepor(ctx: ContextoAvaliacao, conta: string, posId: string, patch: Omit<Sobreposicao, 'ate'>, agora: number): void {
  const k = chaveSob(conta, posId)
  const antes = ctx.sobreposicoes.get(k)
  const ate = ctx.modo === 'sombra' ? Infinity : agora + ESPERA_REFLEXO_MS
  ctx.sobreposicoes.set(k, { ...(antes && antes.ate >= agora ? antes : {}), ...patch, ate })
}

/** Junta a regra (pela nota que se segue) e entrega ao registo. */
class Recolha {
  private itens: Array<{ i: Omit<Intencao, 'regra'> & { regra?: string }; idx: number; ok?: boolean; erro?: string }> = []
  constructor(private notas: string[]) {}
  /** `i.regra` explícita ganha à nota seguinte. */
  add(i: Omit<Intencao, 'regra'> & { regra?: string }, resultado?: { ok: boolean; erro?: string }) {
    this.itens.push({ i, idx: this.notas.length, ok: resultado?.ok, erro: resultado?.erro })
  }
  entregar(ctx: ContextoAvaliacao, agora: number) {
    for (const x of this.itens) {
      const i: Intencao = { ...x.i, regra: x.i.regra ?? regraDaNota(this.notas[x.idx], x.i.acao as AcaoIntencao) }
      if (ctx.modo === 'live') ctx.registo.live(i, agora, x.ok !== false, x.erro)
      else ctx.registo.decidir(i, agora)
    }
  }
}

/** Avalia um item. Devolve as notas (as mesmas frases dos monitores). */
export async function avaliarItem(item: ItemGestao, foto: FotografiaConta, ctx: ContextoAvaliacao): Promise<string[]> {
  if (item.terminado || item.ocupado) return []
  if (item.tipo === 'premium') return avaliarPremium(item, foto, ctx)
  if (item.tipo === 't2t') return avaliarT2T(item, foto, ctx)
  if (item.tipo === 'provider') return avaliarProvider(item, foto, ctx)
  return avaliarMtmAuto(item, foto, ctx)
}

/**
 * A conta mestre de uma estratégia: todas as posições abertas, com as regras DA ESTRATÉGIA.
 *
 * Sempre em sombra — o tipo `provider` não está em `TIPOS_LIVE_SUPORTADOS` e este caminho nunca toca
 * no executor. O `ref` da linha da sombra é o slug da estratégia (não há linha de origem na base).
 */
function avaliarProvider(item: ItemProvider, foto: FotografiaConta, ctx: ContextoAvaliacao): string[] {
  const agora = foto.agora
  const notas: string[] = []
  const recolha = new Recolha(notas)
  const vivas = new Set<string>()

  for (const real of foto.posicoes) {
    const id = String(real.id)
    if (ctx.posicoesGeridas?.has(id)) continue
    vivas.add(id)
    const pos = aplicarSobreposicao(real, ctx.sobreposicoes.get(chaveSob(item.conta, id)), agora)
    const estado = item.estados.get(id) ?? { ...ESTADO_PROVIDER_NOVO }
    const vivo = ctx.trailingTempoReal ? foto.precoMedio(real.symbol) : null
    const d = decidirProvider(pos, item.cfg, estado, agora, vivo)
    item.estados.set(id, d.estado)
    if (d.sl == null || d.motivo == null) continue
    notas.push(d.nota ?? `${real.symbol}: stop → ${d.sl}`)
    recolha.add({
      conta: item.conta, tipo: 'provider', ref: item.ref, posicao: id, simbolo: real.symbol,
      lado: /SELL/i.test(String(real.type)) ? 'sell' : 'buy', tickEm: agora,
      regra: d.motivo === 'be' ? 'provider_be' : 'provider_trailing',
      acao: 'sl', sl: d.sl, tp: null, preco: pos.currentPrice ?? null,
      detalhe: `${item.cfg.slug}${item.cfg.perfil ? ` · perfil ${item.cfg.perfil}` : ''} · ${d.lucroPips.toFixed(1)}p`,
    })
    // Em sombra o SL real nunca muda: sem a sobreposição o motor voltaria a pedir o mesmo.
    sobrepor(ctx, item.conta, id, { sl: d.sl }, agora)
  }

  for (const id of [...item.estados.keys()]) if (!vivas.has(id)) item.estados.delete(id)
  recolha.entregar(ctx, agora)
  return notas
}

async function avaliarPremium(item: ItemPremium, foto: FotografiaConta, ctx: ContextoAvaliacao): Promise<string[]> {
  const row = item.linha
  const real = acharPosicao(foto.posicoes, row)
  if (!real) return []
  const agora = foto.agora
  const pos = aplicarSobreposicao(real, ctx.sobreposicoes.get(chaveSob(item.conta, real.id)), agora)
  const notas: string[] = []
  const recolha = new Recolha(notas)
  const base = { conta: item.conta, tipo: 'premium' as const, ref: item.ref, posicao: String(real.id), simbolo: real.symbol, lado: row.direction, tickEm: agora }
  const precoAgora = () => ctx.trailingTempoReal ? (foto.precoMedio(real.symbol) ?? pos.currentPrice ?? null) : (pos.currentPrice ?? null)
  const live = ctx.modo === 'live' ? ctx.live : undefined

  const n = await gerirLinhaPremium(row, pos, { ...ctx.cfg.premium, trailingTempoReal: ctx.trailingTempoReal, espelhar: item.espelhar }, {
    modificar: async (sl, tp, trailing) => {
      const r = live ? await live.modificar(item.conta, real.id, real.symbol, sl, tp, trailing) : { ok: true }
      recolha.add({ ...base, acao: 'sl', sl: sl ?? null, tp: tp ?? null, preco: precoAgora(), detalhe: trailing ? `trailing ${JSON.stringify(trailing)}` : null }, r)
      if (r.ok) {
        // Só para os ticks SEGUINTES: dentro da mesma passagem o monitor compara com o SL que leu.
        sobrepor(ctx, item.conta, real.id, { ...(sl != null && sl > 0 ? { sl } : {}), ...(tp != null && tp > 0 ? { tp } : {}) }, agora)
      }
      return { success: r.ok }
    },
    fechar: async (volume) => {
      const r = live ? await live.fechar(item.conta, real.id, volume) : { ok: true }
      recolha.add({ ...base, acao: 'fecho', volume: volume ?? null, preco: precoAgora() }, r)
      if (r.ok) sobrepor(ctx, item.conta, real.id, { volume: volume != null ? Math.max(0, Math.round(((pos.volume ?? 0) - volume) * 100) / 100) : 0 }, agora)
      return { success: r.ok }
    },
    espelhar: async (acao: AcaoEspelhoPremium) => {
      recolha.add({ ...base, acao: 'espelho', sl: acao.kind === 'be_trailing' ? acao.beSl : null, volume: null, preco: precoAgora(), detalhe: JSON.stringify(acao) })
      if (live) { await live.efeito('premium_espelhar', { symbol: row.symbol, direction: row.direction, acao }); return null }
      // Sombra por subscritor: a mesma decisão do mirrorPremiumExit, nas contas com streaming.
      for (const sub of ctx.subscritores) {
        const posicoes = ctx.posicoesDe(sub)
        if (!posicoes) continue
        const d = decidirSubscritor(posicoes, row.symbol, row.direction, acao)
        if (d.tipo === 'sem_posicao' || d.tipo === 'sem_volume') continue
        if (d.tipo === 'ambiguo') {
          recolha.add({ conta: sub, tipo: 'subscritor', ref: item.ref, posicao: '?', simbolo: row.symbol, lado: row.direction, tickEm: agora, acao: 'espelho', preco: precoAgora(), detalhe: `ambíguo (${d.n})` })
          continue
        }
        const p = d.pos
        const subBase = { conta: sub, tipo: 'subscritor' as const, ref: item.ref, posicao: String(p.id), simbolo: p.symbol, lado: row.direction, tickEm: agora, preco: precoAgora() }
        if (d.tipo === 'fechar_tudo' || d.tipo === 'fechar_resto') recolha.add({ ...subBase, acao: 'fecho', volume: null, detalhe: `espelho ${acao.kind}` })
        else if (d.tipo === 'parcial') recolha.add({ ...subBase, acao: 'fecho', volume: d.volume, detalhe: `espelho ${acao.kind}` })
        else if (d.tipo === 'be_trailing' && acao.kind === 'be_trailing') recolha.add({ ...subBase, acao: 'sl', sl: acao.beSl, detalhe: 'espelho be_trailing' })
      }
      return null
    },
    gravar: async (patch) => {
      if (live) {
        const chaves = Object.keys(patch)
        if (chaves.length === 1 && chaves[0] === 'peak_profit_pips') live.gravarPicoPremium(row.id, Number(patch.peak_profit_pips))
        else await live.gravarPremium(row.id, patch)
      }
      Object.assign(row, patch)
    },
    encerrar: async (evento, patch) => {
      Object.assign(row, patch ?? {}, { status: 'closed' })
      item.terminado = true
      recolha.add({ ...base, acao: 'encerrar', preco: precoAgora(), detalhe: evento })
      if (live) await live.efeito('premium_encerrar', { rowId: row.id, evento, patch: patch ?? {} })
    },
    registarSaida: async (args) => {
      if (live) await live.efeito('premium_saida', { rowId: row.id, accountId: item.conta, args })
    },
    precoVivo: async () => foto.precoMedio(real.symbol),
  }, notas)
  void n
  recolha.entregar(ctx, agora)
  return notas
}

async function avaliarT2T(item: ItemT2T, foto: FotografiaConta, ctx: ContextoAvaliacao): Promise<string[]> {
  const row = item.linha
  const real = foto.posicoes.find((p) => String(p.id) === String(row.broker_position_id))
  if (!real) return []
  const agora = foto.agora
  const price = foto.precoMedio(real.symbol)
  if (price == null || !(price > 0)) return []
  const pos = aplicarSobreposicao(real, ctx.sobreposicoes.get(chaveSob(item.conta, real.id)), agora)
  const notas: string[] = []
  const recolha = new Recolha(notas)
  const base = { conta: item.conta, tipo: 't2t' as const, ref: item.ref, posicao: String(real.id), simbolo: real.symbol, lado: row.direction === 'sell' ? 'sell' as const : 'buy' as const, tickEm: agora, preco: price }
  const fim = await gerirPosicaoT2T(row, pos, price, item.estado, { ...ctx.cfg.t2t, podeTrailing: item.podeTrailing }, {
    fechar: async (volume) => {
      recolha.add({ ...base, acao: 'fecho', volume: volume ?? null })
      sobrepor(ctx, item.conta, real.id, { volume: volume != null ? Math.max(0, Math.round(((pos.volume ?? 0) - volume) * 100) / 100) : 0 }, agora)
      return { success: true }
    },
    modificar: async (sl, tp) => {
      recolha.add({ ...base, acao: 'sl', sl, tp: tp ?? null })
      sobrepor(ctx, item.conta, real.id, { sl, ...(tp != null && tp > 0 ? { tp } : {}) }, agora)
      return { success: true }
    },
    publicar: async () => undefined,
    encerrar: async () => { item.terminado = true },
  }, notas)
  if (fim === 'apagar') item.terminado = true
  recolha.entregar(ctx, agora)
  return notas
}

async function avaliarMtmAuto(item: ItemMtmAuto, foto: FotografiaConta, ctx: ContextoAvaliacao): Promise<string[]> {
  const e = item.execucao
  const real = foto.posicoes.find((p) => String(p.id) === String(e.broker_position_id))
  if (!real) return []
  const agora = foto.agora
  const posicao = aplicarSobreposicao(real, ctx.sobreposicoes.get(chaveSob(item.conta, real.id)), agora)
  const notas: string[] = []
  const recolha = new Recolha(notas)
  const base = { conta: item.conta, tipo: 'mtmauto' as const, ref: item.ref, posicao: String(real.id), simbolo: real.symbol, lado: item.sinal.direction, tickEm: agora, preco: posicao.currentPrice ?? null }
  const feito = { stringCode: 'TRADE_RETCODE_DONE', numericCode: 10009 }

  // Espelho do educador primeiro (como gerirPosicao). Conta dele sem streaming = não se sabe = nada.
  if (item.contaEducador && item.sinal.ref_externa?.startsWith('pos:')) {
    const dele = estadoDoEducadorPelasPosicoes(ctx.posicoesDe(item.contaEducador), item.sinal.ref_externa, item.sinal.volume_origem ?? null)
    if (dele) {
      const ja = Number(e.espelhado_pct ?? 0)
      const d = decidirEspelho({ educador: dele, abertoNoCliente: Number(posicao.volume) || 0, loteOriginalCliente: Number(e.lote) || 0, jaEspelhado: ja })
      if (d.tipo !== 'nada') {
        const fechou = d.tipo === 'fechar_tudo' ? 1 : d.porCopiar
        notas.push(`${item.sinal.symbol}: educador fechou ${d.tipo === 'fechar_tudo' ? 'tudo' : `${Math.round(d.eleFechou * 100)}%`}`)
        recolha.add({ ...base, regra: 'espelho_educador', acao: 'fecho', volume: d.tipo === 'fechar_tudo' ? null : d.volume })
        e.espelhado_pct = Math.min(1, ja + fechou)
        sobrepor(ctx, item.conta, real.id, { volume: d.tipo === 'fechar_tudo' ? 0 : Math.max(0, Math.round(((posicao.volume ?? 0) - d.volume) * 100) / 100) }, agora)
        if (fechou >= 1) { item.terminado = true; recolha.entregar(ctx, agora); return notas }
      }
      // F4: o educador mexeu no SL/TP → a mesma distância à entrada REAL do cliente (só aperta o stop
      // quando o cliente tem BE/trailing próprios).
      const posDele = (ctx.posicoesDe(item.contaEducador) ?? []).find((p) => String(p.id) === item.sinal.ref_externa!.slice(4))
      if (dele.aberta && posDele) {
        const m = decidirModificacaoEspelho({
          symbol: item.sinal.symbol, direcao: item.sinal.direction,
          educador: { openPrice: Number(posDele.openPrice), stopLoss: posDele.stopLoss ?? null, takeProfit: posDele.takeProfit ?? null },
          cliente: { openPrice: Number(posicao.openPrice), stopLoss: posicao.stopLoss ?? null, takeProfit: posicao.takeProfit ?? null },
          protegerStop: item.opcoes.beAtivo || item.opcoes.trailingAtivo,
        })
        if (m.tipo === 'modificar') {
          notas.push(`${item.sinal.symbol}: educador mexeu no SL/TP → sl ${m.sl ?? '—'} tp ${m.tp ?? '—'}`)
          recolha.add({ ...base, regra: 'espelho_educador_sltp', acao: 'sl', sl: m.sl, tp: m.tp })
          sobrepor(ctx, item.conta, real.id, { sl: m.sl ?? undefined, tp: m.tp ?? undefined }, agora)
        }
      }
    }
  }

  const { notas: n2, patch } = await gerirAlvosEProtecao({
    execucao: e,
    sinal: item.sinal,
    posicao,
    opcoes: item.opcoes,
    cfg: ctx.cfg.mtmauto,
    ops: {
      fechar: async (_id, volume) => {
        recolha.add({ ...base, regra: volume != null ? `alvo${e.saidas_feitas + 1}_parcial` : 'alvo_final', acao: 'fecho', volume: volume ?? null })
        sobrepor(ctx, item.conta, real.id, { volume: volume != null ? Math.max(0, Math.round(((posicao.volume ?? 0) - volume) * 100) / 100) : 0 }, agora)
        return feito
      },
      modificar: async (_id, sl, tp) => {
        recolha.add({ ...base, regra: e.trailing_sl == null ? 'be' : 'trailing', acao: 'sl', sl: sl ?? null, tp: tp ?? null })
        if (sl != null) sobrepor(ctx, item.conta, real.id, { sl }, agora)
        return feito
      },
      esquecer: () => undefined,
      precoAoVivo: async (s) => foto.precoMedio(s),
      avisar: async () => undefined,
    },
  })
  notas.push(...n2)
  const { updated_at: _u, ...resto } = patch
  void _u
  Object.assign(e, resto)
  if (resto.estado === 'closed') item.terminado = true
  recolha.entregar(ctx, agora)
  return notas
}

/** Pip para comparar divergências, pelo tipo do item. */
export function pipDoItem(tipo: 'premium' | 't2t' | 'mtmauto' | 'subscritor' | 'provider', simbolo: string): number {
  return tipo === 'mtmauto' ? pipMtmAuto(simbolo) : pipSizeForSymbol(simbolo)
}
