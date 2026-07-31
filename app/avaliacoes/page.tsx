import Link from "next/link"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getAuthenticatedUser } from "@/lib/admin-api-helpers"
import { Award, Rocket, GraduationCap, ShieldCheck, ArrowRight, CheckCircle2, Download } from "lucide-react"
import CertifiedShowcase from "@/components/avaliacoes/certified-showcase"
import CertificateRender from "@/components/avaliacoes/certificate-render"
import type { CertTemplate } from "@/lib/avaliacoes/config"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "Avaliações & Certificados — MoreThanMoney",
  description: "Valida os teus conhecimentos e recebe o teu certificado oficial da MoreThanMoney.",
}

const ICONS: Record<string, any> = { fast_start: Rocket, bootcamp: GraduationCap, teste_final: Award }

export default async function AvaliacoesPage() {
  const supabase = getSupabaseAdmin()
  const { data: assessments } = await supabase
    .from("assessments")
    .select("id, slug, title, subtitle, kind, intro, pass_mark, grade_display, active, sort")
    .eq("active", true)
    .order("sort", { ascending: true })

  const list = assessments || []
  const ids = list.map((a: any) => a.id)

  // contagem de perguntas ativas por avaliação
  const counts: Record<string, number> = {}
  if (ids.length) {
    const { data: qs } = await supabase
      .from("assessment_questions")
      .select("assessment_id")
      .in("assessment_id", ids)
      .eq("active", true)
    for (const q of qs || []) counts[q.assessment_id] = (counts[q.assessment_id] || 0) + 1
  }

  // certificados já emitidos ao utilizador autenticado
  const passedBySlug: Record<string, { cert_code: string; cert_url: string | null; name: string; grade_value: number | null }> = {}
  const auth = await getAuthenticatedUser()
  if (auth.userId) {
    const { data: attempts } = await supabase
      .from("assessment_attempts")
      .select("assessment_slug, cert_code, cert_url, name, grade_value, created_at")
      .eq("user_id", auth.userId)
      .eq("passed", true)
      .order("created_at", { ascending: false })
    for (const a of attempts || []) {
      if (!passedBySlug[a.assessment_slug])
        passedBySlug[a.assessment_slug] = { cert_code: a.cert_code, cert_url: a.cert_url, name: a.name, grade_value: a.grade_value }
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#D2A63C]/15">
        <div className="absolute inset-0 bg-gradient-to-b from-[#D2A63C]/10 to-transparent" />
        <div className="relative mx-auto max-w-5xl px-4 py-16 text-center md:py-20">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-[#D2A63C]/30 bg-[#D2A63C]/10 px-4 py-1.5 text-xs font-medium text-[#D2A63C]">
            <ShieldCheck className="h-3.5 w-3.5" /> Certificação oficial MoreThanMoney
          </div>
          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">Avaliações &amp; Certificados</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-gray-300 md:text-lg">
            Valida o que aprendeste em cada etapa da tua formação. Ao concluíres com aproveitamento, recebes o teu
            certificado oficial — com preenchimento automático e uma cópia enviada para o teu email.
          </p>
        </div>
      </section>

      {/* Cards */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold text-white md:text-2xl">Escolhe a tua avaliação e começa</h2>
          <p className="mt-1 text-sm text-gray-400">Responde ao quiz e recebe o certificado no teu email — leva poucos minutos.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {list.map((a: any, i: number) => {
            const Icon = ICONS[a.kind] || GraduationCap
            const total = counts[a.id] || 0
            const done = passedBySlug[a.slug]
            return (
              <div
                key={a.id}
                className="flex flex-col rounded-2xl border border-[#D2A63C]/20 bg-gradient-to-br from-gray-950 to-black p-6 transition-colors hover:border-[#D2A63C]/50"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="rounded-xl bg-[#D2A63C]/15 p-3 ring-1 ring-[#D2A63C]/25">
                    <Icon className="h-6 w-6 text-[#D2A63C]" />
                  </div>
                  <span className="text-xs font-semibold text-gray-500">Etapa {i + 1}</span>
                </div>
                <h2 className="text-lg font-bold leading-tight">{a.title}</h2>
                {a.subtitle && <p className="mt-1 text-sm text-[#D2A63C]/80">{a.subtitle}</p>}
                <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-400">{a.intro}</p>

                <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-gray-400">
                  <span className="rounded-md bg-white/5 px-2 py-1">{total} perguntas</span>
                  <span className="rounded-md bg-white/5 px-2 py-1">Aprovação ≥ {Number(a.pass_mark)}%</span>
                  {a.grade_display === "valores20" && (
                    <span className="rounded-md bg-white/5 px-2 py-1">Nota em valores /20</span>
                  )}
                </div>

                {done ? (
                  <div className="mt-5 space-y-2">
                    <CertificateRender
                      template={a.slug as CertTemplate}
                      courseTitle={a.title}
                      name={done.name}
                      gradeText={
                        a.grade_display === "valores20" && done.grade_value != null
                          ? `${Number(done.grade_value).toFixed(1).replace(".", ",")} valores`
                          : null
                      }
                    />
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" /> Certificado emitido
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={`/api/avaliacoes/certificado/${done.cert_code}?dl=1`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#D2A63C]/40 px-3 py-2 text-sm font-semibold text-[#D2A63C] hover:bg-[#D2A63C]/10"
                      >
                        <Download className="h-4 w-4" /> Descarregar
                      </a>
                      <Link
                        href={`/avaliacoes/${a.slug}`}
                        className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-white"
                      >
                        Repetir
                      </Link>
                    </div>
                  </div>
                ) : (
                  <Link
                    href={`/avaliacoes/${a.slug}`}
                    className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#D2A63C] to-[#BB8525] px-4 py-2.5 text-sm font-semibold text-black transition-transform hover:scale-[1.02]"
                  >
                    Iniciar avaliação <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        {list.length === 0 && (
          <p className="text-center text-sm text-gray-500">Ainda não há avaliações disponíveis.</p>
        )}
      </section>

      {/* Vitrine de alunos certificados (prova social) */}
      <section className="border-t border-[#D2A63C]/10 bg-gradient-to-b from-[#D2A63C]/5 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <CertifiedShowcase />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-12">
        <p className="mx-auto max-w-2xl text-center text-xs text-gray-500">
          Já tens um certificado? Podes validar a sua autenticidade em{" "}
          <Link href="/avaliacoes/validar" className="text-[#D2A63C] hover:underline">
            /avaliacoes/validar
          </Link>
          .
        </p>
      </section>
    </main>
  )
}
