// Tipos para os dados do portfólio
interface Asset {
  name: string
  ticker: string
  allocation: number
  trend: "up" | "down" | "neutral"
  change: number
  price?: number
  reason?: string
}

interface Portfolio {
  id: string
  name: string
  type: "crypto" | "stocks" | "mixed"
  description: string
  riskLevel: "low" | "medium" | "high"
  assets: Asset[]
  performance: {
    daily: number
    weekly: number
    monthly: number
    yearly: number
  }
  lastUpdated: string
  nextUpdate: string
}

// Dados de exemplo para portfólios
export const portfolioData: Portfolio[] = [
  {
    id: "crypto-portfolio",
    name: "Portfólio Cripto",
    type: "crypto",
    description:
      "Portfólio focado nas principais criptomoedas com maior capitalização de mercado e potencial de crescimento a longo prazo.",
    riskLevel: "high",
    assets: [
      {
        name: "Bitcoin",
        ticker: "BTC",
        allocation: 40,
        trend: "up",
        change: 5.2,
        price: 63450.25,
        reason:
          "Bitcoin continua sendo o ativo digital dominante com maior adoção institucional. A aprovação recente de ETFs spot aumenta a legitimidade e acessibilidade.",
      },
      {
        name: "Ethereum",
        ticker: "ETH",
        allocation: 30,
        trend: "up",
        change: 3.8,
        price: 3245.75,
        reason:
          "Ethereum mantém sua posição como principal plataforma de contratos inteligentes. A transição para Proof of Stake e atualizações de escalabilidade fortalecem seu caso de uso.",
      },
      {
        name: "Solana",
        ticker: "SOL",
        allocation: 15,
        trend: "up",
        change: 8.7,
        price: 142.3,
        reason:
          "Solana oferece alta performance e baixas taxas, atraindo desenvolvedores e usuários. A recuperação recente demonstra resiliência após desafios anteriores.",
      },
      {
        name: "Chainlink",
        ticker: "LINK",
        allocation: 10,
        trend: "neutral",
        change: 0.5,
        price: 18.45,
        reason:
          "Chainlink é essencial para conectar contratos inteligentes a dados do mundo real. Sua tecnologia de oráculos é amplamente adotada em DeFi e outros setores.",
      },
      {
        name: "Cardano",
        ticker: "ADA",
        allocation: 5,
        trend: "down",
        change: -2.3,
        price: 0.58,
        reason:
          "Cardano mantém uma pequena alocação devido ao seu desenvolvimento acadêmico rigoroso, mas enfrenta desafios de adoção em comparação com outras plataformas.",
      },
    ],
    performance: {
      daily: 1.8,
      weekly: 7.5,
      monthly: 15.3,
      yearly: 85.7,
    },
    lastUpdated: "2023-05-15",
    nextUpdate: "2023-05-22",
  },
  {
    id: "stocks-portfolio",
    name: "Portfólio de Ações",
    type: "stocks",
    description:
      "Portfólio concentrado em empresas de tecnologia com forte posição de mercado e potencial de crescimento consistente.",
    riskLevel: "medium",
    assets: [
      {
        name: "Apple Inc.",
        ticker: "AAPL",
        allocation: 25,
        trend: "up",
        change: 2.1,
        price: 187.45,
        reason:
          "Apple mantém forte ecossistema de produtos e serviços com alta fidelidade de clientes. Crescimento consistente em serviços compensa a maturidade do mercado de smartphones.",
      },
      {
        name: "Microsoft Corp.",
        ticker: "MSFT",
        allocation: 20,
        trend: "up",
        change: 1.5,
        price: 415.2,
        reason:
          "Microsoft continua liderando em nuvem (Azure) e software empresarial. Sua diversificação em IA e gaming proporciona múltiplos vetores de crescimento.",
      },
      {
        name: "Amazon.com Inc.",
        ticker: "AMZN",
        allocation: 15,
        trend: "neutral",
        change: 0.3,
        price: 178.35,
        reason:
          "Amazon domina o e-commerce e serviços de nuvem (AWS). Margens melhoradas no varejo e crescimento contínuo em nuvem justificam a alocação.",
      },
      {
        name: "Tesla Inc.",
        ticker: "TSLA",
        allocation: 10,
        trend: "down",
        change: -3.7,
        price: 175.6,
        reason:
          "Tesla enfrenta maior competição no mercado de EVs, mas mantém vantagens tecnológicas. Reduzimos a alocação devido a preocupações com margens e valorização.",
      },
      {
        name: "NVIDIA Corp.",
        ticker: "NVDA",
        allocation: 30,
        trend: "up",
        change: 4.8,
        price: 925.15,
        reason:
          "NVIDIA é líder indiscutível em GPUs para IA e computação acelerada. A demanda por chips de IA continua superando as expectativas, justificando maior alocação.",
      },
    ],
    performance: {
      daily: 0.9,
      weekly: 2.8,
      monthly: 5.7,
      yearly: 32.4,
    },
    lastUpdated: "2023-05-15",
    nextUpdate: "2023-05-22",
  },
  {
    id: "balanced-portfolio",
    name: "Portfólio Balanceado",
    type: "mixed",
    description:
      "Portfólio diversificado entre diferentes classes de ativos, oferecendo uma abordagem equilibrada de risco e retorno.",
    riskLevel: "medium",
    assets: [
      {
        name: "Ações (ETF)",
        ticker: "VTI",
        allocation: 40,
        trend: "up",
        change: 1.2,
        price: 245.3,
        reason:
          "Exposição ampla ao mercado de ações americano através de ETF de baixo custo. Proporciona diversificação e captura do crescimento econômico geral.",
      },
      {
        name: "Criptomoedas",
        ticker: "CRYPTO",
        allocation: 20,
        trend: "up",
        change: 3.5,
        reason:
          "Alocação moderada em criptomoedas de alta capitalização (BTC e ETH) para exposição a esta classe de ativos emergente.",
      },
      {
        name: "Renda Fixa",
        ticker: "BONDS",
        allocation: 25,
        trend: "neutral",
        change: 0.1,
        reason:
          "Títulos de médio prazo para estabilidade e geração de renda. Ajuda a reduzir a volatilidade geral do portfólio.",
      },
      {
        name: "Ouro",
        ticker: "GLD",
        allocation: 10,
        trend: "up",
        change: 0.8,
        price: 2320.45,
        reason:
          "Ouro como hedge contra inflação e instabilidade econômica. Historicamente tem baixa correlação com ações e títulos.",
      },
      {
        name: "Stablecoins",
        ticker: "USDC",
        allocation: 5,
        trend: "neutral",
        change: 0.0,
        price: 1.0,
        reason:
          "Reserva de valor em stablecoins para aproveitar oportunidades de compra e gerar rendimento em protocolos DeFi seguros.",
      },
    ],
    performance: {
      daily: 0.5,
      weekly: 1.8,
      monthly: 3.2,
      yearly: 18.5,
    },
    lastUpdated: "2023-05-15",
    nextUpdate: "2023-05-22",
  },
]

// Função para buscar dados dos portfólios
// Em produção, isso buscaria dados da API do Notion ou de um backend
export async function fetchPortfolioData(): Promise<Portfolio[]> {
  // Simulando uma chamada de API
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(portfolioData)
    }, 1000) // Simula um atraso de rede de 1 segundo
  })
}

// Em uma implementação real, você teria uma função para buscar dados do Notion
// Exemplo de como poderia ser:
/*
export async function fetchNotionPortfolioData() {
  // Você precisaria de uma API key do Notion e o ID da database
  const NOTION_API_KEY = process.env.NOTION_API_KEY
  const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID
  
  const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sorts: [{ property: 'Name', direction: 'ascending' }]
    })
  })
  
  const data = await response.json()
  
  // Transformar os dados do Notion para o formato que precisamos
  return transformNotionData(data)
}

function transformNotionData(notionData) {
  // Lógica para transformar os dados do Notion no formato de Portfolio[]
  // ...
}
*/
