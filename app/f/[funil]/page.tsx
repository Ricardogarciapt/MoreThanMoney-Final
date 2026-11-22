import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import FormularioFunil from '@/components/funis/formulario-funil'
import MedicaoConsentida from '@/components/funis/medicao-consentida'
import { AVISO_GERAL, FUNIS, FUNIS_PUBLICIDADE, ehFunilPublicidade } from '@/lib/funis-publicidade'

/**
 * /f/<funil> — as páginas de entrada dos anúncios: /f/educacao, /f/corretora, /f/funded.
 *
 * Uma página por funil, um só objetivo (deixar o contacto), o atalho para quem já decidiu, e os
 * avisos à vista. O texto vive em `lib/funis-publicidade.ts` (guardado por `.check.ts`).
 * `noindex`: são páginas de anúncio, não concorrem com as páginas de produto na pesquisa.
 */
export const dynamicParams = false

export function generateStaticParams() {
  return FUNIS_PUBLICIDADE.map((funil) => ({ funil }))
}

type Props = { params: Promise<{ funil: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { funil } = await params
  if (!ehFunilPublicidade(funil)) return {}
  const f = FUNIS[funil]
  return {
    title: f.seo.titulo,
    description: f.seo.descricao,
    robots: { index: false, follow: true },
    openGraph: { title: f.seo.titulo, description: f.seo.descricao, images: [f.imagem.src] },
  }
}

export default async function PaginaFunil({ params }: Props) {
  const { funil } = await params
  if (!ehFunilPublicidade(funil)) notFound()
  const f = FUNIS[funil]

  return (
    <main className="min-h-[100dvh] bg-[#0A0A0B] text-zinc-100">
      {/* Hero: mensagem e ação à esquerda, imagem real à direita; empilha no telemóvel. */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-6 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div>
          <h1 className="text-3xl font-semibold leading-[1.08] tracking-tight text-white md:text-5xl">{f.titulo}</h1>
          <p className="mt-3 hidden max-w-[52ch] text-[16px] leading-relaxed text-zinc-300 sm:block">{f.subtitulo}</p>
          {/* O contacto logo aqui, acima da dobra no telemóvel (22/11: 110 visitas, 0 contactos com ele no fundo). */}
          <div id="contacto-topo" className="mt-5 sm:mt-7 max-w-md rounded-2xl border border-white/10 bg-[#111113] p-4 sm:p-5">
            <p className="text-[15px] font-semibold text-white">{f.formulario.titulo}</p>
            <p className="mb-3 mt-1 text-[13px] leading-snug text-zinc-400">{f.formulario.subtitulo}</p>
            <FormularioFunil chave={f.chave} />
          </div>
          <Link
            href={f.atalho.href}
            className="mt-4 inline-block text-[14px] font-medium text-[#E9C46A] underline-offset-4 hover:underline"
          >
            Já decidiste? {f.atalho.texto} →
          </Link>
        </div>
        <div className="relative hidden aspect-[4/5] w-full overflow-hidden rounded-2xl border border-white/10 md:block">
          <Image src={f.imagem.src} alt={f.imagem.alt} fill priority sizes="(min-width: 768px) 45vw, 100vw" className="object-cover" />
        </div>
      </section>

      {/* Porquê: lista com divisórias, não cartões iguais. */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">Porque faz sentido</h2>
          <dl className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-[1fr_1fr_1fr]">
            {f.pontos.map((p) => (
              <div key={p.titulo} className="border-l-2 border-[#D2A63C]/60 pl-5">
                <dt className="text-[16px] font-semibold text-white">{p.titulo}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-zinc-400">{p.texto}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Como funciona: os três passos em linha, e o passo 1 (o formulário) logo a seguir. */}
      <section id="contacto" className="scroll-mt-6 border-t border-white/10 bg-[#0E0E10]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">Como funciona</h2>
          <ol className="mt-8 grid gap-7 md:grid-cols-3">
            {f.passos.map((p, i) => (
              <li key={p.titulo} className="grid grid-cols-[2.25rem_1fr] gap-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D2A63C]/50 text-[14px] font-semibold text-[#E9C46A]">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[16px] font-semibold text-white">{p.titulo}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-zinc-400">{p.texto}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-12 max-w-md rounded-2xl border border-white/10 bg-[#111113] p-5 sm:p-6">
            <p className="mb-3 text-[15px] font-semibold text-white">{f.formulario.titulo}</p>
            <FormularioFunil chave={f.chave} />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto grid max-w-6xl gap-3 px-4 pb-28 pt-10 text-[12.5px] leading-relaxed text-zinc-500 sm:px-6">
          {f.avisos.map((a) => (
            <p key={a}>{a}</p>
          ))}
          <p>{AVISO_GERAL}</p>
          <p>
            <Link href="/privacidade" className="underline underline-offset-2 hover:text-zinc-300">Privacidade</Link>
            {'  '}
            <Link href="/terms" className="ml-4 underline underline-offset-2 hover:text-zinc-300">Termos</Link>
            <Link href="/aviso-de-risco" className="ml-4 underline underline-offset-2 hover:text-zinc-300">Aviso de risco</Link>
          </p>
        </div>
      </footer>

      <MedicaoConsentida funil={f.chave} conteudo={f.nome} />
    </main>
  )
}
