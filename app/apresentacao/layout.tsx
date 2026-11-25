import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Apresentação MoreThanMoney 2026 — educação financeira e ferramentas de trading",
  description:
    "Mais do que dinheiro. É um sistema. Educação financeira com método, scanners próprios e ferramentas de trading com gestão de risco. Sem promessas de lucro.",
}

export default function ApresentacaoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
