import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { linkAgendar } from "@/lib/agenda/link"
import { dicionario } from "@/lib/site-solucoes/i18n/dicionarios"
import { idiomaDoPedido, tradutorServidor } from "@/lib/site-solucoes/i18n/servidor"
import { IdiomaSolucoes } from "@/components/solucoes/idioma"
import { VerPrototipo, type EstadoPrototipo } from "@/components/solucoes/ver-prototipo"
import type { PrototipoSpec } from "@/lib/site-solucoes/prototipo"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string | string[] }> }

async function ler(slug: string) {
  if (!/^[a-z0-9-]{6,48}$/.test(slug)) return null
  const { data } = await getSupabaseAdmin()
    .from("prototipos_solucao")
    .select("slug, spec, estado, reuniao_em, prazo_demo, demo_url")
    .eq("slug", slug)
    .neq("estado", "arquivado")
    .maybeSingle()
  return data
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, q] = await Promise.all([params, searchParams])
  const idioma = await idiomaDoPedido(q.lang)
  const { tf } = tradutorServidor(idioma)
  const p = await ler(slug)
  const empresa = (p?.spec as PrototipoSpec | undefined)?.empresa ?? "MoreThanMoney"
  // O protótipo tem o nome do negócio: fica fora dos motores de busca.
  return { title: tf("Protótipo · {empresa}", { empresa }), robots: { index: false, follow: false } }
}

/** /solucoes/prototipo/[slug]: o protótipo de um negócio, partilhável pelo link (não indexado). */
export default async function PaginaPrototipo({ params, searchParams }: Props) {
  const [{ slug }, q] = await Promise.all([params, searchParams])
  const idioma = await idiomaDoPedido(q.lang)
  const { t } = tradutorServidor(idioma)
  const p = await ler(slug)
  if (!p) notFound()
  const estado: EstadoPrototipo = { estado: p.estado, reuniaoEm: p.reuniao_em, prazoDemo: p.prazo_demo, demoUrl: p.demo_url }
  const agendar = `${linkAgendar("negocios")}&prototipo=${encodeURIComponent(slug)}`

  return (
    <IdiomaSolucoes idioma={idioma} dic={dicionario(idioma)}>
      <main lang={idioma} className="min-h-[100dvh] bg-[#08090C] px-4 pb-20 pt-8 text-zinc-100 [background-image:radial-gradient(ellipse_at_top,rgba(210,166,60,0.12),transparent_55%)]">
        <div className="mx-auto max-w-6xl">
          <Link href="/solucoes" className="inline-flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> MoreThanMoney {t("Soluções")}
          </Link>
          <div className="mt-6">
            <VerPrototipo spec={p.spec as PrototipoSpec} estado={estado} agendar={agendar} />
          </div>
          <p className="mx-auto mt-14 max-w-2xl text-center text-xs text-zinc-600">{t("Protótipo ilustrativo gerado por IA a partir dos dados que nos deste. Preços, horários e textos finais confirmam-se na reunião.")}</p>
        </div>
      </main>
    </IdiomaSolucoes>
  )
}
