import type { Metadata } from "next"

// Título e descrição próprios desta rota (a página é client component e não pode exportar metadata).
export const metadata: Metadata = {
  title: "Scanners de trading | MoreThanMoney",
  description:
    "Catálogo dos scanners MTM para TradingView: acesso semestral ou vitalício, ou incluídos no Pack. Ferramentas de análise, sem promessas de lucro.",
}

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
