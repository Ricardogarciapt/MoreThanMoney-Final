/**
 * MTM Scanner — tipos do motor.
 *
 * Porte em TypeScript do estudo Pine v5 OFICIAL «MoreThanMoney - Scanner V3.5»
 * (docs/pine/mtm-scanner-v3.5.pine; publicado como PUB;134fd950920e435694c40be33e3aa98f).
 *
 * Convenção (igual ao Sensei e ao GoldKiller): séries alinhadas com `velas` (índice = bar_index do
 * Pine), `na` = NaN, tempo em SEGUNDOS unix.
 */
import type { Vela } from '../comum/velas'

export type { Vela }

export type LadoMS = 'BUY' | 'SELL'
export type ExibirFases = 'Completo' | 'Detalhado' | 'Nenhum'
export type FonteEntradaMS = 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4'
export type EstiloLinhaMS = 'solid' | 'dashed' | 'dotted'

/** Inputs com os MESMOS nomes e defaults do Pine (nome da variável Pine → campo). */
export interface InputsMTMScanner {
  /** «Período do POC» */
  lengthPOC: number
  /** «Exibir Fases» do grupo «Fase de Momentum» (bSh) */
  bSh: ExibirFases
  /**
   * plotshape(S.bSC / S.sSC, style=shape.circle) — «Reversão Possivel Compra/Venda». No Pine não é
   * input (desliga-se no separador Estilo do TradingView); aqui é um interruptor, ligado como no Pine.
   */
  mostrarReversao: boolean

  // ==== CONFIGURAÇÃO ATR ====
  useATR: boolean
  atrPeriod: number
  atrMultiplierSL: number
  tp1RR: number
  tp2RR: number
  tp3RR: number
  showTP1: boolean
  showTP2: boolean
  showTP3: boolean

  // ===== DEFINIÇÕES =====
  entry_source: FonteEntradaMS
  box_length: number
  box_length2: number
  use_cstm_entry: boolean
  custom_entry: number

  // === RISK:REWARD === (só use_RR tem efeito: esconde TP2/TP3 no modo percentagem)
  use_RR: boolean

  // === TAKEPROFIT ===
  use_TPs: boolean
  useTp1: boolean
  useTp2: boolean
  useTp3: boolean
  slx: number
  tp1x: number
  tp2x: number
  tp3x: number
  tp4x: number
  tp5x: number

  // ====== ALERTAS ======
  long_alert: boolean
  short_alert: boolean
  order_type: 'LIMIT' | 'MARKET'
  alertsOn: boolean

  // ESTRUTURAS DE MERCADO
  len: number
  shortLen: number
  bullCss: string
  bearCss: string
  showChoch: boolean
  showBos: boolean
  showIdm: boolean
  idmCss: string
  showSweeps: boolean
  sweepsCss: string
  showCircles: boolean

  // ── contexto (syminfo / timeframe) ──
  simbolo: string
  /** timeframe.in_seconds() do gráfico. Se omitido, deduz-se das velas. */
  tfSegundos?: number
  /** syminfo.mintick. Se omitido, deduz-se das casas decimais dos preços. */
  mintick?: number
}

export interface DadosExtraMS {
  /** barstate.isconfirmed da ÚLTIMA vela. Por defeito pelo relógio (t + tf <= agora). */
  ultimaConfirmada?: boolean
  agoraMs?: number
}

/** O alerta JSON do Pine (f_json_sc), com os mesmos campos. */
export interface AlertaMS {
  strategy: 'MTMScanner'
  ticker: string
  timeframe: string
  action: 'buy' | 'sell'
  order_type: 'LIMIT' | 'MARKET'
  entry: number
  sl: number
  tp1: number
  tp2: number
  tp3: number
  confirmations: { 'DEMA 15>50': boolean; 'DEMA 50>238': boolean; 'Acima POC': boolean }
}

/** Um sinal B/S (ta.crossover / ta.crossunder do fecho com o POC). */
export interface SinalMTMScanner {
  barra: number
  t: number
  lado: LadoMS
  /** entry1/sl/tp1-3 calculados NA barra do sinal (o que o alerta envia). */
  entry: number
  sl: number
  tp1: number
  tp2: number
  tp3: number
  /** valid_sc do Pine */
  valido: boolean
  /** O alerta que o Pine enviaria (null com alertas desligados, lado sem alerta ou inválido). */
  alerta: AlertaMS | null
}

/** line.new + label.new da estrutura (CHoCH / BOS / IDM / x). */
export interface EventoEstruturaMS {
  tipo: 'CHoCH' | 'BOS' | 'IDM' | 'SWEEP'
  lado: 'bull' | 'bear'
  /** barra onde o evento é confirmado (n no Pine) */
  barra: number
  barraInicio: number
  barraFim: number
  preco: number
  texto: string
  cor: string
  estilo: EstiloLinhaMS
  /** label.style_label_down (texto por cima) ou _up (texto por baixo) */
  etiqueta: 'acima' | 'abaixo'
  /** onde fica a etiqueta: int(math.avg(n, x1)) no histórico, n / n+15 nas extensões */
  barraEtiqueta: number
  /** extensões redesenhadas em barstate.islast (ext_choch / ext_bos / ext_idm) */
  extensao?: boolean
}

/** plot(top/btm, style_circles, offset = -len): o círculo na vela do swing. */
export interface SwingMS {
  barra: number
  preco: number
  alto: boolean
}

/** A caixa da posição desenhada em barstate.islast. */
export interface CaixaPosicaoMS {
  lado: LadoMS
  /** barra do et = time[box_length2] */
  barraInicio: number
  /** time + dt·2 em barras (dt = time − time[box_length]); pode passar da última vela */
  barraFim: number
  /** time + dt·4 */
  barraEtiqueta: number
  entry: number
  sl: number
  /** TP a desenhar, pela ordem do Pine; `fill` = transparência do linefill até à entrada (null = sem fill) */
  tps: Array<{ k: 1 | 2 | 3; preco: number; texto: string; fill: number | null }>
}

export interface EstadoUltimaMS {
  barra: number
  /** A última vela estava aberta: o estado é o da última vela FECHADA. */
  provisoria: boolean
  dema15: number
  dema50: number
  dema238: number
  poc: number
  atr: number
  /** S.bSC / S.sSC no fim da última barra calculada (na = NaN) */
  bSC: number
  sSC: number
  /** os da estrutura: 1 = alta (depois de CHoCH de alta), 0 = baixa */
  os: number
  /** var string position */
  position: LadoMS | null
  /** o último sinal B/S (null antes do 1.º) */
  sinal: SinalMTMScanner | null
  /** desde a vela a seguir ao sinal: o preço já tocou o SL / os TP1-3? */
  slTocado: boolean
  tpTocado: [boolean, boolean, boolean]
}

export interface ResultadoMTMScanner {
  inputs: InputsMTMScanner
  mintick: number
  tfSegundos: number
  series: {
    dema15: number[]
    dema50: number[]
    dema238: number[]
    poc: number[]
    atr: number[]
    /** S.bSC / S.sSC por barra (NaN = na) */
    bSC: number[]
    sSC: number[]
  }
  sinais: SinalMTMScanner[]
  estrutura: EventoEstruturaMS[]
  swings: SwingMS[]
  caixa: CaixaPosicaoMS | null
  ultima: EstadoUltimaMS | null
}
