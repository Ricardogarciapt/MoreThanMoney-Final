import type { Metadata } from "next"
import WorkLandingPage from "@/components/work-landing-page"

export const metadata: Metadata = {
  title: "Trabalha Connosco | MoreThanMoney — Equipa de Crescimento",
  description:
    "Junta-te à equipa global da MoreThanMoney. Vagas para Prospectores, Setters e Closers. Modelo remoto, formação interna e comissões recorrentes.",
  openGraph: {
    title: "Trabalha Connosco | MoreThanMoney",
    description: "Recrutamento: Prospectores, Setters e Closers. Equipa de crescimento global.",
    locale: "pt_PT",
  },
}

export default function WorkPage() {
  return (
    <main className="min-h-screen bg-[#050505]">
      <WorkLandingPage />
    </main>
  )
}
