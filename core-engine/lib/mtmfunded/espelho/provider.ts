/**
 * ESPELHO PROVIDER — as decisões, puras.
 *
 * A pergunta do dono (15/09): «uma conta MTM Funded que espelha a estratégia pode passar a ser o
 * provider?» — isto é, a gestão (break-even, trailing, parciais) correr NO NOSSO motor, ao nosso
 * preço, e daí propagar-se para TradeLocker/MT5/MT4 sem passar pela gestão da MetaApi.
 *
 * Para responder sem arriscar dinheiro, cada estratégia do MTM Auto ganha UMA conta simulada da
 * casa (mtmauto_providers.espelho_funded_account_id, migração 082) que:
 *
 *   · copia a ENTRADA da conta-mestre no instante em que o streaming a empurra (sem debounce);
 *   · gere a posição com as regras DA ESTRATÉGIA (as mesmas colunas que o MTM Auto usa:
 *     be_gatilho, trailing_arranca_pips, trailing_distancia_pips, trailing_passo_pips, saidas_pct,
 *     trailing_tempo_real) a cada tick do nosso feed — independente da gestão que a mestre faz;
 *   · segue os fechos DISCRICIONÁRIOS do educador (deal com razão humana), não os de gestão;
 *   · no fim de cada trade grava UMA linha em `espelho_comparacao`: mestre vs espelho.
 *
 * Este ficheiro não importa Supabase nem Next: o motor do VPS empacota-o e o teste corre-o com
 * ticks gravados (lib/mtmfunded/__tests__/espelho-provider.check.ts).
 *
 * A gestão reutiliza `decidirGestao` (avancadas.ts) para parciais e break-even. O trailing é feito
 * aqui porque a regra do MTM Auto é diferente da do WebTrader: passo configurável (0,5 pip por
 * defeito, não 1/10 da distância), distância por defeito em fracção do risco, e nunca abaixo do
 * piso do break-even. O estado vive em memória (compatível com a 072 por aplicar): só o SL e os
 * factos (parcial, fecho) vão para a base, pelas funções atómicas de sempre.
 */
import { decidirGestao, GESTAO_VAZIA, type Gestao, type TpParcial } from '../simulado/avancadas'
import { precoDeFecho, type Direcao, type MapaPrecos, type Preco, type Simbolo } from '../simulado/matematica'
import type { PosicaoMestre } from './calculo'

// ── regras da estratégia ────────────────────────────────────────────────────

/** Constantes do motor do MTM Auto (mtm-auto/lib/motor.ts) — mesmos nomes, mesmos defaults. */
export const BE_BUFFER_PIPS = 5
export const BE_RACIO = 0.4
export const TRAIL_RACIO = 0.5
export const PASSO_PADRAO_PIPS = 0.5

export interface RegrasEstrategia {
  slug: string
  /** Break-even depois do TP n (1..3). null = só pelo gatilho em pips/risco. */
  beDepoisTp: number | null
  trailingArrancaPips: number | null
  trailingDistanciaPips: number | null
  trailingPassoPips: number | null
  saidasPct: number[]
  /** true = SL a cada tick (máx. 1 escrita/s); false = cadência do cron do MTM Auto (5 s). */
  trailingTempoReal: boolean
}

const numOuNull = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Uma linha de mtmauto_providers → regras. Os defaults são os do MTM Auto. */
export function regrasDoProvider(r: Record<string, unknown>): RegrasEstrategia {
  const be = numOuNull(r.be_gatilho)
  const saidas = Array.isArray(r.saidas_pct) ? (r.saidas_pct as unknown[]).map(Number).filter((x) => x >= 0) : []
  return {
    slug: String(r.slug ?? ''),
    beDepoisTp: be != null ? Math.min(3, Math.max(1, Math.round(be))) : null,
    trailingArrancaPips: numOuNull(r.trailing_arranca_pips),
    trailingDistanciaPips: numOuNull(r.trailing_distancia_pips),
    trailingPassoPips: numOuNull(r.trailing_passo_pips),
    saidasPct: saidas.length ? saidas : [50, 30, 20],
    trailingTempoReal: r.trailing_tempo_real === true,
  }
}

/** Configuração do espelho por estratégia (mtmauto_providers.espelho_config). */
export interface ConfigEspelhoProvider {
  /** Que fechos da mestre o espelho segue: humanos (defeito), todos, ou nenhum. */
  seguirFechos: 'humanos' | 'todos' | 'nenhum'
  /** Seguir os parciais discricionários da mestre (por defeito não: os parciais são nossos). */
  seguirParciais: boolean
  /** Copiar o SL/TP inicial da mestre (defeito sim). */
  copiarNiveisIniciais: boolean
}

export function configEspelho(v: unknown): ConfigEspelhoProvider {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const sf = String(o.seguirFechos ?? 'humanos')
  return {
    seguirFechos: sf === 'todos' || sf === 'nenhum' ? sf : 'humanos',
    seguirParciais: o.seguirParciais === true,
    copiarNiveisIniciais: o.copiarNiveisIniciais !== false,
  }
}

/** Razões de deal que são decisão de uma PESSOA (não SL/TP/stop-out nem API/EA de gestão). */
const RAZOES_HUMANAS = new Set(['DEAL_REASON_CLIENT', 'DEAL_REASON_MOBILE', 'DEAL_REASON_WEB'])
export function razaoHumana(reason: string | null | undefined): boolean {
  return RAZOES_HUMANAS.has(String(reason ?? ''))
}
export function razaoDeGestao(reason: string | null | undefined): 'sl' | 'tp' | 'stop_out' | 'expert' | 'humana' | 'desconhecida' {
  const r = String(reason ?? '')
  if (r === 'DEAL_REASON_SL') return 'sl'
  if (r === 'DEAL_REASON_TP') return 'tp'
  if (r === 'DEAL_REASON_SO') return 'stop_out'
  if (r === 'DEAL_REASON_EXPERT') return 'expert'
  if (RAZOES_HUMANAS.has(r)) return 'humana'
  return 'desconhecida'
}

/** O espelho fecha (ou parcializa) com este fecho da mestre? */
export function seguirSaidaMestre(cfg: ConfigEspelhoProvider, reason: string | null | undefined, total: boolean): boolean {
  if (cfg.seguirFechos === 'nenhum') return false
  if (!total && !cfg.seguirParciais) return false
  if (cfg.seguirFechos === 'todos') return true
  return razaoHumana(reason)
}

// ── alvos e gestão inicial ──────────────────────────────────────────────────

/**
 * Os alvos da trade: os TPs do sinal (quando o MTM Auto o tem) e o TP da mestre, por ordem a
 * afastar-se da entrada, só do lado do lucro, sem repetidos.
 */
export function alvosDaTrade(direcao: Direcao, entrada: number, tpsSinal: number[] | null | undefined, tpMestre: number | null): number[] {
  const sinal = direcao === 'buy' ? 1 : -1
  const todos = [...(tpsSinal ?? []), ...(tpMestre != null ? [tpMestre] : [])]
    .map(Number).filter((t) => Number.isFinite(t) && t > 0 && (t - entrada) * sinal > 0)
  const unicos = [...new Set(todos.map((t) => Math.round(t * 1e6) / 1e6))]
  return unicos.sort((a, b) => (a - b) * sinal).slice(0, 3)
}

/** A escada de saídas normalizada ao número de alvos (um sinal de 2 alvos com escada de 3). */
export function escadaDeSaidas(saidasPct: number[], nAlvos: number): number[] {
  if (nAlvos <= 0) return []
  const base = saidasPct.slice(0, nAlvos)
  while (base.length < nAlvos) base.push(0)
  const soma = base.reduce((a, b) => a + b, 0)
  if (!(soma > 0)) return base.map(() => Math.round((100 / nAlvos) * 100) / 100)
  const pcts = base.map((p) => Math.round(((p / soma) * 100) * 100) / 100)
  // o último fecha o resto: somar exactamente 100 evita um resíduo aberto para sempre
  pcts[pcts.length - 1] = Math.round((100 - pcts.slice(0, -1).reduce((a, b) => a + b, 0)) * 100) / 100
  return pcts
}

export interface EstadoGestao {
  gestao: Gestao
  /** Gatilho da protecção (break-even + arranque do trailing), em PREÇO. null = nunca. */
  gatilho: number | null
  /** Distância do trailing em preço (null = dinâmica: metade do lucro). */
  distancia: number | null
  passo: number
  /** Piso do BE: entrada + buffer a favor. */
  pisoBe: number
  trailingAtivo: boolean
  ultimaEscritaSlEm: number
  alvos: number[]
}

/** A gestão de uma posição do espelho, calculada à abertura. */
export function gestaoInicial(
  regras: RegrasEstrategia, s: Simbolo,
  pos: { direcao: Direcao; entrada: number; sl: number | null; volume: number },
  alvos: number[],
): EstadoGestao {
  const pip = s.pip_size
  const sinal = pos.direcao === 'buy' ? 1 : -1
  const f = Math.pow(10, s.digits)
  const arred = (x: number) => Math.round(x * f) / f
  const risco = pos.sl != null ? Math.abs(pos.entrada - pos.sl) : 0
  const gatilho = regras.trailingArrancaPips != null && regras.trailingArrancaPips > 0
    ? regras.trailingArrancaPips * pip
    : risco > 0 ? BE_RACIO * risco : null
  const distancia = regras.trailingDistanciaPips != null && regras.trailingDistanciaPips > 0
    ? regras.trailingDistanciaPips * pip
    : risco > 0 ? TRAIL_RACIO * risco : null
  const escada = escadaDeSaidas(regras.saidasPct, alvos.length)
  // Um só alvo: é o TP normal da posição (o motor fecha-a), não um parcial.
  const tps: TpParcial[] | null = alvos.length >= 2 ? alvos.map((preco, i) => ({ preco: arred(preco), pct: escada[i], atingido: false })) : null
  const gestao: Gestao = {
    ...GESTAO_VAZIA,
    be_gatilho: gatilho != null ? arred(gatilho) || pip : null,
    be_offset: arred(BE_BUFFER_PIPS * pip),
    be_no_tp1: regras.beDepoisTp === 1,
    tps,
    volume_inicial: pos.volume,
  }
  return {
    gestao, gatilho, distancia,
    passo: (regras.trailingPassoPips && regras.trailingPassoPips > 0 ? regras.trailingPassoPips : PASSO_PADRAO_PIPS) * pip,
    pisoBe: arred(pos.entrada + sinal * BE_BUFFER_PIPS * pip),
    trailingAtivo: true,
    ultimaEscritaSlEm: 0,
    alvos,
  }
}

export interface PosicaoEspelho {
  id: string
  direcao: Direcao
  entrada: number
  volume: number
  sl: number | null
  tp: number | null
}

export interface DecisaoProvider {
  parciais: Array<{ indice: number; volume: number; preco: number; pnl: number; fechaTudo: boolean }>
  tps: TpParcial[] | null
  volumeRestante: number
  novoSl: number | null
  motivoSl: 'break_even' | 'trailing' | null
  beFeito: boolean
  /** O SL mexeu mas a escrita fica para depois (cadência). O próximo tick decide outra vez. */
  slAdiado: boolean
}

/**
 * O que a gestão da estratégia faz a UMA posição do espelho neste preço. Não fecha por SL nem
 * pelo TP final — isso é do motor (avaliacao.ts), que lê o SL que isto escreve.
 */
export function decidirGestaoProvider(
  pos: PosicaoEspelho, est: EstadoGestao, regras: RegrasEstrategia, s: Simbolo, p: Preco, precos: MapaPrecos, agoraMs: number,
): DecisaoProvider {
  const sinal = pos.direcao === 'buy' ? 1 : -1
  const x = precoDeFecho(pos.direcao, p)
  const favor = (x - pos.entrada) * sinal
  const f = Math.pow(10, s.digits)
  const arred = (v: number) => Math.round(v * f) / f

  // BE depois do TP n>1: arma-se quando o TP n (já marcado) foi atingido.
  const g: Gestao = { ...est.gestao }
  const tpN = regras.beDepoisTp && regras.beDepoisTp > 1 ? g.tps?.[regras.beDepoisTp - 1] : null
  if (tpN?.atingido && !g.be_feito) g.be_gatilho = Math.min(g.be_gatilho ?? Infinity, Math.max(favor, 1 / f))

  // parciais + break-even (avancadas.ts)
  const d = decidirGestao({ id: pos.id, symbol: s.symbol, direcao: pos.direcao, volume: pos.volume, preco_entrada: pos.entrada, sl: pos.sl, tp: pos.tp, gestao: g }, s, p, precos)
  const out: DecisaoProvider = {
    parciais: d.parciais, tps: d.tps, volumeRestante: d.volumeRestante,
    novoSl: d.novoSl, motivoSl: d.motivoSl === 'break_even' ? 'break_even' : null, beFeito: d.beFeito, slAdiado: false,
  }
  if (out.volumeRestante <= 0) return out

  // trailing (regra do MTM Auto): arranca no gatilho, nunca abaixo do piso do BE, passo configurável
  let sl = out.novoSl ?? pos.sl
  if (est.trailingAtivo && est.gatilho != null && favor >= est.gatilho - 1e-12) {
    const distancia = est.distancia ?? favor / 2
    const candidato = x - sinal * distancia
    const alvo = arred(sinal > 0 ? Math.max(candidato, est.pisoBe) : Math.min(candidato, est.pisoBe))
    const melhora = sl == null ? true : (alvo - sl) * sinal > est.passo + 1e-12
    // nunca do lado errado do preço (fechava no mesmo tick)
    if (melhora && (x - alvo) * sinal > 0) {
      sl = alvo
      out.novoSl = alvo
      if (out.motivoSl == null) out.motivoSl = 'trailing'
    }
  }

  // cadência das escritas: o BE passa sempre; o trailing no máximo 1/s (tempo real) ou 1/5 s
  if (out.novoSl != null && out.motivoSl === 'trailing') {
    const cadencia = regras.trailingTempoReal ? 1000 : 5000
    if (agoraMs - est.ultimaEscritaSlEm < cadencia) {
      out.novoSl = null
      out.motivoSl = null
      out.slAdiado = true
    }
  }
  return out
}

// ── leitura da mestre: diff do terminalState ─────────────────────────────────

export interface ConhecidaMestre { volume: number; sl: number | null; tp: number | null }

export interface DiffMestre {
  novas: PosicaoMestre[]
  alteradas: Array<{ atual: PosicaoMestre; antes: ConhecidaMestre; slMudou: boolean; tpMudou: boolean; volumeDesceu: boolean }>
  removidas: string[]
}

/**
 * Compara o que se conhecia com o terminalState agora. `null` (não sincronizada) = NADA muda —
 * nunca se marca uma posição como fechada por uma leitura falhada. Serve para cada evento e para
 * a ressincronização depois de uma queda (posições abertas/fechadas enquanto estava caída).
 */
export function diffMestre(conhecidas: Map<string, ConhecidaMestre>, lidas: PosicaoMestre[] | null): DiffMestre {
  const out: DiffMestre = { novas: [], alteradas: [], removidas: [] }
  if (!lidas) return out
  const vistas = new Set<string>()
  for (const p of lidas) {
    vistas.add(p.id)
    const antes = conhecidas.get(p.id)
    if (!antes) { out.novas.push(p); continue }
    const slMudou = !mesmoNivel(antes.sl, p.sl)
    const tpMudou = !mesmoNivel(antes.tp, p.tp)
    const volumeDesceu = p.volume < antes.volume - 1e-9
    if (slMudou || tpMudou || volumeDesceu) out.alteradas.push({ atual: p, antes, slMudou, tpMudou, volumeDesceu })
  }
  for (const id of conhecidas.keys()) if (!vistas.has(id)) out.removidas.push(id)
  return out
}

const mesmoNivel = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-9)

// ── desfecho e comparação ────────────────────────────────────────────────────

export interface Saida { preco: number; volume: number; em: string; motivo: string }
export interface MovimentoSl { sl: number | null; tp?: number | null; em: string; motivo?: string; latenciaMs?: number | null }

/** Pips ponderados pelo volume de abertura (uma saída de 50% a +20 pips vale +10). */
export function pipsPonderados(direcao: Direcao, entrada: number, saidas: Saida[], volumeAbertura: number, pip: number): number | null {
  if (!saidas.length || !(volumeAbertura > 0) || !(pip > 0)) return null
  const sinal = direcao === 'buy' ? 1 : -1
  const total = saidas.reduce((a, s) => a + s.volume * ((s.preco - entrada) * sinal) / pip, 0)
  return Math.round((total / volumeAbertura) * 10) / 10
}

export interface LinhaComparacao {
  estrategia: string
  master_account_id: string
  master_position_id: string
  espelho_account_id: string
  funded_position_id: string | null
  symbol: string
  direcao: Direcao
  master_volume: number
  espelho_volume: number | null
  master_entrada: number
  master_aberta_em: string | null
  espelho_entrada: number | null
  espelho_aberta_em: string | null
  master_saidas: Saida[]
  espelho_saidas: Saida[]
  master_sl_movimentos: MovimentoSl[]
  espelho_sl_movimentos: MovimentoSl[]
  master_pips: number | null
  espelho_pips: number | null
  diferenca_pips: number | null
  master_fechada_em: string | null
  espelho_fechada_em: string | null
  /** entrada: evento recebido → posição escrita; rede: hora da mestre → evento recebido. */
  latencia_entrada_ms: number | null
  latencia_rede_ms: number | null
  deslize_entrada_pips: number | null
  estado: 'completa' | 'so_mestre' | 'so_espelho' | 'reinicio'
  detalhe: Record<string, unknown>
}

export function montarComparacao(i: {
  estrategia: string; masterAccountId: string; espelhoAccountId: string; pip: number
  mestre: { id: string; symbol: string; direcao: Direcao; volumeAbertura: number; entrada: number; abertaEm: string | null; saidas: Saida[]; slMov: MovimentoSl[]; fechadaEm: string | null }
  espelho: { positionId: string | null; volumeAbertura: number | null; entrada: number | null; abertaEm: string | null; saidas: Saida[]; slMov: MovimentoSl[]; fechadaEm: string | null } | null
  latenciaEntradaMs: number | null; latenciaRedeMs: number | null; reinicio?: boolean; detalhe?: Record<string, unknown>
}): LinhaComparacao {
  const m = i.mestre
  const e = i.espelho
  const mp = pipsPonderados(m.direcao, m.entrada, m.saidas, m.volumeAbertura, i.pip)
  const ep = e && e.entrada != null && e.volumeAbertura ? pipsPonderados(m.direcao, e.entrada, e.saidas, e.volumeAbertura, i.pip) : null
  const sinal = m.direcao === 'buy' ? 1 : -1
  return {
    estrategia: i.estrategia, master_account_id: i.masterAccountId, master_position_id: m.id,
    espelho_account_id: i.espelhoAccountId, funded_position_id: e?.positionId ?? null,
    symbol: m.symbol, direcao: m.direcao, master_volume: m.volumeAbertura, espelho_volume: e?.volumeAbertura ?? null,
    master_entrada: m.entrada, master_aberta_em: m.abertaEm, espelho_entrada: e?.entrada ?? null, espelho_aberta_em: e?.abertaEm ?? null,
    master_saidas: m.saidas, espelho_saidas: e?.saidas ?? [], master_sl_movimentos: m.slMov, espelho_sl_movimentos: e?.slMov ?? [],
    master_pips: mp, espelho_pips: ep, diferenca_pips: mp != null && ep != null ? Math.round((ep - mp) * 10) / 10 : null,
    master_fechada_em: m.fechadaEm, espelho_fechada_em: e?.fechadaEm ?? null,
    latencia_entrada_ms: i.latenciaEntradaMs, latencia_rede_ms: i.latenciaRedeMs,
    // deslize positivo = o espelho entrou PIOR do que a mestre
    deslize_entrada_pips: e?.entrada != null ? Math.round(((e.entrada - m.entrada) * sinal / i.pip) * 10) / 10 : null,
    estado: i.reinicio ? 'reinicio' : !e ? 'so_mestre' : m.saidas.length === 0 && !m.fechadaEm ? 'so_espelho' : 'completa',
    detalhe: i.detalhe ?? {},
  }
}

// ── latências ────────────────────────────────────────────────────────────────

export interface ResumoLatencia { n: number; p50: number | null; p95: number | null; max: number | null }

/** Percentil sobre uma lista (cópia ordenada). */
export function percentil(v: number[], p: number): number | null {
  const x = v.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (!x.length) return null
  const i = Math.min(x.length - 1, Math.max(0, Math.ceil((p / 100) * x.length) - 1))
  return x[i]
}

export function resumirLatencias(v: number[]): ResumoLatencia {
  const x = v.filter((n) => Number.isFinite(n))
  return { n: x.length, p50: percentil(x, 50), p95: percentil(x, 95), max: x.length ? Math.max(...x) : null }
}

/** Anel das últimas N amostras (memória fixa; o pulso publica o resumo 1×/min). */
export class Latencias {
  private v: number[] = []
  private i = 0
  constructor(private readonly max = 500) {}
  registar(ms: number | null | undefined): void {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return
    if (this.v.length < this.max) this.v.push(ms)
    else { this.v[this.i] = ms; this.i = (this.i + 1) % this.max }
  }
  resumo(): ResumoLatencia { return resumirLatencias(this.v) }
}

/** ms entre dois instantes (ISO, Date ou epoch), ou null. */
export function msEntre(de: string | number | Date | null | undefined, ate: string | number | Date | null | undefined): number | null {
  if (de == null || ate == null) return null
  const a = typeof de === 'number' ? de : new Date(de).getTime()
  const b = typeof ate === 'number' ? ate : new Date(ate).getTime()
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round(b - a) : null
}

// ── veredicto ────────────────────────────────────────────────────────────────

/**
 * Os limiares do «alinhado» — OS MESMOS da vista SQL `espelho_veredito` (migração 082), que é o
 * que a guarda de `mtmauto_providers.fonte_execucao = 'espelho'` lê. Mudar um obriga a mudar o outro.
 */
export interface CriteriosVeredicto {
  /** Trades completas (mestre e espelho fechados) no mínimo. */
  tradesMin: number
  /** |média de (pips espelho − pips mestre)| no máximo. */
  diferencaMediaAbsMaxPips: number
  /** p95 de max(evento→escrita da entrada, propagação outbox→processado) no máximo. */
  latenciaP95Ms: number
  /** Trades da mestre sem espelho (fechos perdidos) no máximo. */
  tradesPerdidasMax: number
}

export const CRITERIOS_PADRAO: CriteriosVeredicto = { tradesMin: 30, diferencaMediaAbsMaxPips: 3, latenciaP95Ms: 1500, tradesPerdidasMax: 0 }

export interface Veredicto {
  alinhado: boolean
  razoes: string[]
  medidas: {
    trades: number; completas: number; perdidas: number
    latenciaEntrada: ResumoLatencia; deslizeEntrada: ResumoLatencia
    masterPipsTotal: number; espelhoPipsTotal: number; diferencaMedia: number | null; piorDiferenca: number | null
    propagacao: ResumoLatencia
  }
}

/**
 * «O espelho está alinhado com a mestre?» — só quando TODOS os critérios passam: amostra
 * suficiente, nenhuma trade da mestre perdida, diferença média pequena (nos DOIS sentidos: um
 * espelho muito melhor também não está a espelhar), e entrada + propagação para fora rápidas.
 * Sem medição de propagação (nenhuma rota em sombra a partir da conta espelho) não há veredicto.
 */
export function veredictoEspelho(
  linhas: Array<Pick<LinhaComparacao, 'estado' | 'latencia_entrada_ms' | 'deslize_entrada_pips' | 'master_pips' | 'espelho_pips' | 'diferenca_pips'>>,
  propagacaoMs: number[], c: CriteriosVeredicto = CRITERIOS_PADRAO,
): Veredicto {
  const completas = linhas.filter((l) => l.estado === 'completa')
  const perdidas = linhas.filter((l) => l.estado === 'so_mestre').length
  const latenciaEntrada = resumirLatencias(completas.map((l) => Number(l.latencia_entrada_ms)).filter((n) => l0(n)))
  const deslizeEntrada = resumirLatencias(completas.map((l) => Math.max(0, Number(l.deslize_entrada_pips))).filter((n) => Number.isFinite(n)))
  const difs = completas.map((l) => Number(l.diferenca_pips)).filter((n) => Number.isFinite(n))
  const diferencaMedia = difs.length ? Math.round((difs.reduce((a, b) => a + b, 0) / difs.length) * 10) / 10 : null
  const piorDiferenca = difs.length ? Math.min(...difs) : null
  const propagacao = resumirLatencias(propagacaoMs)
  const soma = (k: 'master_pips' | 'espelho_pips') => Math.round(completas.reduce((a, l) => a + (Number(l[k]) || 0), 0) * 10) / 10
  const razoes: string[] = []
  if (completas.length < c.tradesMin) razoes.push(`amostra curta: ${completas.length}/${c.tradesMin} trades completas`)
  if (perdidas > c.tradesPerdidasMax) razoes.push(`${perdidas} trade(s) da mestre sem espelho`)
  if (diferencaMedia == null || Math.abs(diferencaMedia) > c.diferencaMediaAbsMaxPips) razoes.push(`diferença média ${diferencaMedia ?? '—'} pips/trade (limite ±${c.diferencaMediaAbsMaxPips})`)
  if (latenciaEntrada.p95 != null && latenciaEntrada.p95 > c.latenciaP95Ms) razoes.push(`entrada lenta: p95 ${latenciaEntrada.p95} ms > ${c.latenciaP95Ms} ms`)
  if (propagacao.n === 0) razoes.push('sem medição de propagação (nenhuma rota em sombra a partir da conta espelho)')
  else if (propagacao.p95 != null && propagacao.p95 > c.latenciaP95Ms) razoes.push(`propagação lenta: p95 ${propagacao.p95} ms > ${c.latenciaP95Ms} ms`)
  return {
    alinhado: razoes.length === 0,
    razoes,
    medidas: {
      trades: linhas.length, completas: completas.length, perdidas, latenciaEntrada, deslizeEntrada,
      masterPipsTotal: soma('master_pips'), espelhoPipsTotal: soma('espelho_pips'), diferencaMedia, piorDiferenca, propagacao,
    },
  }
}

const l0 = (n: number) => Number.isFinite(n) && n >= 0
