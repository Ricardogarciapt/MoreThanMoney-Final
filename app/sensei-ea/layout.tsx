import type { Metadata } from "next"

// Título e descrição próprios desta rota (a página é client component e não pode exportar metadata).
export const metadata: Metadata = {
  title: "Sensei EA — Expert Advisor para MT5 | MoreThanMoney",
  description:
    "Sensei EA: Expert Advisor da MoreThanMoney para MetaTrader 5, com gestão de risco configurável. Conteúdo educativo, sem garantia de resultados.",
}

export default function SenseiEaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
