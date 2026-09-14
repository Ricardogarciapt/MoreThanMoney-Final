/**
 * MTM Sensei — tipos do motor.
 *
 * Porte em TypeScript do estudo Pine v6 publicado no TradingView como «MTM Sensei v3»
 * (PUB;0aba45d8eeed42368922a344f547eeb6). A fonte portada é a versão ajustada da auditoria
 * de 2026-08-03 (docs/pine/MTM-Sensei-X-ajustado.txt), a única cuja lista de inputs bate com a
 * linha de estado do script publicado ("12 14 240 0000-2400 15 200 3 Momentum 9 13 1 0,25 89 …").
 *
 * Convenção: todas as séries são arrays alinhados com `velas` (índice = bar_index do Pine) e o
 * `na` do Pine é `NaN`. Tempo em SEGUNDOS unix (igual à rota /api/mtmfunded/simulado/velas).
 */

/** Uma vela OHLCV. `v` é o volume (tick volume em forex/CFD); sem volume, usar 0. */
export interface Vela {
  t: number
  o: number
  h: number
  l: number
  c: number
  v?: number
}

export type Tema = 'Dark' | 'Classic' | 'Light' | 'Pop'
export type EstiloTrading = 'Agressivo' | 'Scalp' | 'Intraday' | 'Swing' | 'Conservador' | 'Personalizado'
export type ModoFase = 'Momentum' | 'Exaustao'
export type ModoExibicao = 'Mostrar Ativo' | 'Mostrar Tudo'
export type ModoRisco = 'ATR' | 'Percent'
export type ModoBE = 'Exit 1' | 'Exit 2' | 'Exit 3' | 'Points'
export type Lado = 'BUY' | 'SELL'

/**
 * Inputs com os MESMOS nomes e defaults do Pine (nome da variável Pine → campo).
 * Os campos marcados «contexto» não existem como input no Pine: são o `syminfo`/`timeframe`
 * que o TradingView dá de graça e que aqui temos de passar.
 */
export interface InputsSensei {
  // TEMA / ESTILO / EXIBIÇÃO
  themeMode: Tema
  autoOpt: boolean
  tradeStyle: EstiloTrading
  signalDisplay: ModoExibicao
  // NÚCLEO
  minScore: number
  lengthPOC: number
  showDEMA: boolean
  showPOC: boolean
  // FILTROS DE QUALIDADE
  useHTF: boolean
  /** Timeframe HTF em minutos (Pine: input.timeframe('240')). */
  htfTF: number
  useSession: boolean
  sessStr: string
  useChop: boolean
  adxChopMin: number
  confirmClose: boolean
  htfEmaLen: number
  // VIÉS DE LADO
  allowBuy: boolean
  allowSell: boolean
  sellExtra: number
  strictAuto: boolean
  // FASE
  phaseModeInput: ModoFase
  momCount: number
  exhCount: number
  showPhaseLbls: boolean
  // ORDER FLOW
  useLTFOF: boolean
  /** Timeframe do order flow em minutos (Pine: input.timeframe('1')). */
  ltfRes: number
  ofImbThr: number
  // SENSEI BANDS
  senseiLen: number
  senseiType: 'Active' | 'Passive'
  showBands: boolean
  showCloud: boolean
  senseiBullCol: string
  senseiBearCol: string
  // GESTÃO DE RISCO
  riskMode: ModoRisco
  atrPer: number
  slMult: number
  slPct: number
  tp1RR: number
  pct1: number
  tp2RR: number
  pct2: number
  tp3RR: number
  pct3: number
  tp4RR: number
  pct4: number
  showTP1: boolean
  showTP2: boolean
  showTP3: boolean
  showTP4: boolean
  trailMode: 'Off' | 'ATR'
  trailMult: number
  // BREAKEVEN
  beMoveMode: ModoBE
  bePoints: number
  beCompletes: boolean
  // SINAIS / PAINÉIS
  dynLevels: boolean
  showConfPanel: boolean
  showSetupRules: boolean
  showTradePanel: boolean
  showStats: boolean
  // SMC
  smcLen: number
  smcShortLen: number
  bullCss: string
  bearCss: string
  showChoch: boolean
  showBos: boolean
  showIdm: boolean
  idmCss: string
  showSweeps: boolean
  sweepsCss: string
  showCircles: boolean
  showOB: boolean
  // ALERTAS (só o que aparece nos painéis)
  alert_watchlist: boolean
  order_type: 'MARKET' | 'LIMIT'

  // ── contexto (syminfo / timeframe) ──
  /** syminfo.ticker, ex. 'XAUUSD'. Usado pela matriz «Sensei Otimizado». */
  simbolo: string
  /** timeframe.in_seconds() do gráfico. Se omitido, deduz-se das velas. */
  tfSegundos?: number
  /** syminfo.mintick. Se omitido, deduz-se das casas decimais dos preços. */
  mintick?: number
  /** Fuso do `time(timeframe.period, sessStr)`. O Pine usa o fuso da bolsa; aqui por defeito UTC. */
  fusoSessao: string
}

/** Dados auxiliares que no Pine vêm de request.security / request.security_lower_tf. */
export interface DadosExtra {
  /** Velas do timeframe HTF (inputs.htfTF). Sem elas, reamostra-se o próprio gráfico (pouca história). */
  velasHTF?: Vela[]
  /** Velas do timeframe inferior (inputs.ltfRes) para o delta real. Sem elas, usa-se o proxy. */
  velasLTF?: Vela[]
  /**
   * barstate.isconfirmed da ÚLTIMA vela. Por defeito calcula-se pelo relógio:
   * fechada se t + tf <= agora. Todas as anteriores são sempre confirmadas.
   */
  ultimaConfirmada?: boolean
  /** Relógio para o cálculo acima (ms). Por defeito Date.now(). */
  agoraMs?: number
}

export type EstiloLinha = 'solid' | 'dashed' | 'dotted'

/** Um segmento horizontal com etiqueta (CHoCH / BOS / IDM / sweep), como line.new + label.new. */
export interface EventoEstrutura {
  tipo: 'CHoCH' | 'BOS' | 'IDM' | 'SWEEP'
  lado: 'bull' | 'bear'
  /** barra onde o evento é confirmado (n no Pine) */
  barra: number
  /** início do segmento (topx / max_x1 / …) */
  barraInicio: number
  /** fim do segmento; nas extensões ativas pode ser n+15 */
  barraFim: number
  preco: number
  texto: string
  cor: string
  estilo: EstiloLinha
  /** label.style_label_down (texto por cima) ou _up (texto por baixo) */
  etiqueta: 'acima' | 'abaixo'
  /** true nas extensões redesenhadas em barstate.islast (ext_choch/ext_bos/ext_idm) */
  extensao?: boolean
}

export interface ZonaOB {
  lado: 'bull' | 'bear'
  barraInicio: number
  /** bar_index + 25 */
  barraFim: number
  topo: number
  fundo: number
  texto: string
  cor: string
}

export interface NiveisTrade {
  entry: number
  sl: number
  tp1: number
  tp2: number
  tp3: number
  tp4: number
  slPips: number
}

export interface SinalSensei {
  barra: number
  t: number
  lado: Lado
  /** 'CON' continuação ou 'REV' reversão (fase Exaustão) */
  tipo: 'CON' | 'REV'
  score: number
  niveis: NiveisTrade
  /** texto do label.new, ex. 'CON  +12/20  SL:450p' */
  texto: string
  /** y do label (low - ATR×1.8 / high + ATR×1.8) */
  precoEtiqueta: number
  cor: string
}

/** Marcas pontuais: plotshape de fase, círculos de swing e eventos E1-E4/SL/BE («Mostrar Tudo»). */
export interface MarcaSensei {
  barra: number
  t: number
  tipo: 'momBuy' | 'momSell' | 'exhBuy' | 'exhSell' | 'swingHigh' | 'swingLow' | 'evento'
  preco?: number
  texto?: string
  cor: string
}

export interface ConfirmacoesLado {
  A1: boolean; A2: boolean; A3: boolean; A4: boolean; A5: boolean
  B1: boolean; B2: boolean; B3: boolean; B4: boolean; B5: boolean
  C1: boolean; C2: boolean; C3: boolean; C4: boolean; C5: boolean
  D1: boolean; D2: boolean; D3: boolean; D4: boolean; D5: boolean
}

/** Estado da última vela — tudo o que os três painéis do Pine leem. */
export interface EstadoUltimaBarra {
  barra: number
  bullScore: number
  bearScore: number
  grupos: { bull: [number, number, number, number]; bear: [number, number, number, number] }
  bull: ConfirmacoesLado
  bear: ConfirmacoesLado
  htfBuyOK: boolean
  htfSellOK: boolean
  inSess: boolean
  chopOK: boolean
  ltfValid: boolean
  ltfDelta: number
  ofBull: boolean
  ofBear: boolean
  baseBuy: boolean
  baseSell: boolean
  cooldown: boolean
  cooldownRestante: number
  effMinScore: number
  effCooldown: number
  effAdx: number
  actSlMult: number
  phaseMode: ModoFase
  autoOn: boolean
  adx: number
  rsi: number
  atr: number
  sigType: 'CON' | 'REV'
  // trade
  tradeAtiva: boolean
  curPos: Lado | null
  entry: number
  effSl: number
  niveis: NiveisTrade | null
  tpHit: [boolean, boolean, boolean, boolean]
  beTrig: boolean
  trailAtivo: boolean
  actScore: number
  rr: [number, number, number, number]
  pct: [number, number, number, number]
  // estatísticas
  stWins: number
  stLosses: number
  stTotal: number
  stWr: number
  stAvgR: number
}

export interface ResultadoSensei {
  inputs: InputsSensei
  mintick: number
  pipUnit: number
  tfSegundos: number
  series: {
    dema15: number[]
    dema50: number[]
    dema238: number[]
    poc: number[]
    bandaU1: number[]
    bandaL1: number[]
    cloudRapida: number[]
    cloudLenta: number[]
    /** senseiCF >= senseiCS por barra (cor da cloud/banda) */
    cloudBull: boolean[]
    atr: number[]
    rsi: number[]
    adx: number[]
    htfEma: number[]
    bullScore: number[]
    bearScore: number[]
    /** barcolor(): cor da vela de sinal ou null */
    corVela: (string | null)[]
  }
  sinais: SinalSensei[]
  estrutura: EventoEstrutura[]
  orderBlocks: ZonaOB[]
  marcas: MarcaSensei[]
  ultima: EstadoUltimaBarra | null
}
