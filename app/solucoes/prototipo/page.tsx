import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Clock, ShieldCheck, Sparkles } from "lucide-react"
import { dicionario } from "@/lib/site-solucoes/i18n/dicionarios"
import { idiomaDoPedido, tradutorServidor } from "@/lib/site-solucoes/i18n/servidor"
import { IdiomaSolucoes } from "@/components/solucoes/idioma"
import { PedirPrototipo } from "@/components/solucoes/pedir-prototipo"

type Q = Record<string, string | string[] | undefined>
type Props = { searchParams: Promise<Q> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const idioma = await idiomaDoPedido((await searchParams).lang)
  const { t } = tradutorServidor(idioma)
  return {
    title: t("Recebe o protótipo da tua solução · MoreThanMoney Soluções"),
    description: t("A nossa IA monta em segundos o protótipo da app e do assistente do teu negócio. A demo com a tua marca segue até 24 h depois da reunião."),
    robots: { index: true, follow: true },
    alternates: { canonical: "https://www.morethanmoney.pt/solucoes/prototipo" },
  }
}

/**
 * /solucoes/prototipo: o pedido do protótipo (Ricardo, 21/11/2026). Chega da proposta em PDF, do
 * relatório da análise, do /solucoes e do showroom /demos, com os dados que já tivermos na query.
 */
export default async function PaginaPedirPrototipo({ searchParams }: Props) {
  const q = await searchParams
  const idioma = await idiomaDoPedido(q.lang)
  const { t } = tradutorServidor(idioma)
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 80)
  const inicial = Object.fromEntries(["proposta", "empresa", "negocio", "sector", "modelo", "cor", "solucoes"].map((k) => [k, um(q[k])]))

  return (
    <IdiomaSolucoes idioma={idioma} dic={dicionario(idioma)}>
      <main lang={idioma} className="min-h-[100dvh] bg-[#08090C] px-4 pb-20 pt-8 text-zinc-100 [background-image:radial-gradient(ellipse_at_top,rgba(210,166,60,0.14),transparent_55%)]">
        <div className="mx-auto max-w-5xl">
          <Link href="/solucoes" className="inline-flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> MoreThanMoney {t("Soluções")}
          </Link>
          <header className="mx-auto mt-6 max-w-2xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-3 py-1 text-xs font-semibold text-[#E9C46A]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {t("Grátis e sem compromisso")}
            </p>
            <h1 className="mt-4 text-3xl font-black leading-tight md:text-5xl">{t("Recebe o protótipo da tua solução")}</h1>
            <p className="mt-3 text-zinc-400">{t("Diz-nos o essencial. A nossa IA monta logo a app e o assistente do teu negócio, marcas a reunião e a demo com a tua marca segue até 24 h depois.")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-[#D2A63C]" aria-hidden="true" /> {t("Protótipo na hora")}</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-[#D2A63C]" aria-hidden="true" /> {t("Demo até 24 h depois da reunião")}</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[#D2A63C]" aria-hidden="true" /> {t("Os teus dados só servem para isto")}</span>
            </div>
          </header>
          <div className="mt-10">
            <PedirPrototipo inicial={inicial} />
          </div>
        </div>
      </main>
    </IdiomaSolucoes>
  )
}
