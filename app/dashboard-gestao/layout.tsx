import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Dashboard Gestão | MoreThanMoney",
  description: "Painel de gestão com agentes IA MTM",
  robots: { index: false, follow: false },
}

export default function DashboardGestaoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      {children}
    </div>
  )
}
