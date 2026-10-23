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

export function getScannerLanding(slug: string) {
  return SCANNER_LANDINGS.find((l) => l.slug === slug)
}
