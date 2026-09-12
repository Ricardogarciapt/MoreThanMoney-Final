import type { Metadata } from "next"
import NewLandingPage from "@/components/new-landing-page-v2"
import SplashPromos from "@/components/mtmfunded/splash-promos"
import { promosAtivas } from "@/lib/mtmfunded/promos"

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
 * O splash das campanhas na porta de entrada do site.
 *
 * Vivia só no /mtmfunded, que é onde chega quem já sabe o que procura. O sorteio existe
 * precisamente para trazer quem AINDA não sabe — e essa gente chega aqui.
 *
 * A lista vem da base de dados: acabada a campanha, o pop-up desaparece sozinho. Sem campanha
 * activa, `promosAtivas()` devolve vazio e o componente não desenha nada — não há pop-up nenhum
 * a fechar.
 */
export default async function NewLanding() {
  const promos = await promosAtivas()
  return (
    <>
      <SplashPromos promos={promos} />
      <NewLandingPage />
    </>
  )
}
