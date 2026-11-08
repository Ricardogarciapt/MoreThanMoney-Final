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
    video: "/scanners/premium-scanner/apresentacao.mp4",
    poster: "/scanners/premium-scanner/poster.jpg",
    title: ["O ouro em sessão,", "com a zona marcada."],
    sub: "Direção por voto de cinco critérios, zona de entrada em recuo, stop e três alvos desenhados no gráfico, em Londres, Nova Iorque e Ásia.",
    markets: ["Ouro (XAUUSD)", "15 minutos", "3 sessões", "TradingView"],
    description:
      "O Premium Scanner lê o ouro nas três sessões. Em cada vela de 15 minutos vota a direção com cinco critérios: o preço contra a abertura da sessão, contra há 1 h e há 4 h, e contra a EMA200 e a EMA9. Quando há sinal, desenha a zona de entrada em recuo, o stop e os alvos como nos sinais Premium da casa, e manda tudo num alerta pronto para webhook.",
    metaDescription:
      "MTM Premium Scanner: zonas de recuo no ouro em Londres, Nova Iorque e Ásia, com entrada, stop e alvos no TradingView. Pacote vitalício de 1250€ com indicador, estratégia e EA MT5; o indicador vem no Premium e no Pack Scanners.",
  },
  {
    slug: "defy",
    key: "defy",
    video: "/scanners/defy/apresentacao.mp4",
    poster: "/scanners/defy/poster.jpg",
    title: ["Desafia o mercado.", "Com método."],
    sub: "Bandas de exaustão, níveis-chave e uma pontuação de confirmações. Cada ideia chega com estrelas, entrada, Warning, stop e três alvos.",
    markets: ["Forex", "Ouro (XAUUSD)", "Índices", "Cripto"],
    description:
      "O DEFY junta quatro leituras no mesmo gráfico: bandas de exaustão à volta de uma média suave, níveis-chave onde o preço já reagiu, uma nuvem de tendência e uma pontuação de confirmações. A ideia só nasce quando o preço estica até às bandas, vira com uma vela forte e junta pelo menos três confirmações; quantas mais, mais estrelas. O plano fica fixo na vela de sinal.",
    metaDescription:
      "DEFY by MTM: bandas de exaustão, níveis-chave e confirmações com estrelas no TradingView, com entrada, Warning, stop e três alvos. 50€ por semestre ou 350€ vitalício.",
  },
  {
    slug: "rocketnova",
    key: "rocketnova",
    video: "/scanners/rocketnova/apresentacao.mp4",
    poster: "/scanners/rocketnova/poster.jpg",
    title: ["Descola com a tendência.", "Com o plano a bordo."],
    sub: "Três médias, estrelas de lançamento, Rocket Candle e pulso de volatilidade. Cada sinal chega com entrada, stop e quatro alvos, e a gestão segue por alertas.",
    markets: ["Forex", "Ouro (XAUUSD)", "Índices", "Cripto"],
    description:
      "O RocketNova junta a leitura de tendência das EMAs 20, 50 e 238 com a estrutura do preço: um sinal só nasce quando a média rápida cruza a lenta e há uma estrela de lançamento recente, um mínimo de swing para a compra ou um máximo para a venda. A Rocket Candle marca a vela de impulso, o Volatility Pulse diz se o ATR está acima do normal e o Trade Clock mostra se estás dentro da sessão e com volume. Entrada, stop e TP1 a TP4 ficam fixos na vela do sinal; depois do TP1 o stop passa para a entrada e um sinal contrário fecha a trade.",
    metaDescription:
      "RocketNova by MTM: EMAs 20/50/238, estrelas de lançamento, Rocket Candle e gestão da trade no TradingView, com entrada, stop e quatro alvos. 50€ por semestre ou 350€ vitalício.",
  },
  {
    slug: "quantum",
    key: "quantum",
    video: "/scanners/quantum/apresentacao.mp4",
    poster: "/scanners/quantum/poster.jpg",
    videoEn: "/scanners/quantum/apresentacao-en.mp4",
    posterEn: "/scanners/quantum/poster-en.jpg",
    title: ["A tendência confirma-se primeiro.", "O recuo dá a entrada."],
    sub: "Linha primária, seta de fase e painel de força por timeframe. Depois o recuo à fita, o oscilador na zona e o triângulo ou o ponto que dão a entrada.",
    markets: ["Forex", "Ouro (XAUUSD)", "Índices", "Cripto"],
    description:
      "O Quantum lê o mercado em três tempos. Primeiro confirma a direção: a linha primária (média de 269 com brilho) fica azul com o preço por cima e vermelha por baixo, a seta grande marca o início da fase e o painel de força dá uma pontuação de 0 a 100 com uma seta por timeframe, de M1 a W1. Depois espera o recuo: o preço volta à fita das EMAs 8 e 21 e o oscilador Stoch RSI entra na zona da direção. Só então dá a entrada, um triângulo de recuo, um ponto de onda ou os dois na mesma vela, numa vela da cor da direção. A estrutura (HH, HL, LH, LL e linhas de tendência), as bandas de volatilidade e os máximos e mínimos das sessões completam a leitura. Stop para lá do extremo do recuo e alvo com o dobro do risco, por alertas.",
    metaDescription:
      "Quantum by MTM: seguidor de tendência com entradas em recuo no TradingView, com linha primária, painel de força por timeframe, oscilador e sinais de entrada. 50€ por semestre ou 350€ vitalício.",
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
  defy: {
    title: ["Defy the market.", "With a method."],
    sub: "Exhaustion bands, key levels and a confirmation score. Every idea comes with stars, entry, Warning, stop and three targets.",
    markets: ["Forex", "Gold (XAUUSD)", "Indices", "Crypto"],
    description:
      "DEFY brings four readings onto one chart: exhaustion bands around a smooth average, key levels where price has reacted before, a trend cloud and a confirmation score. An idea is only born when price stretches into the bands, turns with a strong candle and gathers at least three confirmations; the more it gathers, the more stars it gets. The plan stays fixed on the signal candle.",
    features: [
      "Inner, mid and outer exhaustion bands, with a dashed projection",
      "Key levels where price has reacted, spaced apart",
      "A +3 to +15 score with stars (★ to ★★★) and a King Idea on the gold candle",
      "Entry on the close or on a 50% pullback, Warning and a 1 ATR stop",
      "Targets at 1R, 2R and 3R (or Squeeze, Stretch and Swing modes), with the distance in pips",
    ],
    specs: [
      "Trend cloud, coloured candles and follow-up arrows",
      "Volume break labels",
      "JSON alerts with the idea and its follow-ups (entry, TP1 to TP3, stop)",
      "Forex, gold, indices and crypto, on any timeframe",
      "Educational tool: it does not place orders or guarantee results",
    ],
    metaDescription: "DEFY by MTM: exhaustion bands, key levels and confirmations with stars on TradingView, with entry, Warning, stop and three targets. €50 per six months or €350 lifetime.",
  },
  rocketnova: {
    title: ["Lift off with the trend.", "With the plan on board."],
    sub: "Three averages, launch stars, the Rocket Candle and a volatility pulse. Every signal comes with entry, stop and four targets, and the management follows by alerts.",
    markets: ["Forex", "Gold (XAUUSD)", "Indices", "Crypto"],
    description:
      "RocketNova pairs the trend read of the 20, 50 and 238 EMAs with price structure: a signal is only born when the fast average crosses the slow one and there is a recent launch star, a swing low for a buy or a swing high for a sell. The Rocket Candle marks the impulse candle, the Volatility Pulse tells you whether ATR is above normal and the Trade Clock shows whether you are inside the session and with volume. Entry, stop and TP1 to TP4 stay fixed on the signal candle; after TP1 the stop moves to entry and an opposite signal closes the trade.",
    features: [
      "20, 50 and 238 EMAs with the signal on a cross confirmed at candle close",
      "High and low stars by Depth, Deviation and Backstep (34 / 13 / 8)",
      "Rocket Candle: the impulse candle painted yellow, with an optional filter",
      "Volatility Pulse (ATR against its average) and a Trade Clock with Good / Low Volume",
      "Entry, stop and TP1 to TP4 fixed on the candle, with the stop moved to entry after TP1",
    ],
    specs: [
      "Fixed stop in points (auto mode: 100 pips, 200 on gold) or on the last star",
      "Targets at 30%, 50%, 100% and 150% of the stop (60% for TP2 on gold)",
      "Configurable trading session (08:00 to 21:00 by default)",
      "JSON alerts with the entry and the follow-ups of the same trade, ready for webhooks",
      "Forex, gold, indices and crypto; educational tool, it does not place orders",
    ],
    metaDescription: "RocketNova by MTM: 20/50/238 EMAs, launch stars, Rocket Candle and trade management on TradingView, with entry, stop and four targets. €50 per six months or €350 lifetime.",
  },
  quantum: {
    title: ["The trend confirms first.", "The pullback gives the entry."],
    sub: "Primary line, phase arrow and a strength panel per timeframe. Then the pullback to the ribbon, the oscillator in the zone and the triangle or dot that give the entry.",
    markets: ["Forex", "Gold (XAUUSD)", "Indices", "Crypto"],
    description:
      "Quantum reads the market in three steps. First it confirms the direction: the primary line (a 269 average with a glow) turns blue with price above and red below, the large arrow marks the start of the phase and the strength panel gives a score from 0 to 100 with an arrow per timeframe, from M1 to W1. Then it waits for the pullback: price returns to the 8 and 21 EMA ribbon and the Stoch RSI enters the zone of the direction. Only then it gives the entry, a pullback triangle, a wave dot or both on the same candle, in a candle of the direction colour. Structure (HH, HL, LH, LL and trend lines), volatility bands and session highs and lows complete the read. Stop beyond the extreme of the pullback and a target at twice the risk, by alerts.",
    features: [
      "Primary line of 269 (EMA, SMA, WMA, HMA, RMA or VWMA), blue or red by phase, with a glow",
      "Large phase arrow and a strength panel with a 0–100 score and arrows from M1 to W1",
      "Pullback triangles (ribbon touch and close in favour) and wave dots (Stoch RSI leaving the zone)",
      "HH/HL/LH/LL structure, trend lines through pivots and 2σ and 3σ volatility bands",
      "New York, London and Asia session highs and lows, with labels",
    ],
    specs: [
      "Stoch RSI 14 / %K 5 / smoothing 1 and 1, 80 and 20 zones, phase by a 260 EMA",
      "21-bar swing for the labels and a 13-bar lookback for the trend lines",
      "Signals on 5, 15 and 30 minutes switchable one by one; other timeframes always on",
      "JSON alerts with entry, stop beyond the pullback, target at 2R and score, ready for webhooks",
      "Forex, gold, indices and crypto; educational tool, it does not place orders",
    ],
    metaDescription: "Quantum by MTM: trend following with pullback entries on TradingView, with a primary line, strength panel per timeframe, oscillator and entry signals. €50 per six months or €350 lifetime.",
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
