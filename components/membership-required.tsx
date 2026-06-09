"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

// Portfólios da MoreThanMoney baseados no Notion
const portfolios = [
  {
    name: "Portfólio de Criptomoedas",
    type: "Cripto",
    allocation: [
      { asset: "Bitcoin (BTC)", percentage: 40, trend: "up" },
      { asset: "Ethereum (ETH)", percentage: 30, trend: "up" },
      { asset: "Solana (SOL)", percentage: 15, trend: "up" },
      { asset: "Chainlink (LINK)", percentage: 10, trend: "neutral" },
      { asset: "Cardano (ADA)", percentage: 5, trend: "down" },
    ],
    riskLevel: "Moderado-Alto",
    description:
      "Portfólio focado nas principais criptomoedas com maior capitalização de mercado e potencial de crescimento a longo prazo.",
    lastUpdated: "15 de Maio, 2023",
  },
  {
    name: "Portfólio de Ações",
    type: "Stocks",
    allocation: [
      { asset: "Apple (AAPL)", percentage: 25, trend: "up" },
      { asset: "Microsoft (MSFT)", percentage: 20, trend: "up" },
      { asset: "Amazon (AMZN)", percentage: 15, trend: "neutral" },
      { asset: "Tesla (TSLA)", percentage: 10, trend: "down" },
      { asset: "Nvidia (NVDA)", percentage: 30, trend: "up" },
    ],
    riskLevel: "Moderado",
    description:
      "Portfólio concentrado em empresas de tecnologia com forte posição de mercado e potencial de crescimento consistente.",
    lastUpdated: "15 de Maio, 2023",
  },
  {
    name: "Portfólio Balanceado",
    type: "Misto",
    allocation: [
      { asset: "Ações (Stocks)", percentage: 40, trend: "up" },
      { asset: "Criptomoedas", percentage: 30, trend: "up" },
      { asset: "ETFs", percentage: 20, trend: "neutral" },
      { asset: "Stablecoins", percentage: 10, trend: "neutral" },
    ],
    riskLevel: "Moderado",
    description:
      "Portfólio diversificado entre diferentes classes de ativos, oferecendo uma abordagem equilibrada de risco e retorno.",
    lastUpdated: "15 de Maio, 2023",
  },
]

export function MembershipRequired({ children }: { children?: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false)
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()

  // Garantir que estamos no lado do cliente
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Não renderizar nada no servidor
  if (!isClient) {
    return null
  }

  // Mostrar loading compacto
  if (isLoading) {
    return (
      <div className="flex items-center justify-center bg-gray-900/50 border border-amber-500/20 rounded-lg p-8 min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-amber-400">A verificar autenticação...</p>
        </div>
      </div>
    )
  }

  // POLÍTICA UNIFICADA: Se autenticado, permite acesso
  // Não verifica user_type, is_active, etc - apenas se está logado
  if (isAuthenticated) {
    // Se tem children (como TradingView), renderiza eles
    if (children) {
      return <>{children}</>
    }

    // Se não tem children, é a página de portfólios - renderiza conteúdo padrão
    // (este código pode ser movido para uma página dedicada depois)
    return <div className="text-white">Conteúdo disponível</div>
  }

  // Se NÃO está autenticado, redirecionar para login
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center bg-gray-900/50 border border-amber-500/20 rounded-lg p-8">
      <div className="mb-8 flex flex-col items-center max-w-md">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border-4 border-amber-500">
          <Lock className="h-8 w-8 text-amber-500" />
        </div>
        <h2 className="mb-2 text-center text-2xl font-bold text-amber-500">Login Necessário</h2>
        <p className="mb-6 text-center text-gray-300">
          Faça login para aceder a este conteúdo.
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => router.push('/login')}
            className="rounded bg-mtm-primary hover:bg-mtm-primary-dark px-6 py-2 font-semibold text-black transition"
          >
            Fazer Login
          </button>
          <button
            onClick={() => router.push('/register')}
            className="rounded border border-mtm-primary px-6 py-2 font-semibold text-mtm-primary transition hover:bg-mtm-primary/10"
          >
            Criar Conta
          </button>
        </div>
      </div>
    </div>
  )
}

// Mantendo a exportação padrão para compatibilidade com código existente
export default MembershipRequired
