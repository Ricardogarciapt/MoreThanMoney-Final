/**
 * /cursos/a-primeira-chave — a sala do curso «A Primeira Chave · Programa Completo» (Ruben Pereira).
 * Só quem comprou o produto (ou admin) entra; as 4 línguas abrem com a mesma compra (?l=pt|en|es|fr).
 * Material: slides e caderno de cada um dos 15 módulos + guia do aluno; 20 aulas em vídeo; exame final.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { LINGUAS, PRODUTO_SLUG, indice, podeAbrirCurso, type Lingua } from '@/lib/cursos/primeira-chave'
import { sessaoDoMembro } from '@/lib/marketplace/sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'A Primeira Chave · Sala do curso', robots: { index: false, follow: false } }

const TX: Record<Lingua, Record<string, string>> = {
  pt: { sala: 'Sala do curso', guia: 'Guia do aluno', guiaTxt: 'Como estudar, o plano das 20 aulas e os templates do curso.', aulas: 'As 20 aulas', aulasTxt: 'Os vídeos de cada aula aparecem aqui à medida que são publicados.', modulos: 'Material dos 15 módulos', slides: 'Slides', caderno: 'Caderno', exame: 'Exame final e certificado', exameTxt: 'Quando acabares as 20 aulas, faz o exame. Passas e recebes o certificado com código de verificação.', exameBtn: 'Ir para o exame', abrir: 'Abrir PDF', modulo: 'Módulo', aula: 'Aula', aviso: 'Conteúdo educativo. Não é aconselhamento financeiro. Os criptoativos têm risco de perda, que pode ser total.' },
  en: { sala: 'Course room', guia: 'Student guide', guiaTxt: 'How to study, the 20-lesson plan and the course templates.', aulas: 'The 20 lessons', aulasTxt: 'Each lesson video appears here as soon as it is published.', modulos: 'Material for the 15 modules', slides: 'Slides', caderno: 'Workbook', exame: 'Final exam and certificate', exameTxt: 'When you finish the 20 lessons, take the exam. Pass it and you get a certificate with a verification code.', exameBtn: 'Go to the exam', abrir: 'Open PDF', modulo: 'Module', aula: 'Lesson', aviso: 'Educational content. Not financial advice. Crypto assets carry a risk of loss, which can be total.' },
  es: { sala: 'Sala del curso', guia: 'Guía del alumno', guiaTxt: 'Cómo estudiar, el plan de las 20 clases y las plantillas del curso.', aulas: 'Las 20 clases', aulasTxt: 'Los vídeos de cada clase aparecen aquí a medida que se publican.', modulos: 'Material de los 15 módulos', slides: 'Diapositivas', caderno: 'Cuaderno', exame: 'Examen final y certificado', exameTxt: 'Cuando termines las 20 clases, haz el examen. Si apruebas, recibes el certificado con código de verificación.', exameBtn: 'Ir al examen', abrir: 'Abrir PDF', modulo: 'Módulo', aula: 'Clase', aviso: 'Contenido educativo. No es asesoramiento financiero. Los criptoactivos tienen riesgo de pérdida, que puede ser total.' },
  fr: { sala: 'Salle du cours', guia: "Guide de l'élève", guiaTxt: 'Comment étudier, le plan des 20 leçons et les modèles du cours.', aulas: 'Les 20 leçons', aulasTxt: 'Les vidéos de chaque leçon apparaissent ici dès leur publication.', modulos: 'Matériel des 15 modules', slides: 'Diapositives', caderno: 'Cahier', exame: 'Examen final et certificat', exameTxt: "Quand tu as fini les 20 leçons, passe l'examen. Réussis-le et tu reçois le certificat avec un code de vérification.", exameBtn: "Aller à l'examen", abrir: 'Ouvrir le PDF', modulo: 'Module', aula: 'Leçon', aviso: "Contenu éducatif. Pas un conseil financier. Les crypto-actifs comportent un risque de perte, qui peut être totale." },
}

const pdf = (l: Lingua, p: string) => `/api/cursos/a-primeira-chave/material?l=${l}&p=${p}`

export default async function SalaPrimeiraChave({ searchParams }: { searchParams: Promise<{ l?: string }> }) {
  const { l: pedida } = await searchParams
  const l: Lingua = (LINGUAS as readonly string[]).includes(pedida ?? '') ? (pedida as Lingua) : 'pt'
  if (!(await sessaoDoMembro())) redirect(`/login?redirect=${encodeURIComponent(`/cursos/a-primeira-chave?l=${l}`)}`)
  if (!(await podeAbrirCurso())) redirect(`/marketplace/${PRODUTO_SLUG}`)
  const t = TX[l], ix = indice[l]
  // links não listados do YouTube, escritos pelo publicador do Mac (video/bootcamp/publicar-curso-ruben-youtube.mjs)
  const { data: vids } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', 'curso_primeira_chave_videos').maybeSingle()
  const videos: Record<string, string> = ((vids?.value as Record<string, unknown> | null)?.[l] as Record<string, string>) || {}

  return (
    <main className="min-h-screen bg-[#0a0806] text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-[#D2A63C]">{t.sala} · Ruben Pereira</p>
            <h1 className="mt-2 text-3xl font-bold text-[#E9C46A] sm:text-4xl">{ix.curso} · Programa Completo</h1>
          </div>
          <nav className="flex gap-1 rounded-full border border-[#D2A63C]/30 p-1">
            {LINGUAS.map((x) => (
              <Link key={x} href={`?l=${x}`} className={`rounded-full px-3 py-1 text-sm font-semibold uppercase ${x === l ? 'bg-[#D2A63C] text-black' : 'text-zinc-300 hover:text-[#E9C46A]'}`}>{x}</Link>
            ))}
          </nav>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          <a href={pdf(l, 'guia')} target="_blank" rel="noreferrer" className="rounded-2xl border border-[#D2A63C]/40 bg-gradient-to-br from-[#1a1408] to-[#0f0c07] p-6 hover:border-[#E9C46A]">
            <h2 className="text-lg font-semibold text-[#E9C46A]">{t.guia}</h2>
            <p className="mt-1 text-sm text-zinc-400">{t.guiaTxt}</p>
            <span className="mt-4 inline-block text-sm font-semibold text-[#D2A63C]">{t.abrir} →</span>
          </a>
          <Link href={`/avaliacoes/primeira-chave-${l}`} className="rounded-2xl border border-[#D2A63C]/40 bg-gradient-to-br from-[#1a1408] to-[#0f0c07] p-6 hover:border-[#E9C46A]">
            <h2 className="text-lg font-semibold text-[#E9C46A]">{t.exame}</h2>
            <p className="mt-1 text-sm text-zinc-400">{t.exameTxt}</p>
            <span className="mt-4 inline-block text-sm font-semibold text-[#D2A63C]">{t.exameBtn} →</span>
          </Link>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-[#E9C46A]">{t.aulas}</h2>
          <p className="mb-4 mt-1 text-sm text-zinc-400">{t.aulasTxt}</p>
          <ol className="grid gap-2 sm:grid-cols-2">
            {ix.aulas.map((titulo, i) => (
              <li key={i}>
                {videos[String(i + 1)] ? (
                  <a href={videos[String(i + 1)]} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-[#D2A63C]/40 bg-[#D2A63C]/[0.06] px-4 py-3 hover:border-[#E9C46A]">
                    <span className="w-10 shrink-0 text-sm font-bold text-[#D2A63C]">{String(i + 1).padStart(2, '0')}</span>
                    <span className="flex-1 text-sm text-zinc-100">{titulo}</span>
                    <span className="text-xs font-semibold text-[#E9C46A]">▶</span>
                  </a>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                    <span className="w-10 shrink-0 text-sm font-bold text-[#D2A63C]">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-sm text-zinc-400">{titulo}</span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-semibold text-[#E9C46A]">{t.modulos}</h2>
          <div className="grid gap-3">
            {ix.modulos.map((titulo, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500">{t.modulo} {i + 1}</p>
                  <p className="text-sm font-medium text-zinc-100">{titulo}</p>
                </div>
                <div className="flex gap-2">
                  <a href={pdf(l, `slides-${i + 1}`)} target="_blank" rel="noreferrer" className="rounded-full border border-[#D2A63C]/50 px-3 py-1 text-xs font-semibold text-[#E9C46A] hover:bg-[#D2A63C] hover:text-black">{t.slides}</a>
                  <a href={pdf(l, `caderno-${i + 1}`)} target="_blank" rel="noreferrer" className="rounded-full border border-[#D2A63C]/50 px-3 py-1 text-xs font-semibold text-[#E9C46A] hover:bg-[#D2A63C] hover:text-black">{t.caderno}</a>
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="border-t border-white/10 pt-6 text-xs text-zinc-500">{t.aviso}</p>
      </div>
    </main>
  )
}
