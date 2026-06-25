import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "MoreThanMoney — Apresentação de Oportunidade 2026",
  description:
    "Mais do que dinheiro. É um sistema. Educação financeira real, scanners exclusivos e modelo de negócio 100% remoto.",
}

export default function ApresentacaoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
