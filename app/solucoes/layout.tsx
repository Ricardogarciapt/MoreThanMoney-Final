import type { Metadata } from "next"
import ApoioSlot from "@/components/solucoes/apoio-slot"

export const metadata: Metadata = {
  title: "MoreThanMoney Soluções | Sites, apps e agentes de IA para pequenos negócios",
  description:
    "Automatizamos o que te rouba horas: página com app, agentes de IA, scanners em licença, white label e cursos narrados. Sem subscrições externas.",
  alternates: { canonical: "https://www.morethanmoney.pt/solucoes" },
  openGraph: {
    title: "MoreThanMoney Soluções",
    description: "Sites, apps e agentes de IA para pequenos negócios, traders e educadores.",
    images: ["/images/apresentacao/app-chat.jpg"],
  },
}

export default function SolucoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ApoioSlot />
    </>
  )
}
