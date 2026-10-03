/**
 * MTM GoldKiller — tipos do motor.
 *
 * Porte em TypeScript do estudo Pine v5 publicado no TradingView como «MTM Gold Killer»
 * (PUB;a3eaa6af54de4202a2c2f807fd8baa08). Fonte portada: docs/pine/mtm-goldkiller-alertas.pine
 * («MTM Gold Killer - Alertas»), cuja lista de inputs bate com a linha de estado do publicado:
 * «HLCC4 -4 80 0 3 10 Disabled 75» (os bool não aparecem na linha de estado).
 *
 * Convenção (igual ao Sensei): séries alinhadas com `velas` (índice = bar_index do Pine), `na` = NaN,
 * tempo em SEGUNDOS unix.
 */
import type { Vela } from '../comum/velas'

export type { Vela }

export type FonteGK = 'Smooth' | 'Close' | 'Open' | 'High' | 'Low' | 'Hl2' | 'HLC3' | 'OHLC4' | 'HLCC4'
export type NivelCustomGK = 'Average' | 'Average + STDEV' | 'Percentile' | 'Disabled'
export type LadoGK = 'BUY' | 'SELL'

/** Inputs com os MESMOS nomes e defaults do Pine (nome da variável Pine → campo). */
export interface InputsGoldKiller {
  /** «Source» */
  source: FonteGK
  /** «Show Trailing Stop» — declarado no Pine mas NUNCA usado (nenhum plot lê `stop`). */
  stop: boolean
  /** «Levels» −5…5: positivo mostra do 25 para cima, negativo esconde a partir do 25. */
  show: number
  /** «Scale» 1-100 (o Pine divide por 100). */
  scale: number
  /** «Window Length» — 0 = histórico inteiro. */
  window: number
  /** «Unique» — só afeta as pernas de baixa (e mesmo aí os dois ramos fazem o mesmo; ver motor). */
  unique: boolean
  /** «Multiplier» do Supertrend */
  mult: number
  /** «ATR Length» */
  atr: number
  /** «Custom Level» */
  average: NivelCustomGK
  /** «Percent Rank» 0-100 */
  rank: number
  /** «Emitir alertas para o site MTM» — aqui só decide se os sinais levam o JSON do alerta. */
  alertsOn: boolean

  // ── contexto (syminfo / timeframe) ──
  simbolo: string
  /** timeframe.in_seconds() do gráfico. Se omitido, deduz-se das velas. */
  tfSegundos?: number
  /** syminfo.mintick. Se omitido, deduz-se das casas decimais dos preços. */
  mintick?: number
}

export interface DadosExtraGK {
  /** barstate.isconfirmed da ÚLTIMA vela. Por defeito pelo relógio (t + tf <= agora). */
  ultimaConfirmada?: boolean
  /** Relógio para o cálculo acima (ms). Por defeito Date.now(). */
  agoraMs?: number
}

export const PERCENTIS_GK = [25, 50, 75, 90, 100] as const
export type PercentilGK = (typeof PERCENTIS_GK)[number]
/** Uma série por nível: p25 … p100 (o «Gain 25th» / «Drawdown 25th» do Pine). */
export type SeriesNivel = Record<`p${PercentilGK}`, number[]>

/** O alerta JSON do Pine (f_json_gk), com os mesmos campos. */
export interface AlertaGK {
  strategy: 'GoldKiller'
  ticker: string
  timeframe: string
  action: 'buy' | 'sell'
  entry: number
  sl: number
  tp1: number
  tp2: number
  tp3: number
  confirmations: { Supertrend: boolean; Momentum: boolean }
}

/** Uma viragem do Supertrend (plotshape BUY / SELL). */
export interface SinalGoldKiller {
  barra: number
  t: number
  lado: LadoGK
  /** Entrada = Center Line; SL = Drawdown 50; TP1/2/3 = Gain 50/75/100 (níveis da barra da viragem). */
  entry: number
  sl: number
  tp1: number
  tp2: number
  tp3: number
  /** valid_gk do Pine: todos os níveis existem (sem isto o alerta não sai, mas a etiqueta sai). */
  valido: boolean
  /** O alerta que o Pine enviaria (null com alertsOn desligado ou sinal inválido). */
  alerta: AlertaGK | null
}

export interface EstadoUltimaGK {
  barra: number
  /** A última vela estava aberta: repetiu os níveis da última fechada (ver motor). */
  provisoria: boolean
  /** super_trend.state: true = baixa (Supertrend por cima), false = alta. */
  baixa: boolean
  entrada: number
  superTrend: number
  ganho: Record<`p${PercentilGK}`, number>
  perda: Record<`p${PercentilGK}`, number>
  /** percent(close, entry) — o «signal» do Pine */
  variacao: number
  /** quantas pernas completas entraram nas estatísticas (alta = bullish_target, baixa = bearish_target) */
  pernasAlta: number
  pernasBaixa: number
  /** a viragem que abriu a perna atual (null antes da 1.ª) */
  sinal: SinalGoldKiller | null
  /** desde a vela a seguir à viragem: o preço já tocou o SL / os TP1-3? */
  slTocado: boolean
  tpTocado: [boolean, boolean, boolean]
}

export interface ResultadoGoldKiller {
  inputs: InputsGoldKiller
  mintick: number
  tfSegundos: number
  /** plots que o `show` deixa desenhar */
  visiveis: Record<`p${PercentilGK}`, boolean>
  series: {
    fonte: number[]
    atr: number[]
    superTrend: number[]
    /** super_trend.state por barra (true = baixa) */
    baixa: boolean[]
    /** Center Line (target_25.entry) */
    entrada: number[]
    ganho: SeriesNivel
    perda: SeriesNivel
    /** Average Gain / Average Drawdown (só com average != Disabled; senão na) */
    ganhoCustom: number[]
    perdaCustom: number[]
    /** STDEV Gains / STDEV Drawdown (só com «Average + STDEV»; senão na) */
    ganhoStdev: number[]
    perdaStdev: number[]
    /** percent(close, entry) */
    variacao: number[]
  }
  sinais: SinalGoldKiller[]
  ultima: EstadoUltimaGK | null
}
