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
    key: "premium-scanner",
    name: "MTM Premium Scanner",
    subtitle: "Ouro · Zonas de recuo por sessão",
    image: "/scanners/premium-scanner.png",
    gallery: ["/scanners/premium-scanner.png", "/scanners/premium-scanner-ny.png", "/scanners/premium-scanner-asia.png"],
    badge: "Novo",
    description:
      "O scanner das sessões de ouro da MTM. Em Londres, Nova Iorque e Ásia lê a direção do movimento e desenha logo a zona de entrada em recuo, o stop e os alvos, com a mesma geometria dos sinais Premium da casa. Assenta no método de zonas de recuo por sessão, usado por traders de topo em todo o mundo e por vários programas de IB nos seus sinais de ouro.",
    features: [
      "Sessões de Londres, Nova Iorque e Ásia, cada uma com o seu interruptor",
      "Direção por voto de cinco critérios: abertura da sessão, 1 h, 4 h, EMA200 e EMA9",
      "Zona de entrada de 5 $ em recuo e SL 5 $ para lá da zona",
      "TP1, TP2 e TP3 a 5, 10 e 15 $ da zona, e TP4 a correr",
      "Gestão: 50 % no TP1 com o SL para a entrada, 25 % no TP2 e 25 % no TP3",
      "No pacote vitalício: EA para MetaTrader 5 com painel, que executa a mesma regra",
    ],
    techSpecs: [
      "Gráfico: XAUUSD em 15 minutos",
      "Entrada, SL e saídas editáveis e desenhados no gráfico",
      "Modo Maioria ou Unânime, pausa e máximo de sinais por sessão",
      "Alertas JSON prontos para webhook, com a estratégia para backtest",
      "Ferramenta educativa: não garante resultados",
    ],
    products: [
      { id: "ps-lifetime", label: "Vitalício", price: "1250€", priceNote: "Pagamento único · Indicador + Estratégia + EA MT5 · o indicador vem no Premium e no Pack", planId: "premium_scanner_lifetime", highlight: true },
    ],
  },
  {
    key: "defy",
    name: "DEFY by MTM",
    subtitle: "Bandas de exaustão · Confirmações · Estrelas",
    image: "/scanners/defy/poster.jpg",
    badge: "Novo",
    description:
      "O DEFY lê a estrutura do mercado com bandas de exaustão, níveis-chave, uma nuvem de tendência e uma pontuação de confirmações. Quando há confirmações suficientes, marca a ideia com estrelas e desenha o plano completo no gráfico: entrada, Warning, stop e três alvos.",
    features: [
      "Bandas de exaustão interior, média e exterior, com projecção tracejada",
      "Níveis-chave onde o preço já reagiu, espaçados entre si",
      "Pontuação +3 a +15 com estrelas (★ a ★★★) e King Idea na vela dourada",
      "Entrada no fecho ou em pullback de 50 %, Warning e stop a 1 ATR",
      "Alvos a 1R, 2R e 3R (ou modos Squeeze, Stretch e Swing), com a distância em pips",
    ],
    techSpecs: [
      "Nuvem de tendência, velas coloridas e setas de seguimento",
      "Etiquetas de quebra de volume",
      "Alertas JSON com a ideia e os seguimentos (entrada, TP1 a TP3, stop)",
      "Forex, ouro, índices e cripto, em qualquer timeframe",
      "Ferramenta educativa: não executa ordens nem garante resultados",
    ],
    products: [
      { id: "defy-semestral", label: "Semestral", price: "50€", priceNote: "6 meses de acesso", planId: "defy_semestral" },
      { id: "defy-lifetime", label: "Vitalício", price: "350€", priceNote: "Pagamento único", planId: "defy_lifetime", highlight: true },
    ],
  },
  {
    key: "rocketnova",
    name: "RocketNova by MTM",
    subtitle: "Médias · Estrelas · Rocket Candle · Gestão da trade",
    image: "/scanners/rocketnova/poster.jpg",
    badge: "Novo",
    description:
      "O RocketNova lê a tendência com três médias (20, 50 e 238) e só dispara no cruzamento confirmado quando há uma estrela de lançamento: um mínimo recente de swing para a compra, um máximo para a venda. A Rocket Candle, o pulso de volatilidade e o Trade Clock dizem-te se o mercado tem força e horas para a ideia. O plano fica fixo na vela do sinal e a gestão sai por alertas: TP1 a TP4, stop, stop na entrada e saída por sinal contrário.",
    features: [
      "EMA 20, 50 e 238 com sinal no cruzamento confirmado no fecho da vela",
      "Estrelas de máximo e mínimo por Depth, Deviation e Backstep (34 / 13 / 8)",
      "Rocket Candle: a vela de impulso pintada de amarelo, com filtro opcional",
      "Volatility Pulse (ATR contra a média) e Trade Clock com Good / Low Volume",
      "Entrada, stop e TP1 a TP4 fixos na vela, com stop na entrada depois do TP1",
    ],
    techSpecs: [
      "Stop fixo em pontos (modo auto: 100 pips, 200 no ouro) ou na última estrela",
      "Alvos a 30 %, 50 %, 100 % e 150 % do stop (60 % no TP2 do ouro)",
      "Sessão de negociação configurável (08:00 a 21:00 por omissão)",
      "Alertas JSON com a entrada e os seguimentos da mesma trade, prontos para webhook",
      "Forex, ouro, índices e cripto; ferramenta educativa, não executa ordens",
    ],
    products: [
      { id: "rn-semestral", label: "Semestral", price: "50€", priceNote: "6 meses de acesso", planId: "rocketnova_semestral" },
      { id: "rn-lifetime", label: "Vitalício", price: "350€", priceNote: "Pagamento único", planId: "rocketnova_lifetime", highlight: true },
    ],
  },
  {
    key: "quantum",
    name: "Quantum by MTM",
    subtitle: "Tendência · Recuo · Oscilador · Painel de força",
    image: "/scanners/quantum/poster.jpg",
    badge: "Novo",
    description:
      "O Quantum é um seguidor de tendência que entra em recuos. A linha primária (média de 269 com brilho) e a seta de fase dizem a direção; o painel de força dá uma pontuação de 0 a 100 e uma seta por timeframe, de M1 a W1. Depois espera-se o recuo: o preço volta à fita das EMAs 8 e 21 e o oscilador entra na zona da direção. A entrada é um triângulo de recuo, um ponto de onda ou os dois na mesma vela. Traz ainda HH/HL/LH/LL, linhas de tendência, bandas de volatilidade e os máximos e mínimos das sessões.",
    features: [
      "Linha primária de 269 (EMA, SMA, WMA, HMA, RMA ou VWMA) azul ou vermelha pela fase, com brilho",
      "Seta grande de fase e painel de força com score 0–100 e setas M1 a W1",
      "Triângulos de recuo (toque na fita 8/21 e fecho a favor) e pontos de onda (Stoch RSI a sair da zona)",
      "Estrutura HH/HL/LH/LL, linhas de tendência pelos pivots e bandas de volatilidade 2σ e 3σ",
      "Máximos e mínimos das sessões de Nova Iorque, Londres e Ásia, com etiquetas",
    ],
    techSpecs: [
      "Oscilador Stoch RSI 14 / %K 5 / suavização 1 e 1, zonas 80 e 20, fase pela EMA 260",
      "Swing de 21 velas para as etiquetas e lookback de 13 para as linhas de tendência",
      "Sinais em 5, 15 e 30 minutos ligáveis um a um; outros timeframes sempre activos",
      "Alertas JSON com entrada, stop para lá do recuo, alvo a 2R e score, prontos para webhook",
      "Forex, ouro, índices e cripto; ferramenta educativa, não executa ordens",
    ],
    products: [
      { id: "qt-semestral", label: "Semestral", price: "50€", priceNote: "6 meses de acesso", planId: "quantum_semestral" },
      { id: "qt-lifetime", label: "Vitalício", price: "350€", priceNote: "Pagamento único", planId: "quantum_lifetime", highlight: true },
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
