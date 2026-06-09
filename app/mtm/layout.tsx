import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Educação MTM | MoreThanMoney",
  description:
    "Ecossistema MoreThanMoney: estrutura para investir com educação aplicada, Skool, IQONIC e tecnologia. Ganha enquanto aprendes com processo e risco controlado.",
  openGraph: {
    title: "Educação MTM | MoreThanMoney",
    description:
      "Roadmap de profissionalização: fundamentos, prática e desenvolvimento no ecossistema MTM.",
    locale: "pt_PT",
    type: "website",
  },
}

export default function MtmLayout({ children }: { children: React.ReactNode }) {
  return children
}
