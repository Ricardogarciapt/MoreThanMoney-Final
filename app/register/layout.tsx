import type { Metadata } from "next"

// Título e descrição próprios desta rota (a página é client component e não pode exportar metadata).
export const metadata: Metadata = {
  title: "Criar conta | MoreThanMoney",
  description:
    "Cria a tua conta MoreThanMoney e começa com 3 dias de Premium grátis, sem cartão. Educação financeira, scanners e ferramentas de trading com gestão de risco.",
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
