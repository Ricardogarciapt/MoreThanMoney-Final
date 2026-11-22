/**
 * Pacote de conteúdo de um educador (guião de reel, carrossel, stories, capas), pronto a copiar.
 * Acesso por link assinado (?t=), enviado por e-mail/DM — ver lib/educadores/conteudo.ts.
 * Os textos estão na língua do educador (o Ruben recebe em francês).
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { verificarPacote, urlCapa, type Pacote } from '@/lib/educadores/conteudo'
import { Copiar } from './copiar'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Contenu prêt à publier · MoreThanMoney', robots: { index: false, follow: false } }

const T = {
  fr: { reel: 'Reel', gancho: 'Accroche (les 2 premières secondes)', guiao: 'Script', ecra: "Textes à l'écran", legenda: 'Légende', carrossel: 'Carrousel', slide: 'Slide', stories: 'Stories', capas: 'Couvertures', baixar: 'Ouvrir / télécharger', cta: 'Appel à l’action', notas: 'Conseils', tudo: 'Tout copier', aviso: 'Contenu éducatif, ne constitue pas un conseil financier.' },
  pt: { reel: 'Reel', gancho: 'Gancho (2 primeiros segundos)', guiao: 'Guião', ecra: 'Textos no ecrã', legenda: 'Legenda', carrossel: 'Carrossel', slide: 'Slide', stories: 'Stories', capas: 'Capas', baixar: 'Abrir / descarregar', cta: 'CTA', notas: 'Dicas', tudo: 'Copiar tudo', aviso: 'Conteúdo educativo, não constitui consultoria financeira.' },
}

function Bloco({ titulo, children, copiar }: { titulo: string; children: React.ReactNode; copiar?: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[#E9C46A]">{titulo}</h2>
        {copiar ? <Copiar texto={copiar} /> : null}
      </div>
      {children}
    </section>
  )
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params
  const { t } = await searchParams
  if (!/^[0-9a-f-]{36}$/.test(id) || !verificarPacote(id, t)) notFound()
  const { data } = await getSupabaseAdmin().from('educador_conteudo').select('educador, lingua, data, tema, pacote').eq('id', id).maybeSingle()
  if (!data) notFound()
  const p = data.pacote as Pacote
  const L = T[data.lingua as keyof typeof T] ?? T.pt
  const hashtags = (h?: string[]) => (h?.length ? '\n\n' + h.map((x) => (x.startsWith('#') ? x : `#${x}`)).join(' ') : '')
  const legendaReel = p.reel ? p.reel.legenda + hashtags(p.reel.hashtags) : ''
  const legendaCarrossel = p.carrossel ? p.carrossel.legenda + hashtags(p.carrossel.hashtags) : ''
  const capas: { url: string; nome: string }[] = []
  if (p.reel?.capa) capas.push({ nome: `${L.reel}`, url: urlCapa({ educador: data.educador, titulo: p.reel.capa.titulo, subtitulo: p.reel.capa.subtitulo, formato: 'reel' }) })
  p.carrossel?.slides.forEach((s, i) =>
    capas.push({ nome: `${L.slide} ${i + 1}`, url: urlCapa({ educador: data.educador, titulo: s.titulo, subtitulo: s.texto, formato: 'post', n: `${i + 1}/${p.carrossel!.slides.length}` }) }),
  )
  p.stories?.forEach((s, i) => capas.push({ nome: `Story ${i + 1}`, url: urlCapa({ educador: data.educador, titulo: s.texto, subtitulo: s.sticker, formato: 'story' }) }))

  return (
    <main className="min-h-screen bg-[#0b0b0d] px-4 py-8 text-neutral-200">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <header>
          <p className="text-xs uppercase tracking-[0.25em] text-[#D2A63C]">MoreThanMoney · {data.data}</p>
          <h1 className="mt-2 text-2xl font-extrabold italic text-white">{data.tema}</h1>
        </header>

        {p.reel ? (
          <Bloco titulo={`🎬 ${L.reel}${p.reel.duracao_s ? ` · ~${p.reel.duracao_s}s` : ''}`}>
            <p className="text-sm text-neutral-400">{L.gancho}</p>
            <p className="mb-4 mt-1 text-lg font-semibold text-white">{p.reel.gancho}</p>
            <div className="mb-2 flex items-center justify-between"><p className="text-sm text-neutral-400">{L.guiao}</p><Copiar texto={p.reel.guiao.join('\n')} /></div>
            <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed">{p.reel.guiao.map((g, i) => <li key={i}>{g}</li>)}</ol>
            {p.reel.legenda_ecra?.length ? (
              <>
                <p className="mb-1 text-sm text-neutral-400">{L.ecra}</p>
                <ul className="mb-4 space-y-1 text-[15px]">{p.reel.legenda_ecra.map((g, i) => <li key={i}>▸ {g}</li>)}</ul>
              </>
            ) : null}
            <div className="mb-1 flex items-center justify-between"><p className="text-sm text-neutral-400">{L.legenda}</p><Copiar texto={legendaReel} /></div>
            <pre className="whitespace-pre-wrap rounded-lg bg-black/40 p-3 font-sans text-[15px] leading-relaxed">{legendaReel}</pre>
          </Bloco>
        ) : null}

        {p.carrossel ? (
          <Bloco titulo={`🖼️ ${L.carrossel}`} copiar={legendaCarrossel}>
            <ol className="mb-4 space-y-2">{p.carrossel.slides.map((s, i) => <li key={i} className="rounded-lg bg-black/30 p-3"><b className="text-white">{i + 1}. {s.titulo}</b>{s.texto ? <span className="block text-sm text-neutral-300">{s.texto}</span> : null}</li>)}</ol>
            <p className="mb-1 text-sm text-neutral-400">{L.legenda}</p>
            <pre className="whitespace-pre-wrap rounded-lg bg-black/40 p-3 font-sans text-[15px] leading-relaxed">{legendaCarrossel}</pre>
          </Bloco>
        ) : null}

        {p.stories?.length ? (
          <Bloco titulo={`📱 ${L.stories}`}>
            <ol className="space-y-2">{p.stories.map((s, i) => <li key={i} className="flex items-start justify-between gap-3 rounded-lg bg-black/30 p-3"><span><b className="text-white">{i + 1}.</b> {s.texto}{s.sticker ? <span className="block text-sm text-[#E9C46A]">Sticker : {s.sticker}</span> : null}</span><Copiar texto={s.texto} /></li>)}</ol>
          </Bloco>
        ) : null}

        {capas.length ? (
          <Bloco titulo={`✨ ${L.capas}`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {capas.map((c) => (
                <a key={c.url} href={c.url} target="_blank" rel="noreferrer" className="group block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt={c.nome} loading="lazy" className="w-full rounded-lg border border-white/10 group-hover:border-[#D2A63C]" />
                  <span className="mt-1 block text-xs text-neutral-400">{c.nome} · {L.baixar}</span>
                </a>
              ))}
            </div>
          </Bloco>
        ) : null}

        {p.cta ? <Bloco titulo={`🎯 ${L.cta}`} copiar={p.cta}><p>{p.cta}</p></Bloco> : null}
        {p.notas ? <Bloco titulo={`💡 ${L.notas}`}><p className="whitespace-pre-wrap text-[15px] leading-relaxed">{p.notas}</p></Bloco> : null}

        <p className="pb-6 text-center text-xs text-neutral-500">{L.aviso}</p>
      </div>
    </main>
  )
}
