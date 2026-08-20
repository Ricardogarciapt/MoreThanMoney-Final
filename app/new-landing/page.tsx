import type { Metadata } from "next"
import NewLandingPage from "@/components/new-landing-page-v2"

export const metadata: Metadata = {
  title: "MoreThanMoney — formação, sinais e execução no mesmo sítio",
  description:
    "O sinal chega, decides com um toque, e a partir daí é o motor que trata dele — até fechar. Escola certificada, cripto, terminal com IA e comunidade. Sem fidelização.",
  openGraph: {
    title: "MoreThanMoney",
    description:
      "Formação, sinais, execução, cripto e certificação — no mesmo sítio, e todos construídos por nós.",
    url: "https://www.morethanmoney.pt/new-landing",
    siteName: "More Than Money",
    locale: "pt_PT",
    type: "website",
  },
}

export default function NewLanding() {
  return <NewLandingPage />
}
