// Texto das landing pages /scanner/<slug>. Os factos técnicos (funcionalidades, especificações,
// preços) vêm de lib/scanners-catalog.ts; aqui fica só o que é próprio da página de venda.
// Regra da casa: nada de números de precisão inventados.

export interface ScannerLanding {
  slug: string
  key: string // ScannerData.key em lib/scanners-catalog.ts
  title: [string, string] // título do hero em duas linhas
  sub: string
  markets: string[]
  /** Vídeo de apresentação em /public; sem ele o hero mostra a imagem do scanner. */
  video?: string
  poster?: string
  metaDescription: string
}

export const SCANNER_LANDINGS: ScannerLanding[] = [
  {
    slug: "gold-killer",
    video: "/scanners/gold-killer/apresentacao.mp4",
    poster: "/scanners/gold-killer/poster.jpg",
    key: "goldkiller",
    title: ["O ouro,", "com alvos claros."],
    sub: "Tendência por SuperTrend e alvos estatísticos no XAUUSD, desenhados no teu gráfico do TradingView.",
    markets: ["Ouro (XAUUSD)", "Day trade", "Swing trade", "TradingView"],
    metaDescription:
      "MTM Gold Killer: indicador de tendência e alvos estatísticos para o ouro no TradingView. 50€ por semestre ou 350€ vitalício.",
  },
  {
    slug: "aurum-flow",
    video: "/scanners/aurum-flow/apresentacao.mp4",
    poster: "/scanners/aurum-flow/poster.jpg",
    key: "aurumflow",
    title: ["Cripto a favor", "da tendência."],
    sub: "Entrada, stop e três alvos fixos por sinal nos perpétuos cripto, com a alavancagem calculada para a tua conta.",
    markets: ["Perpétuos cripto", "Bybit", "Binance", "Gráfico de 1H"],
    metaDescription:
      "MTM Aurum Flow: scanner de perpétuos cripto com entrada, stop e três alvos por sinal. 50€ por semestre ou 350€ vitalício.",
  },
  {
    slug: "mtm-scanner",
    video: "/scanners/mtm-scanner/apresentacao.mp4",
    poster: "/scanners/mtm-scanner/poster.jpg",
    key: "mtm-scanner",
    title: ["Lê a estrutura", "antes de entrar."],
    sub: "Estruturas de mercado e ATR em tempo real, com sinais de entrada e saída em vários timeframes.",
    markets: ["Forex", "Índices", "Ouro", "Multi-timeframe"],
    metaDescription:
      "Scanner MTM V3.4: estruturas de mercado e ATR no TradingView. 50€ por semestre ou 350€ vitalício.",
  },
  {
    slug: "trendshot",
    video: "/scanners/trendshot/apresentacao.mp4",
    poster: "/scanners/trendshot/poster.jpg",
    key: "trendshot",
    title: ["Tendência e risco", "no mesmo gráfico."],
    sub: "EMAs, dashboard multi-timeframe, POC de volume e projeções de entrada, stop e alvos no TradingView.",
    markets: ["Forex", "Ouro (XAUUSD)", "Índices", "Cripto"],
    metaDescription:
      "TrendShot by MTM: tendência, estrutura e risco/retorno no TradingView. 50€ por semestre ou 350€ vitalício.",
  },
  {
    slug: "sensei",
    video: "/scanners/sensei/apresentacao.mp4",
    poster: "/scanners/sensei/poster.jpg",
    key: "sensei",
    title: ["Várias leituras.", "Uma confluência."],
    sub: "Smart Money, Goldenzone, SR MTM e KillShot cruzados num só scanner, incluído no Pack Scanners.",
    markets: ["Smart Money", "Goldenzone", "SR MTM", "KillShot"],
    metaDescription:
      "MTM Sensei: confluência de Smart Money, Goldenzone, SR MTM e KillShot. Incluído no Pack Scanners por 35€/mês.",
  },
]

export function getScannerLanding(slug: string) {
  return SCANNER_LANDINGS.find((l) => l.slug === slug)
}
