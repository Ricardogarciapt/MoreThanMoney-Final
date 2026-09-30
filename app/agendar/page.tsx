import type { Metadata } from "next"
import { Suspense } from "react"
import Marcar from "@/components/agenda/marcar"

/**
 * /agendar — a página que substitui o Calendly.
 *
 * É esta que vai no Beacons, no botão «Agenda já» e no email de onboarding. Por isso:
 *  · não tem navbar nem rodapé do site. Quem chega de um link de bio vem fazer UMA coisa, e um
 *    menu com quinze destinos é uma lista de sítios para onde ir em vez de marcar;
 *  · a metadata está escrita à mão — é o cartão que aparece quando alguém partilha o link.
 */

export const metadata: Metadata = {
  title: "Marcar uma chamada · MoreThanMoney",
  description: "Escolhe o assunto e a hora. 30 minutos, sem compromisso — e sais com o caminho claro.",
  openGraph: {
    title: "Marcar uma chamada · MoreThanMoney",
    description: "Escolhe o assunto e a hora. 30 minutos, sem compromisso.",
    type: "website",
  },
  robots: { index: true, follow: true },
}

// No Next 15 os `searchParams` chegam como promessa — lê-los como objecto compila e falha em
// produção. `?t=` existe para o link poder abrir já num assunto (ex.: /agendar?t=onboarding no email
// de boas-vindas), saltando o primeiro ecrã.
export default async function PaginaAgendar({ searchParams }: { searchParams?: Promise<{ t?: string }> }) {
  const params = await searchParams
  return (
    <main className="min-h-screen bg-black text-white [background-image:radial-gradient(ellipse_at_top,rgba(210,166,60,0.10),transparent_55%)]">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <header className="mb-10">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#D2A63C]/85">MoreThanMoney</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">
            Vamos falar.
          </h1>
          <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-zinc-400">
            Escolhe o assunto, escolhe a hora, e fica marcado. Sem formulários longos e sem
            «entramos em contacto».
          </p>
        </header>
        <Suspense fallback={null}>
          <Marcar slugInicial={params?.t} />
        </Suspense>
      </div>
    </main>
  )
}
