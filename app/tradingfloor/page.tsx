import type { Metadata } from "next"
import TradingFloorLandingPage from "@/components/trading-floor-landing-page"

export const metadata: Metadata = {
  title: "Trading Floor | MoreThanMoney — Recrutamento",
  description:
    "Recrutamento para o Trading Floor da MoreThanMoney: IBs, Analistas e Junior Traders. Junta-te a uma estrutura profissional focada em AUM e performance.",
  openGraph: {
    title: "Trading Floor | MoreThanMoney",
    description: "Candidaturas abertas para IBs, Analistas e Junior Traders.",
    locale: "pt_PT",
  },
}

export default function TradingFloorPage() {
  return (
    <main className="min-h-screen bg-[#050505]">
      <TradingFloorLandingPage />
    </main>
  )
}

