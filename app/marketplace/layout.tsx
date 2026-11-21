import type { Metadata } from "next"

// Título e descrição próprios desta rota (a página é client component e não pode exportar metadata).
export const metadata: Metadata = {
  title: "Marketplace | MoreThanMoney",
  description:
    "Montra MoreThanMoney: cursos, scanners e ferramentas de educadores e parceiros, para aprender trading e finanças com método.",
}

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
