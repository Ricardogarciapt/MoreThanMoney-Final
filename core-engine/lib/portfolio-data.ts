// Dados do Portfólio MTM baseados no Notion
// https://harmonious-comma-e85.notion.site/Portefolio-Cripto-e-Stocks-76557dddfbc348aba2f6e24ea1f5133e

export interface CryptoAsset {
  /** Reforço por SEXTA, em dólares. É a cadência real da casa; o mensal é derivado. */
  reforco_semanal?: number
  categoria: string
  criptomoeda: string
  symbol: string // Símbolo para Binance (ex: BTCUSDT, ETHUSDT)
  percentual: number
  investimento_inicial: number // em EUR
  reforco_mensal: number // em EUR
  reforco_anual: number // em EUR
  potencial_crescimento_percent: number
  potencial_crescimento_valor: number // em EUR
  entry_price?: number // Preço de entrada em 10 de março de 2025
}

export interface ETFAsset {
  categoria: string
  etf: string
  symbol: string // Símbolo para Yahoo Finance (ex: ARKK, SPY)
  percentual: number
  investimento_inicial: number // em EUR
  reforco_semanal: number // em EUR
  reforco_total_5anos: number // em EUR
  crescimento_esperado_percent: number
  crescimento_esperado_valor: number // em EUR
  entry_price?: number // Preço de entrada em 10 de março de 2025
}

// Data de início do portfólio
export const PORTFOLIO_START_DATE = '2025-03-10'

// Preços históricos de entrada (10 março 2025)
// Baseados em análise técnica e médias do período
export const HISTORICAL_ENTRY_PRICES: Record<string, number> = {
  // Crypto - Médias Capitalizações
  'ADAUSDT': 0.52,
  'XRPUSDT': 2.10,
  'DOTUSDT': 3.80,
  
  // Crypto - Pequenas Capitalizações
  'MATICUSDT': 0.42,
  'LINKUSDT': 18.50,
  'AVAXUSDT': 25.00,
  'VETUSDT': 0.018,
  
  // Crypto - Projetos Emergentes
  'ARBUSDT': 0.48,
  'OPUSDT': 0.75,
  'GRTUSDT': 0.09,
  'HBARUSDT': 0.18,
  'KASUSDT': 0.12,
  'JUPUSDT': 0.50,
  'ALGOUSDT': 0.19,
  'IMXUSDT': 0.72,
  'ONDOUSDT': 0.78,
  'JTOUSDT': 1.80,
  'AEROUSDT': 0.85,
  'ILVUSDT': 18.00,
  'FLOWUSDT': 0.40,
  'USDTUSDT': 1.00,
  
  // ETFs
  'ARKK': 75.00,
  'BOTZ': 32.50,
  'BLOK': 65.00,
  'SPY': 620.00,
  'EEM': 48.00,
  'ICLN': 14.50,
  'CIBR': 70.00,
  'IGF': 58.00
}

// Portfólio de Criptomoedas MTM
export const cryptoPortfolio: CryptoAsset[] = [
  // Médias Capitalizações
  { categoria: "Médias Capitalizações", criptomoeda: "Cardano", symbol: "ADAUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 200, potencial_crescimento_valor: 315, entry_price: 0.52 },
  { categoria: "Médias Capitalizações", criptomoeda: "XRP", symbol: "XRPUSDT", percentual: 15, investimento_inicial: 75, reforco_mensal: 30, reforco_anual: 390, potencial_crescimento_percent: 400, potencial_crescimento_valor: 1860, entry_price: 2.10 },
  { categoria: "Médias Capitalizações", criptomoeda: "Polkadot", symbol: "DOTUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 300, potencial_crescimento_valor: 405, entry_price: 3.80 },
  
  // Pequenas Capitalizações
  { categoria: "Pequenas Capitalizações", criptomoeda: "Polygon", symbol: "MATICUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 200, potencial_crescimento_valor: 315, entry_price: 0.42 },
  { categoria: "Pequenas Capitalizações", criptomoeda: "Chainlink", symbol: "LINKUSDT", percentual: 10, investimento_inicial: 50, reforco_mensal: 20, reforco_anual: 260, potencial_crescimento_percent: 350, potencial_crescimento_valor: 1085, entry_price: 18.50 },
  { categoria: "Pequenas Capitalizações", criptomoeda: "Avalanche", symbol: "AVAXUSDT", percentual: 10, investimento_inicial: 50, reforco_mensal: 20, reforco_anual: 260, potencial_crescimento_percent: 400, potencial_crescimento_valor: 1150, entry_price: 25.00 },
  { categoria: "Pequenas Capitalizações", criptomoeda: "VeChain", symbol: "VETUSDT", percentual: 10, investimento_inicial: 50, reforco_mensal: 20, reforco_anual: 260, potencial_crescimento_percent: 500, potencial_crescimento_valor: 1550, entry_price: 0.018 },
  
  // Projetos Emergentes
  { categoria: "Projetos Emergentes", criptomoeda: "Arbitrum", symbol: "ARBUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 600, potencial_crescimento_valor: 805, entry_price: 0.48 },
  { categoria: "Projetos Emergentes", criptomoeda: "Optimism", symbol: "OPUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 700, potencial_crescimento_valor: 935, entry_price: 0.75 },
  { categoria: "Projetos Emergentes", criptomoeda: "The Graph", symbol: "GRTUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 800, potencial_crescimento_valor: 1065, entry_price: 0.09 },
  { categoria: "Projetos Emergentes", criptomoeda: "Hedera", symbol: "HBARUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 500, potencial_crescimento_valor: 775, entry_price: 0.18 },
  { categoria: "Projetos Emergentes", criptomoeda: "Kaspa", symbol: "KASUSDT", percentual: 10, investimento_inicial: 50, reforco_mensal: 20, reforco_anual: 260, potencial_crescimento_percent: 1000, potencial_crescimento_valor: 3100, entry_price: 0.12 },
  { categoria: "Projetos Emergentes", criptomoeda: "Jupiter", symbol: "JUPUSDT", percentual: 10, investimento_inicial: 50, reforco_mensal: 20, reforco_anual: 260, potencial_crescimento_percent: 1000, potencial_crescimento_valor: 3100, entry_price: 0.50 },
  { categoria: "Projetos Emergentes", criptomoeda: "Algorand", symbol: "ALGOUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 300, potencial_crescimento_valor: 405, entry_price: 0.19 },
  { categoria: "Projetos Emergentes", criptomoeda: "Immutable", symbol: "IMXUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 700, potencial_crescimento_valor: 935, entry_price: 0.72 },
  { categoria: "Projetos Emergentes", criptomoeda: "ONDO", symbol: "ONDOUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 700, potencial_crescimento_valor: 935, entry_price: 0.78 },
  { categoria: "Projetos Emergentes", criptomoeda: "JTO", symbol: "JTOUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 800, potencial_crescimento_valor: 1065, entry_price: 1.80 },
  { categoria: "Projetos Emergentes", criptomoeda: "Aero", symbol: "AEROUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 700, potencial_crescimento_valor: 935, entry_price: 0.85 },
  { categoria: "Projetos Emergentes", criptomoeda: "ILV", symbol: "ILVUSDT", percentual: 10, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 800, potencial_crescimento_valor: 1065, entry_price: 18.00 },
  { categoria: "Projetos Emergentes", criptomoeda: "Flow", symbol: "FLOWUSDT", percentual: 5, investimento_inicial: 25, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 600, potencial_crescimento_valor: 805, entry_price: 0.40 },
  
  // Stablecoins
  { categoria: "Stablecoins", criptomoeda: "Tether", symbol: "USDTUSDT", percentual: 15, investimento_inicial: 75, reforco_mensal: 10, reforco_anual: 130, potencial_crescimento_percent: 0, potencial_crescimento_valor: 185, entry_price: 1.00 },
]

// Portfólio de ETFs MTM (Horizonte 5 anos)
export const etfPortfolio: ETFAsset[] = [
  { categoria: "Tecnologia e Inovação", etf: "ARK Innovation ETF", symbol: "ARKK", percentual: 20, investimento_inicial: 20, reforco_semanal: 5, reforco_total_5anos: 1300, crescimento_esperado_percent: 300, crescimento_esperado_valor: 5200, entry_price: 75.00 },
  { categoria: "Inteligência Artificial", etf: "Global X Robotics & AI", symbol: "BOTZ", percentual: 15, investimento_inicial: 15, reforco_semanal: 3.75, reforco_total_5anos: 975, crescimento_esperado_percent: 200, crescimento_esperado_valor: 2925, entry_price: 32.50 },
  { categoria: "Blockchain e Cripto", etf: "Amplify Transformational Data", symbol: "BLOK", percentual: 15, investimento_inicial: 15, reforco_semanal: 3.75, reforco_total_5anos: 975, crescimento_esperado_percent: 300, crescimento_esperado_valor: 3900, entry_price: 65.00 },
  { categoria: "Índice Geral (USA)", etf: "SPDR S&P 500 ETF Trust", symbol: "SPY", percentual: 15, investimento_inicial: 15, reforco_semanal: 3.75, reforco_total_5anos: 975, crescimento_esperado_percent: 100, crescimento_esperado_valor: 1950, entry_price: 620.00 },
  { categoria: "Mercados Emergentes", etf: "iShares MSCI Emerging Markets ETF", symbol: "EEM", percentual: 15, investimento_inicial: 15, reforco_semanal: 3.75, reforco_total_5anos: 975, crescimento_esperado_percent: 150, crescimento_esperado_valor: 2437.50, entry_price: 48.00 },
  { categoria: "Energia Limpa", etf: "iShares Global Clean Energy ETF", symbol: "ICLN", percentual: 10, investimento_inicial: 10, reforco_semanal: 2.50, reforco_total_5anos: 650, crescimento_esperado_percent: 250, crescimento_esperado_valor: 2275, entry_price: 14.50 },
  { categoria: "Segurança Cibernética", etf: "First Trust Cybersecurity ETF", symbol: "CIBR", percentual: 5, investimento_inicial: 5, reforco_semanal: 1.25, reforco_total_5anos: 325, crescimento_esperado_percent: 150, crescimento_esperado_valor: 812.50, entry_price: 70.00 },
  { categoria: "Infraestrutura Global", etf: "iShares Global Infrastructure", symbol: "IGF", percentual: 5, investimento_inicial: 5, reforco_semanal: 1.25, reforco_total_5anos: 325, crescimento_esperado_percent: 100, crescimento_esperado_valor: 650, entry_price: 58.00 },
]

// Totais
export const portfolioTotals = {
  crypto: {
    investimento_total: 775,
    reforco_mensal: 280,
    reforco_anual: 3640,
    crescimento_potencial: 22810,
    percentual_total: 100
  },
  etf: {
    investimento_inicial: 100,
    reforco_semanal: 25,
    reforco_total_5anos: 6500,
    crescimento_esperado: 20150,
    percentual_total: 100
  },
  total: {
    investido: 10275, // 3.675 (crypto) + 6.600 (ETF)
    crescimento_simulado: 40025, // 19.875 (crypto) + 20.150 (ETF)
    multiplicacao: 4 // ~4x em 5 anos
  }
}

// Helper para obter todos os símbolos crypto
export function getAllCryptoSymbols(): string[] {
  return cryptoPortfolio
    .filter(asset => asset.symbol !== "USDTUSDT") // Excluir stablecoin
    .map(asset => asset.symbol)
}

// Helper para obter todos os símbolos ETF
export function getAllETFSymbols(): string[] {
  return etfPortfolio.map(asset => asset.symbol)
}

// Helper para agrupar por categoria
export function groupCryptoByCategory() {
  return cryptoPortfolio.reduce((acc, asset) => {
    if (!acc[asset.categoria]) {
      acc[asset.categoria] = []
    }
    acc[asset.categoria].push(asset)
    return acc
  }, {} as Record<string, CryptoAsset[]>)
}

export function groupETFByCategory() {
  return etfPortfolio.reduce((acc, asset) => {
    if (!acc[asset.categoria]) {
      acc[asset.categoria] = []
    }
    acc[asset.categoria].push(asset)
    return acc
  }, {} as Record<string, ETFAsset[]>)
}

