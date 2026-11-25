import type { Metadata } from "next"

// Título e descrição próprios desta rota (a página é client component e não pode exportar metadata).
export const metadata: Metadata = {
  title: "Ativar Premium | MoreThanMoney",
  description:
    "Ativa o teu plano Premium MoreThanMoney para continuar com acesso às estratégias, scanners e ferramentas da plataforma.",
}

export default function AtivarPremiumLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
