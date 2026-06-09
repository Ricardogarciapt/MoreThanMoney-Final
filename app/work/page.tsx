import type { Metadata } from "next"
import WorkLandingPage from "@/components/work-landing-page"

export const metadata: Metadata = {
  title: "Trabalha Connosco | MoreThanMoney — Equipa de Crescimento",
  description:
    "Junta-te à equipa global da MoreThanMoney. Vagas para Setters, Closers e Growth Partners. Modelo remoto, formação interna e comissões recorrentes.",
  openGraph: {
    title: "Trabalha Connosco | MoreThanMoney",
    description: "Recrutamento: Setters, Closers e Growth Partners. Equipa de crescimento global.",
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
