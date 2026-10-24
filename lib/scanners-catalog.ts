// Catálogo dos scanners MTM, partilhado pela página /scanner e pelas landing pages /scanner/<slug>.
// Os preços cobrados vêm do Stripe pelo lookup_key igual ao planId (ver lib/stripe-prices.ts).

export interface ScannerProduct {
  id: string
  label: string
  price: string
  priceNote?: string
  planId: string   // matches PRICE_IDS key in /api/stripe/create-checkout-session
  highlight?: boolean
}

export interface ScannerData {
  key: string
  name: string
  subtitle: string
  image: string
  description: string
  features: string[]
  techSpecs: string[]
  products: ScannerProduct[]
  badge?: string
  gallery?: string[]
}

export const SCANNERS: ScannerData[] = [
  {
    key: "goldkiller",
    name: "MTM Gold Killer V2.1",
    subtitle: "Análise Técnica Avançada",
    image: "https://s3.tradingview.com/snapshots/x/X7SREOsm.png",
    badge: "Best Seller",
    description:
      "Um indicador avançado que combina técnicas estatísticas robustas, filtros de suavização personalizados e lógica de tendência baseada em SuperTrend para mapear oportunidades de trade com níveis de risco e recompensa claramente definidos.",
    features: [
      "Fonte de preço personalizável (médias comuns ou versão suavizada)",
      "Detecção de tendência com SuperTrend baseada em ATR",
      "Alvo estatístico dinâmico com cálculos percentuais",
      "Visualização multi-nível (até 5 níveis de alvo/drawdown)",
      "Personalização avançada de parâmetros",
    ],
    techSpecs: [
      "Linhas de alvo (verde) para projeções de ganhos",
      "Linhas de drawdown (vermelho) para projeções de perdas",
      "Linha central (cinza) para ponto de entrada",
      "Análise estatística com média e desvio padrão",
      "Preenchimento com cores suaves para visualização de distâncias",
    ],
    products: [
      { id: "gk-semestral", label: "Semestral", price: "50€", priceNote: "6 meses de acesso", planId: "goldkiller_semestral" },
      { id: "gk-lifetime", label: "Vitalício", price: "350€", priceNote: "Pagamento único", planId: "goldkiller_lifetime", highlight: true },
    ],
  },
  {
    key: "aurumflow",
    name: "MTM Aurum Flow Cripto",
    subtitle: "Perpétuos Cripto · Tendência",
    image: "/aurum-flow-preview.png",
    badge: "Novo",
    description:
      "O scanner de perpétuos cripto da MTM (otimizado para 1H). Só opera a favor da tendência (stack DEMA) com confirmação de momentum e entrega um plano completo e estático por sinal — entrada, stop e 3 alvos — com distâncias em % e cálculo de alavancagem e custo para o tamanho da tua conta.",
    features: [
      "Filtro de tendência obrigatório (DEMA 15/50/238) + confirmação RSI",
      "Níveis estáticos: entrada, SL e TP1–TP3 fixados na barra do sinal",
      "Stops e alvos por ATR (SL 1.5×ATR · alvos 1:1.5 / 1:3 / 1:6)",
      "Distância de cada nível em pontos e percentagem",
      "Painel de conta: alavancagem útil, notional e custo de fees",
    ],
    techSpecs: [
      "Timeframe recomendado: 1H",
      "Mercados: perpétuos cripto (Bybit / Binance)",
      "Gestão de risco integrada (risco % por trade)",
      "Alertas JSON prontos para webhook e copytrading",
      "Baseado no motor proprietário do MTM Scanner",
    ],
    products: [
      { id: "af-semestral", label: "Semestral", price: "50€", priceNote: "6 meses de acesso", planId: "aurumflow_semestral" },
      { id: "af-lifetime", label: "Vitalício", price: "350€", priceNote: "Pagamento único", planId: "aurumflow_lifetime", highlight: true },
    ],
  },
  {
    key: "mtm-scanner",
    name: "Scanner MTM V3.4",
    subtitle: "Market Structures and ATR",
    image: "https://s3.tradingview.com/snapshots/z/ZPM47fOg.png",
    description:
      "Scanner avançado de estruturas de mercado com cálculo automático de ATR, sinais de entrada e saída optimizados e compatibilidade com múltiplos timeframes.",
    features: [
      "Identificação de estruturas de mercado em tempo real",
      "Cálculo de ATR para gestão de risco",
      "Sinais de entrada e saída optimizados",
      "Compatível com múltiplos timeframes",
      "Atualizações regulares e suporte dedicado",
    ],
    techSpecs: [
      "Análise de estruturas de mercado em tempo real",
      "Cálculo automático de ATR para volatilidade",
      "Filtros de tendência avançados",
      "Alertas personalizáveis por email",
      "Integração com TradingView",
    ],
    products: [
      { id: "mtm-semestral", label: "Semestral", price: "50€", priceNote: "6 meses de acesso", planId: "mtm_scanner_semestral" },
      { id: "mtm-lifetime", label: "Vitalício", price: "350€", priceNote: "Pagamento único", planId: "mtm_scanner_lifetime", highlight: true },
    ],
  },
  {
    key: "trendshot",
    name: "TrendShot by MTM",
    subtitle: "Tendência · Estrutura · Risco/Retorno",
    image: "/scanners/trendshot-xauusd.png",
    gallery: ["/scanners/trendshot-xauusd.png", "/scanners/trendshot-us30.png", "/scanners/trendshot-sp500.png"],
    badge: "Novo",
    description:
      "Indicador multifuncional de análise técnica que junta seguimento de tendência, análise multi-timeframe, níveis de preço por volume e projeções automáticas de risco/retorno — uma leitura estruturada do mercado diretamente no teu gráfico do TradingView. Para Forex, Ouro (XAUUSD), índices e cripto.",
    features: [
      "Sistema de EMAs (20 · 50 · 238) com sinais de cruzamento",
      "Dashboard de tendência em até 6 timeframes (M1 a Diário)",
      "POC de volume em M15, M30 e H1 (preço acima/abaixo)",
      "Suporte e resistência dinâmicos com zonas filtradas por ATR",
      "Marcadores de swing (pequeno, médio e grande)",
    ],
    techSpecs: [
      "Entrada, Stop Loss e até 4 Take Profits após cruzamento confirmado",
      "SL fixo ou pela estrutura de suporte/resistência anterior",
      "Filtro de sessão (por omissão 08:00–21:00)",
      "Alertas TradingView para cruzamentos de alta e de baixa",
      "Ferramenta educativa: não executa ordens nem garante resultados",
    ],
    products: [
      { id: "ts-semestral", label: "Semestral", price: "50€", priceNote: "6 meses de acesso", planId: "trendshot_semestral" },
      { id: "ts-lifetime", label: "Vitalício", price: "350€", priceNote: "Pagamento único", planId: "trendshot_lifetime", highlight: true },
    ],
  },
  {
    key: "sensei",
    name: "MTM Sensei",
    subtitle: "Inteligência Artificial Avançada",
    image: "/MTM%20Sensei%20Preview.png",
    badge: "Novo",
    description:
      "O scanner mais sofisticado da MTM. O Sensei usa inteligência artificial para identificar confluências entre múltiplas metodologias — Smart Money, Goldenzone, SR MTM e TrendShot — gerando sinais de alta precisão para traders profissionais.",
    features: [
      "IA multi-confluência com Smart Money Concepts",
      "Integração com metodologia Goldenzone MTM",
      "Identificação automática de zonas SR (Suporte/Resistência)",
      "TrendShot — sinal com confirmação múltipla",
      "Dashboard de performance em tempo real",
    ],
    techSpecs: [
      "Motor de IA proprietário treinado em dados históricos MTM",
      "Confluência automática de 4+ metodologias",
      "Alertas em tempo real no TradingView",
      "Score de qualidade de sinal (0–100)",
      "Historial de trades e taxa de acerto",
    ],
    products: [
      // O Sensei faz parte do Pack Scanners — ver secção Pack Scanners abaixo
    ],
  },
]
