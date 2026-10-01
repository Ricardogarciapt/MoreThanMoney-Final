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

/**
 * A porta de entrada do site, sem nada por cima.
 *
 * Teve aqui um pop-up com as campanhas do MTM Funded. Saiu a 01/10 por decisão do dono: quem
 * chega à landing ainda não sabe o que procura, e a primeira coisa que via era uma janela para
 * fechar. As campanhas continuam vivas e a sair da base de dados — mas em /mtmfunded, que é onde
 * chega quem já está interessado. Se voltar a ser preciso trazê-las para aqui, que seja como
 * secção da página e não como janela por cima dela.
 */
export default async function NewLanding() {
  return <NewLandingPage />
}
