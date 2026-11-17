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
    url: "https://www.morethanmoney.pt/solucoes",
    siteName: "MoreThanMoney",
    locale: "pt_PT",
    type: "website",
    images: [{ url: "/images/og/solucoes.jpg", width: 1200, height: 630, alt: "Pré-visualização de morethanmoney.pt/solucoes" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MoreThanMoney Soluções",
    description: "Sites, apps e agentes de IA para pequenos negócios, traders e educadores.",
    images: ["/images/og/solucoes.jpg"],
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
