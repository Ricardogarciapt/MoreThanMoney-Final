/**
 * /ebooks/<slug> — página de venda de um e-book da casa.
 *
 * O preço e o estado vêm do marketplace (a fonte de verdade); a compra faz-se na ficha
 * /marketplace/<slug>, que já tem checkout, cupões e Biblioteca. Um e-book em rascunho não tem
 * página pública (só com ?previa=1, para a equipa rever).
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ehEbook, partesEbook, type LinguaEbook } from '@/lib/ebooks/acesso'
import { VENDAS } from '@/lib/ebooks/vendas'
import { EBOOKS_GRATIS } from '@/lib/ebooks/gratis'
import FormGratis from '@/components/ebooks/form-gratis'

export const revalidate = 300

// textos fixos da página, por língua (o conteúdo do livro vem de VENDAS)
const TX = {
  pt: { loc: 'pt-PT', previa: '{t.previa}', quero: 'Quero o e-book', formato: 'PDF + versão interativa · acesso imediato', capaAlt: 'Capa do e-book', dentro: 'O que está lá dentro', paginasAlt: 'Três páginas do interior do e-book', paginasNota: 'Na versão interativa, os gráficos desenham-se à tua frente enquanto lês, no telemóvel ou no computador.', paraTi: 'É para ti se…', naoE: 'O que não é', quem: 'Quem escreve', faq: 'Perguntas frequentes', comprar: 'Comprar', por: 'por', meta: (a: string) => `e-book de ${a}`, lingua: 'Ler noutra língua' },
  en: { loc: 'en-GB', previa: 'Preview: this e-book is not on sale yet.', quero: 'I want the e-book', formato: 'PDF + interactive version · instant access', capaAlt: 'Cover of the e-book', dentro: "What's inside", paginasAlt: 'Three pages from inside the e-book', paginasNota: 'In the interactive version, the charts draw themselves as you read, on your phone or computer.', paraTi: "It's for you if…", naoE: 'What it is not', quem: 'Who wrote it', faq: 'Frequently asked questions', comprar: 'Buy', por: 'for', meta: (a: string) => `e-book by ${a}`, lingua: 'Read in another language' },
  es: { loc: 'es-ES', previa: 'Vista previa: este e-book aún no está a la venta.', quero: 'Quiero el e-book', formato: 'PDF + versión interactiva · acceso inmediato', capaAlt: 'Portada del e-book', dentro: 'Lo que hay dentro', paginasAlt: 'Tres páginas del interior del e-book', paginasNota: 'En la versión interactiva, los gráficos se dibujan mientras lees, en el móvil o en el ordenador.', paraTi: 'Es para ti si…', naoE: 'Lo que no es', quem: 'Quién lo escribe', faq: 'Preguntas frecuentes', comprar: 'Comprar', por: 'por', meta: (a: string) => `e-book de ${a}`, lingua: 'Leer en otro idioma' },
} as const satisfies Record<LinguaEbook, unknown>
const NOMES_LINGUA: Record<LinguaEbook, string> = { pt: 'PT', en: 'EN', es: 'ES' }

async function produto(slug: string) {
  const { data } = await getSupabaseAdmin().from('marketplace_produtos')
    .select('slug, preco_cents, estado, activo').eq('slug', slug).maybeSingle()
  return data as { slug: string; preco_cents: number; estado: string; activo: boolean } | null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  if (!ehEbook(slug)) return {}
  const v = VENDAS[slug]
  const img = `https://www.morethanmoney.pt/marketplace/ebooks/${slug}-3d.png`
  return {
    title: `${v.titulo} ${v.titulo2} · ${TX[partesEbook(slug).lingua].meta(v.autor)} | MoreThanMoney`,
    description: v.sub,
    openGraph: { title: `${v.titulo} ${v.titulo2}`, description: v.gancho, images: [img] },
  }
}

const euros = (c: number, loc = 'pt-PT') => (c / 100).toLocaleString(loc, { style: 'currency', currency: 'EUR', minimumFractionDigits: c % 100 ? 2 : 0 })

export default async function PaginaEbook({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params
  const sp = await searchParams
  if (!ehEbook(slug)) notFound()
  const p = await produto(slug)
  const publicado = p?.estado === 'publicado' && p.activo
  if (!publicado && sp.previa !== '1') notFound()
  const v = VENDAS[slug]
  const { base, lingua } = partesEbook(slug)
  const t = TX[lingua]
  const versoes = (['pt', 'en', 'es'] as LinguaEbook[]).map((l) => ({ l, slug: l === 'pt' ? base : `${base}-${l}` })).filter((x) => ehEbook(x.slug))
  const preco = p ? euros(p.preco_cents, t.loc) : ''
  const comprar = `/marketplace/${slug}`
  const estilo = { ['--c' as string]: v.cor, ['--c2' as string]: v.cor2, background: v.fundo } as React.CSSProperties
  const T = { fontFamily: v.fonteTitulo }

  return (
    <main lang={t.loc} style={estilo} className="min-h-screen text-[#f3ede2] [&_::selection]:bg-[var(--c)]">
      {!publicado && <div className="bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black">Pré-visualização: este e-book ainda não está à venda.</div>}

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[640px] w-[640px] rounded-full opacity-25 blur-3xl" style={{ background: `radial-gradient(closest-side, ${v.cor}, transparent)` }} />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-14 md:grid-cols-[1.1fr_1fr] md:pt-24">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: v.cor2 }}>E-book · {v.autor}</p>
              <nav aria-label={t.lingua} className="flex gap-1 rounded-full border border-white/15 p-1 text-xs font-bold">
                {versoes.map((x) => (
                  <Link key={x.l} href={`/ebooks/${x.slug}`} hrefLang={x.l} className="rounded-full px-3 py-1" style={x.l === lingua ? { background: v.cor, color: '#000' } : { color: 'rgba(255,255,255,.7)' }}>{NOMES_LINGUA[x.l]}</Link>
                ))}
              </nav>
            </div>
            <h1 className="mt-4 text-5xl leading-[0.92] md:text-7xl" style={T}>
              <span className="block uppercase" style={base === 'destrui-tudo-e-ainda-bem' || base === 'o-metodo-frio' ? {} : { textTransform: 'none' }}>{v.titulo}</span>
              <span className="block" style={{ color: v.cor, fontStyle: base === 'so-as-maos' ? 'italic' : 'normal' }}>{v.titulo2}</span>
            </h1>
            <p className="mt-6 text-2xl font-semibold leading-snug text-white md:text-3xl">{v.gancho}</p>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">{v.sub}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href={comprar} className="rounded-full px-7 py-4 text-base font-bold text-black shadow-lg transition hover:-translate-y-0.5" style={{ background: `linear-gradient(90deg, ${v.cor}, ${v.cor2})` }}>
                {t.quero}{preco ? ` · ${preco}` : ''}
              </Link>
              <span className="text-sm text-white/55">{t.formato}</span>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/marketplace/ebooks/${slug}-3d.png`} alt={`${t.capaAlt} ${v.titulo} ${v.titulo2}`} className="w-full drop-shadow-2xl [animation:flutuar_7s_ease-in-out_infinite]" />
          </div>
        </div>
        <style>{`@keyframes flutuar{50%{transform:translateY(-10px) rotate(-1deg)}}@media (prefers-reduced-motion:reduce){img{animation:none!important}}`}</style>
      </section>

      {/* NÚMEROS DO LIVRO */}
      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 md:grid-cols-4">
          {v.numeros.map((n) => (
            <div key={n.r} className="text-center">
              <div className="text-4xl md:text-5xl" style={{ ...T, color: v.cor }}>{n.v}</div>
              <div className="mt-1 text-sm uppercase tracking-widest text-white/60">{n.r}</div>
            </div>
          ))}
        </div>
      </section>

      {/* DENTRO DO LIVRO */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl md:text-5xl" style={T}>{t.dentro}</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-2">
          {v.capitulos.map((c, i) => (
            <li key={c.t} className="group flex gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[var(--c)]">
              <span className="text-3xl leading-none" style={{ ...T, color: 'transparent', WebkitTextStroke: `1.5px ${v.cor}` }}>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="text-lg font-bold text-white">{c.t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/65">{c.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* PÁGINAS */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="overflow-hidden rounded-3xl border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/marketplace/ebooks/${slug}-paginas.jpg`} alt={t.paginasAlt} className="w-full" loading="lazy" />
        </div>
        <p className="mt-4 text-center text-sm text-white/55">{t.paginasNota}</p>
      </section>

      {/* PARA QUEM */}
      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 md:grid-cols-2">
        <div className="rounded-3xl p-7" style={{ background: `linear-gradient(160deg, ${v.cor}22, transparent)`, border: `1px solid ${v.cor}55` }}>
          <h2 className="text-2xl md:text-3xl" style={T}>{t.paraTi}</h2>
          <ul className="mt-5 space-y-3">{v.paraQuem.map((x) => <li key={x} className="flex gap-3 text-white/85"><span style={{ color: v.cor }}>●</span>{x}</li>)}</ul>
        </div>
        <div className="rounded-3xl border border-white/10 p-7">
          <h2 className="text-2xl md:text-3xl" style={T}>{t.naoE}</h2>
          <ul className="mt-5 space-y-3">{v.naoE.map((x) => <li key={x} className="flex gap-3 text-white/70"><span className="text-white/40">✕</span>{x}</li>)}</ul>
        </div>
      </section>

      {/* AUTOR */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="flex flex-col items-center gap-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:flex-row">
          {v.autorFoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.autorFoto} alt={v.autor} className="h-40 w-40 shrink-0 rounded-full object-cover object-top" style={{ boxShadow: `0 0 0 4px ${v.cor}` }} />
          ) : (
            <div className="grid h-40 w-40 shrink-0 place-items-center rounded-full text-6xl" style={{ ...T, background: `${v.cor}22`, color: v.cor2, fontStyle: 'italic' }} aria-hidden>{v.autor.split(' ').map((x) => x[0]).join('')}</div>
          )}
          <div>
            <p className="text-xs uppercase tracking-[0.3em]" style={{ color: v.cor2 }}>{t.quem}</p>
            <h2 className="mt-2 text-3xl" style={T}>{v.autor}</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-white/75">{v.autorBio}</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 pb-16">
        <h2 className="text-3xl md:text-4xl" style={T}>{t.faq}</h2>
        <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
          {v.faq.map((f) => (
            <details key={f.p} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-white">{f.p}<span className="transition group-open:rotate-45" style={{ color: v.cor }}>+</span></summary>
              <p className="mt-3 text-white/70">{f.r}</p>
            </details>
          ))}
        </div>
      </section>

      {/* DUAS FORMAS DE O TER (5 € com acompanhamento, ou grátis por contacto) */}
      {EBOOKS_GRATIS.has(slug) && (
        <section id="gratis" className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 md:grid-cols-2">
          <div className="rounded-[2rem] p-8" style={{ background: `linear-gradient(135deg, ${v.cor}2a, transparent)`, border: `1px solid ${v.cor}88` }}>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: v.cor2 }}>Com acompanhamento</p>
            <h3 className="mt-3 text-3xl" style={T}>{preco} · e-book + 7 dias comigo</h3>
            <ul className="mt-5 space-y-2 text-white/75">
              <li>✓ PDF e versão interativa, acesso imediato</li>
              <li>✓ 7 dias de acompanhamento direto: marcas a conversa na agenda</li>
              <li>✓ Fica na tua Biblioteca</li>
            </ul>
            <Link href={comprar} className="mt-8 inline-block rounded-full px-7 py-4 font-bold text-black" style={{ background: `linear-gradient(90deg, ${v.cor}, ${v.cor2})` }}>Comprar por {preco}</Link>
          </div>
          <div className="rounded-[2rem] border border-white/12 bg-white/[0.03] p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/55">Grátis</p>
            <h3 className="mt-3 text-3xl" style={T}>Só o e-book</h3>
            <p className="mt-3 mb-6 text-white/65">Em troca do teu email, WhatsApp e quatro respostas rápidas. Não inclui os 7 dias de acompanhamento.</p>
            <FormGratis slug={slug} />
          </div>
        </section>
      )}

      {/* CTA FINAL */}
      <section className="px-4 pb-20">
        <div className="mx-auto max-w-4xl rounded-[2rem] p-10 text-center" style={{ background: `linear-gradient(135deg, ${v.cor}33, ${v.cor2}11)`, border: `1px solid ${v.cor}66` }}>
          <h2 className="text-3xl md:text-5xl" style={T}>{v.titulo} <span style={{ color: v.cor }}>{v.titulo2}</span></h2>
          <p className="mx-auto mt-4 max-w-xl text-white/75">{v.sub}</p>
          <Link href={comprar} className="mt-8 inline-block rounded-full px-8 py-4 text-lg font-bold text-black" style={{ background: `linear-gradient(90deg, ${v.cor}, ${v.cor2})` }}>
            {t.comprar}{preco ? ` ${t.por} ${preco}` : ''}
          </Link>
          <p className="mx-auto mt-8 max-w-2xl text-xs leading-relaxed text-white/45">{v.aviso}</p>
        </div>
      </section>
    </main>
  )
}
