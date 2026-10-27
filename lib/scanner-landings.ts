// Texto das landing pages /scanner/<slug>, escrito a partir do código Pine de cada scanner.
// Os preços e os dados de compra vêm de lib/scanners-catalog.ts; `features` e `description` aqui
// sobrepõem-se às do catálogo só na landing. Regra da casa: nada de números de precisão inventados.

export interface ScannerLanding {
  slug: string
  key: string // ScannerData.key em lib/scanners-catalog.ts
  title: [string, string] // título do hero em duas linhas
  sub: string
  markets: string[]
  /** Vídeo de apresentação em /public; sem ele o hero mostra a imagem do scanner. */
  video?: string
  poster?: string
  features?: string[]
  specs?: string[]
  description?: string
  metaDescription: string
  /** Versão inglesa (/en/scanner/<slug>); o que faltar cai no português. */
  en?: Partial<Pick<ScannerLanding, "title" | "sub" | "markets" | "features" | "specs" | "description" | "metaDescription">>
  videoEn?: string
  posterEn?: string
}

export const SCANNER_LANDINGS: ScannerLanding[] = [
  {
    slug: "gold-killer",
    video: "/scanners/gold-killer/apresentacao.mp4",
    poster: "/scanners/gold-killer/poster.jpg",
    key: "goldkiller",
    specs: [
      "Fonte de preço à escolha, incluindo uma versão suavizada",
      "Multiplicador e período do ATR ajustáveis",
      "Janela de histórico e percentil configuráveis",
      "Alertas de compra e venda na viragem, para webhook",
      "Ferramenta de análise: não executa ordens",
    ],
    title: ["O ouro,", "com alvos claros."],
    sub: "SuperTrend para a tendência e níveis de alvo e drawdown calculados a partir das pernas anteriores do preço.",
    markets: ["Ouro (XAUUSD)", "Day trade", "Swing trade", "TradingView"],
    features: [
      "SuperTrend de ATR sobre um preço suavizado para ler a tendência",
      "Sinal de compra ou venda em cada viragem do SuperTrend",
      "Alvos e drawdowns por percentil das pernas anteriores, até 5 níveis por lado",
      "Média e desvio padrão dos ganhos e drawdowns, se os quiseres no gráfico",
      "Alertas com entrada, stop e três alvos prontos para webhook",
    ],
    description:
      "O Gold Killer segue a tendência com um SuperTrend de ATR. Em cada viragem guarda até onde o preço foi a favor e contra na perna anterior e transforma esse histórico em níveis de alvo e de drawdown por percentil, desenhados a partir da entrada.",
    metaDescription:
      "MTM Gold Killer: SuperTrend e níveis de alvo e drawdown por percentil para o ouro no TradingView. 50€ por semestre ou 350€ vitalício.",
  },
  {
    slug: "aurum-flow",
    video: "/scanners/aurum-flow/apresentacao.mp4",
    poster: "/scanners/aurum-flow/poster.jpg",
    key: "aurumflow",
    specs: [
      "Mercados: ouro (lotes) e perpétuos cripto (notional e alavancagem)",
      "Sessões configuráveis, com o fuso horário à tua escolha",
      "Motor ORB, SMC de reversão ou os dois",
      "Regime obrigatório: EMA 200 do timeframe de topo e banda de volatilidade",
      "Alertas JSON no fecho da vela, prontos para webhook",
    ],
    title: ["Rompe a range.", "Com risco fixo."],
    sub: "Opening Range Breakout no ouro e nos perpétuos: caixas de sessão, entrada no rompimento e stop na aresta oposta.",
    markets: ["Ouro (XAUUSD)", "Perpétuos cripto", "Pre London", "London", "Nova Iorque"],
    features: [
      "Caixas das sessões Pre London, London e Nova Iorque com máximo, mínimo e range",
      "Entrada no rompimento da caixa, só a favor do regime de tendência",
      "Stop na aresta oposta da range, com teto de risco por trade",
      "Quatro alvos em R, com o valor em $ para o risco que defines",
      "Tamanho calculado pelo risco: lotes no ouro, notional e alavancagem nos perpétuos",
    ],
    description:
      "O Aurum Flow marca a range de abertura de cada sessão e espera que o preço a rompa a favor da tendência de fundo. O stop fica na aresta oposta, os quatro alvos em múltiplos do risco, e o painel diz-te o tamanho da posição para o risco em $ que escolheste. Por baixo corre o mesmo motor de estrutura SMC do Sensei.",
    metaDescription:
      "MTM Aurum Flow: Opening Range Breakout no ouro e nos perpétuos cripto, com stop na range e quatro alvos em R. 50€ por semestre ou 350€ vitalício.",
  },
  {
    slug: "mtm-scanner",
    video: "/scanners/mtm-scanner/apresentacao.mp4",
    poster: "/scanners/mtm-scanner/poster.jpg",
    key: "mtm-scanner",
    specs: [
      "Stop e alvos por ATR ou em percentagem, com entrada personalizada",
      "Fases de momentum e de exaustão da tendência",
      "Alertas de compra e venda com entrada, stop e alvos",
      "Funciona em qualquer timeframe do TradingView",
      "Ferramenta de análise: não executa ordens",
    ],
    title: ["Lê a estrutura", "antes de entrar."],
    sub: "Três DEMA, o POC de volume e a estrutura de mercado, com stop por ATR e alvos até 1:6.",
    markets: ["Forex", "Índices", "Ouro", "Cripto"],
    features: [
      "DEMA 15, 50 e 238 para a tendência de curto, médio e longo prazo",
      "POC: o preço com mais volume nas últimas velas",
      "Sinal de compra ou venda quando o fecho cruza o POC",
      "Stop a 1 ATR e alvos a 1:2, 1:4 e 1:6 (ou em percentagem)",
      "Estrutura de mercado com CHoCH, BOS, inducements e sweeps",
    ],
    description:
      "O Scanner MTM junta três DEMA, o POC de volume e a estrutura de mercado. Quando o fecho cruza o POC dá o sinal e desenha logo a entrada, o stop a 1 ATR e três alvos em múltiplos do risco.",
    metaDescription:
      "Scanner MTM: DEMA 15/50/238, POC de volume e estrutura de mercado no TradingView. 50€ por semestre ou 350€ vitalício.",
  },
  {
    slug: "trendshot",
    video: "/scanners/trendshot/apresentacao.mp4",
    poster: "/scanners/trendshot/poster.jpg",
    key: "trendshot",
    title: ["Tendência e risco", "no mesmo gráfico."],
    sub: "EMAs, tabela de tendência em seis timeframes, POC de volume e projeções de entrada, stop e alvos no TradingView.",
    markets: ["Forex", "Ouro (XAUUSD)", "Índices", "Cripto"],
    metaDescription:
      "TrendShot by MTM: tendência, estrutura e risco/retorno no TradingView. 50€ por semestre ou 350€ vitalício.",
  },
  {
    slug: "premium-scanner",
    key: "premium-scanner",
    title: ["O ouro em sessão,", "com a zona marcada."],
    sub: "Direção por voto de cinco critérios, zona de entrada em recuo, stop e três alvos desenhados no gráfico, em Londres, Nova Iorque e Ásia.",
    markets: ["Ouro (XAUUSD)", "15 minutos", "3 sessões", "TradingView"],
    description:
      "O Premium Scanner lê o ouro nas três sessões. Em cada vela de 15 minutos vota a direção com cinco critérios: o preço contra a abertura da sessão, contra há 1 h e há 4 h, e contra a EMA200 e a EMA9. Quando há sinal, desenha a zona de entrada em recuo, o stop e os alvos como nos sinais Premium da casa, e manda tudo num alerta pronto para webhook.",
    metaDescription:
      "MTM Premium Scanner: zonas de recuo no ouro em Londres, Nova Iorque e Ásia, com entrada, stop e alvos no TradingView. Pacote vitalício de 1250€ com indicador, estratégia e EA MT5; o indicador vem no Premium e no Pack Scanners.",
  },
  {
    slug: "sensei",
    video: "/scanners/sensei/apresentacao.mp4",
    poster: "/scanners/sensei/poster.jpg",
    key: "sensei",
    specs: [
      "Estilos prontos (Agressivo, Scalp, Intraday, Swing, Conservador) ou personalizado",
      "Filtros de tendência do timeframe de topo, de sessão e anti-chop por ADX",
      "Sinais só no fecho da vela, sem repaint",
      "Painéis de confirmações, regras e trade no gráfico",
      "Alertas de entrada, breakeven, saídas e stop",
    ],
    title: ["Várias leituras.", "Uma confluência."],
    sub: "Estrutura SMC, DEMA, POC, banda Sensei e order flow. Só dá sinal quando as confirmações concordam.",
    markets: ["Estrutura SMC", "Order flow", "Banda Sensei", "POC"],
    features: [
      "Painel de confirmações: o sinal só sai com o mínimo exigido",
      "Estrutura SMC com CHoCH, BOS, sweeps e order blocks",
      "Banda Sensei (média de 89 com 1 desvio) e nuvem de tendência",
      "Order flow com o delta de volume de um timeframe inferior",
      "Quatro saídas em R e stop para breakeven depois da primeira",
    ],
    description:
      "O Sensei reúne o motor de estrutura SMC, as DEMA e o POC do Scanner MTM, a banda Sensei e o delta de volume. Cada critério conta como uma confirmação e o sinal só aparece quando há confirmações suficientes, com filtros de tendência e anti-chop. Os níveis ficam fixos na vela do sinal.",
    metaDescription:
      "MTM Sensei: confluência de estrutura SMC, DEMA, POC, banda Sensei e order flow. Incluído no Pack Scanners por 35€/mês.",
  },
]

const EN: Record<string, NonNullable<ScannerLanding["en"]>> = {
  "gold-killer": {
    title: ["Gold,", "with clear targets."],
    sub: "SuperTrend for the trend, plus target and drawdown levels built from previous price legs.",
    markets: ["Gold (XAUUSD)", "Day trading", "Swing trading", "TradingView"],
    description:
      "Gold Killer follows the trend with an ATR SuperTrend. On every turn it records how far price went for and against you in the previous leg and turns that history into target and drawdown levels by percentile, drawn from the entry.",
    specs: [
      "Choice of price source, including a smoothed version",
      "Adjustable ATR multiplier and length",
      "Configurable history window and percentile",
      "Buy and sell alerts on the turn, ready for webhooks",
      "Analysis tool: it does not place orders",
    ],
    metaDescription: "MTM Gold Killer: SuperTrend plus percentile target and drawdown levels for gold on TradingView. €50 per six months or €350 lifetime.",
  },
  "aurum-flow": {
    title: ["Break the range.", "With fixed risk."],
    sub: "Opening Range Breakout on gold and perpetuals: session boxes, entry on the breakout and the stop on the opposite edge.",
    markets: ["Gold (XAUUSD)", "Crypto perpetuals", "Pre London", "London", "New York"],
    description:
      "Aurum Flow marks the opening range of each session and waits for price to break it with the underlying trend. The stop sits on the opposite edge, four targets in multiples of risk, and the panel tells you the position size for the dollar risk you chose. Underneath runs the same SMC structure engine as Sensei.",
    specs: [
      "Markets: gold (lots) and crypto perpetuals (notional and leverage)",
      "Configurable sessions, in the time zone you choose",
      "ORB engine, SMC reversal engine or both",
      "Mandatory regime: higher-timeframe 200 EMA and a volatility band",
      "JSON alerts on candle close, ready for webhooks",
    ],
    metaDescription: "MTM Aurum Flow: Opening Range Breakout on gold and crypto perpetuals, with the stop on the range and four targets in R. €50 per six months or €350 lifetime.",
  },
  "mtm-scanner": {
    title: ["Read the structure", "before you enter."],
    sub: "Three DEMAs, the volume POC and market structure, with an ATR stop and targets up to 1:6.",
    markets: ["Forex", "Indices", "Gold", "Crypto"],
    description:
      "MTM Scanner combines three DEMAs, the volume POC and market structure. When the close crosses the POC it fires the signal and immediately draws the entry, a 1 ATR stop and three targets in multiples of risk.",
    specs: [
      "Stop and targets by ATR or by percentage, with custom entry",
      "Momentum and trend-exhaustion phases",
      "Buy and sell alerts with entry, stop and targets",
      "Works on any TradingView timeframe",
      "Analysis tool: it does not place orders",
    ],
    metaDescription: "MTM Scanner: DEMA 15/50/238, volume POC and market structure on TradingView. €50 per six months or €350 lifetime.",
  },
  trendshot: {
    title: ["Trend and risk", "on one chart."],
    sub: "EMAs, a six-timeframe trend table, volume POC and entry, stop and target projections on TradingView.",
    markets: ["Forex", "Gold (XAUUSD)", "Indices", "Crypto"],
    description:
      "A multi-purpose technical analysis indicator combining trend following, multi-timeframe analysis, volume price levels and automatic risk/reward projections: a structured read of the market right on your TradingView chart.",
    specs: [
      "Entry, stop loss and up to 4 take profits after a confirmed cross",
      "Fixed SL or by the previous support/resistance structure",
      "Session filter (08:00 to 21:00 by default)",
      "TradingView alerts for bullish and bearish crosses",
      "Educational tool: it does not place orders or guarantee results",
    ],
    metaDescription: "TrendShot by MTM: trend, structure and risk/reward on TradingView. €50 per six months or €350 lifetime.",
  },
  "premium-scanner": {
    title: ["Gold in session,", "with the zone marked."],
    sub: "Direction by a five-criteria vote, a pullback entry zone, stop and three targets drawn on the chart, in London, New York and Asia.",
    markets: ["Gold (XAUUSD)", "15 minutes", "3 sessions", "TradingView"],
    description:
      "Premium Scanner reads gold across the three sessions. On every 15-minute candle it votes the direction with five criteria: price against the session open, against 1 h and 4 h ago, and against the EMA200 and EMA9. On a signal it draws the pullback entry zone, the stop and the targets like the house's Premium signals, and sends it all in a webhook-ready alert.",
    specs: [
      "Chart: XAUUSD on 15 minutes",
      "Editable entry, SL and exits, drawn on the chart",
      "Majority or Unanimous mode, pause and max signals per session",
      "Webhook-ready JSON alerts, plus the strategy for backtesting",
      "Educational tool: it does not place orders or guarantee results",
    ],
    metaDescription: "MTM Premium Scanner: pullback zones on gold in London, New York and Asia, with entry, stop and targets on TradingView. €1250 lifetime bundle with indicator, strategy and MT5 EA; the indicator is included in Premium and the Scanner Pack.",
  },
  sensei: {
    title: ["Many readings.", "One confluence."],
    sub: "SMC structure, DEMAs, POC, the Sensei band and order flow. It only signals when the confirmations agree.",
    markets: ["SMC structure", "Order flow", "Sensei band", "POC"],
    description:
      "Sensei brings together the SMC structure engine, the DEMAs and POC from MTM Scanner, the Sensei band and volume delta. Each criterion counts as a confirmation and the signal only appears with enough of them, with trend and anti-chop filters. Levels stay fixed on the signal candle.",
    specs: [
      "Ready-made styles (Aggressive, Scalp, Intraday, Swing, Conservative) or custom",
      "Higher-timeframe trend, session and ADX anti-chop filters",
      "Signals on candle close only, no repaint",
      "Confirmations, rules and trade panels on the chart",
      "Alerts for entry, breakeven, exits and stop",
    ],
    metaDescription: "MTM Sensei: confluence of SMC structure, DEMAs, POC, the Sensei band and order flow. Included in the Scanner Pack for €35/month.",
  },
}
for (const l of SCANNER_LANDINGS) {
  l.en = EN[l.slug]
  // Sem vídeo PT ainda não há versão EN: o hero cai na imagem do scanner.
  if (!l.video) continue
  l.videoEn = `/scanners/${l.slug}/apresentacao-en.mp4`
  l.posterEn = `/scanners/${l.slug}/poster-en.jpg`
}

export function getScannerLanding(slug: string) {
  return SCANNER_LANDINGS.find((l) => l.slug === slug)
}
